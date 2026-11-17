//! Lógica del instalador propio.
//!
//! No reimplementa la instalación: lleva dentro el instalador NSIS oficial que genera
//! Tauri y lo ejecuta en modo silencioso (`/S`). Así se conservan intactos el
//! desinstalador, la entrada en «Aplicaciones instaladas», los accesos directos y,
//! sobre todo, el actualizador automático, que sigue usando ese mismo NSIS.
//!
//! El progreso es real: se mide cuánto del ejecutable de la app ya está escrito en disco.

use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::Duration,
};

use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

/// Instalador NSIS de la app, incrustado al compilar (ver `build.rs`).
static PAYLOAD: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/payload-setup.exe"));

/// Tamaño en bytes del ejecutable de la app instalado (0 si no se conoce).
const APP_SIZE: &str = env!("CARTUCHO_APP_SIZE");

/// Nombre del producto: carpeta por defecto, acceso directo y clave del registro de NSIS.
const PRODUCT: &str = "Cartucho Music";

/// Clave que escribe el NSIS de Tauri al instalar en modo «usuario actual».
#[cfg(windows)]
const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Cartucho Music";

#[derive(Default)]
pub struct InstallState {
    running: AtomicBool,
    /// Ejecutable de la app instalada; solo se rellena tras una instalación correcta.
    installed_exe: Mutex<Option<PathBuf>>,
}

impl InstallState {
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExistingInstall {
    version: String,
    dir: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallerInfo {
    version: String,
    default_dir: String,
    existing: Option<ExistingInstall>,
    /// `false` si este ejecutable se compiló sin la app dentro.
    payload_ok: bool,
    /// Espacio aproximado que ocupará la app instalada, en bytes (0 si no se conoce).
    required_bytes: u64,
}

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum InstallEvent {
    Stage { stage: &'static str },
    Progress { fraction: f64 },
    Finished,
    Failed { message: String },
}

fn app_size() -> u64 {
    APP_SIZE.parse().unwrap_or(0)
}

fn payload_ok() -> bool {
    PAYLOAD.len() > 4096 && PAYLOAD.starts_with(b"MZ")
}

#[tauri::command]
pub fn installer_info(app: AppHandle) -> InstallerInfo {
    let existing = find_existing();
    let default_dir = match &existing {
        Some(e) => e.dir.clone(),
        None => app
            .path()
            .local_data_dir()
            .map(|d| d.join(PRODUCT).display().to_string())
            .unwrap_or_default(),
    };
    InstallerInfo {
        version: app.package_info().version.to_string(),
        default_dir,
        existing,
        payload_ok: payload_ok(),
        required_bytes: app_size(),
    }
}

/// Abre el selector de carpetas. Devuelve la carpeta elegida + `Cartucho Music`
/// (como hacen los instaladores habituales), salvo que ya se llame así.
#[tauri::command]
pub async fn pick_folder(app: AppHandle, current: String) -> Option<String> {
    let mut dialog = app.dialog().file().set_title("Elige dónde instalar Cartucho Music");
    if let Some(parent) = Path::new(&current).parent().filter(|p| p.is_dir()) {
        dialog = dialog.set_directory(parent);
    }
    let picked = dialog.blocking_pick_folder()?.into_path().ok()?;
    let dir = if picked.file_name().is_some_and(|n| n == PRODUCT) {
        picked
    } else {
        picked.join(PRODUCT)
    };
    Some(dir.display().to_string())
}

#[tauri::command]
pub fn start_install(
    app: AppHandle,
    state: State<'_, InstallState>,
    dir: String,
    desktop_shortcut: bool,
    on_event: Channel<InstallEvent>,
) -> Result<(), String> {
    if !payload_ok() {
        return Err("Este instalador está incompleto: no lleva la aplicación dentro. Descárgalo de nuevo desde la página de Releases.".into());
    }
    let dir = validate_dir(&dir)?;
    if state.running.swap(true, Ordering::SeqCst) {
        return Err("La instalación ya está en marcha.".into());
    }
    *state.installed_exe.lock().unwrap() = None;

    thread::spawn(move || {
        let result = run_install(&app, &dir, desktop_shortcut, &on_event);
        let state = app.state::<InstallState>();
        match result {
            Ok(exe) => {
                *state.installed_exe.lock().unwrap() = exe;
                state.running.store(false, Ordering::SeqCst);
                let _ = on_event.send(InstallEvent::Progress { fraction: 1.0 });
                let _ = on_event.send(InstallEvent::Finished);
            }
            Err(message) => {
                state.running.store(false, Ordering::SeqCst);
                let _ = on_event.send(InstallEvent::Failed { message });
            }
        }
    });
    Ok(())
}

/// Abre la app recién instalada. Solo funciona después de una instalación correcta.
#[tauri::command]
pub fn launch_app(state: State<'_, InstallState>) -> Result<(), String> {
    let exe = state
        .installed_exe
        .lock()
        .unwrap()
        .clone()
        .ok_or("No se encontró Cartucho Music instalado.")?;
    let mut cmd = Command::new(&exe);
    if let Some(dir) = exe.parent() {
        cmd.current_dir(dir);
    }
    cmd.spawn().map(|_| ()).map_err(|e| format!("No se pudo abrir Cartucho Music: {e}"))
}

/// Comprueba la carpeta de destino y que se pueda escribir en ella (crea la carpeta si falta).
fn validate_dir(raw: &str) -> Result<PathBuf, String> {
    let raw = raw.trim().trim_end_matches(['\\', '/']);
    if raw.is_empty() {
        return Err("Elige una carpeta de instalación.".into());
    }
    let path = PathBuf::from(raw);
    if !path.is_absolute() {
        return Err("La carpeta de instalación debe ser una ruta completa, por ejemplo C:\\Usuarios\\tú\\Cartucho Music.".into());
    }
    if raw.len() > 200 {
        return Err("La ruta de instalación es demasiado larga.".into());
    }
    // NSIS recibe la ruta sin comillas (`/D=` debe ir así), de modo que se rechazan caracteres
    // que Windows tampoco admite en nombres de carpeta.
    let without_drive = raw.get(2..).unwrap_or("");
    if raw.contains(['"', '<', '>', '|', '?', '*']) || without_drive.contains(':') {
        return Err("La ruta contiene caracteres no válidos.".into());
    }
    fs::create_dir_all(&path)
        .map_err(|e| format!("No se pudo crear la carpeta de instalación: {e}"))?;
    let probe = path.join(".cartucho-installer-probe");
    fs::write(&probe, b"ok").map_err(|_| {
        "No tienes permiso para escribir en esa carpeta. Elige otra (por ejemplo, dentro de tu carpeta de usuario).".to_string()
    })?;
    let _ = fs::remove_file(&probe);
    Ok(path)
}

fn run_install(
    app: &AppHandle,
    dir: &Path,
    desktop_shortcut: bool,
    events: &Channel<InstallEvent>,
) -> Result<Option<PathBuf>, String> {
    let _ = events.send(InstallEvent::Stage { stage: "preparing" });

    let setup = std::env::temp_dir().join(format!(
        "cartucho-music-{}-setup-{}.exe",
        app.package_info().version,
        std::process::id()
    ));
    fs::write(&setup, PAYLOAD).map_err(|e| format!("No se pudo preparar la instalación: {e}"))?;
    let result = run_setup(app, &setup, dir, desktop_shortcut, events);
    // Windows puede tardar un instante en soltar el ejecutable.
    for _ in 0..10 {
        if fs::remove_file(&setup).is_ok() || !setup.exists() {
            break;
        }
        thread::sleep(Duration::from_millis(200));
    }
    result
}

#[cfg(not(windows))]
fn run_setup(
    _app: &AppHandle,
    _setup: &Path,
    _dir: &Path,
    _desktop_shortcut: bool,
    _events: &Channel<InstallEvent>,
) -> Result<Option<PathBuf>, String> {
    Err("Este instalador solo funciona en Windows.".into())
}

#[cfg(windows)]
fn run_setup(
    app: &AppHandle,
    setup: &Path,
    dir: &Path,
    desktop_shortcut: bool,
    events: &Channel<InstallEvent>,
) -> Result<Option<PathBuf>, String> {
    use std::os::windows::process::CommandExt;

    // El NSIS de Tauri crea el acceso del escritorio también en modo silencioso, y `/NS`
    // quitaría además el del menú Inicio. Si el usuario no lo quiere, se borra después,
    // pero solo si no existía antes (no se toca uno que ya tuviera).
    let desktop_lnk = app.path().desktop_dir().ok().map(|d| d.join(format!("{PRODUCT}.lnk")));
    let lnk_existed = desktop_lnk.as_ref().is_some_and(|p| p.exists());

    let initial = dir_size(dir);
    let _ = events.send(InstallEvent::Stage { stage: "copying" });

    // `/D=` debe ser el último argumento y sin comillas: de ahí `raw_arg`.
    let mut child = Command::new(setup)
        .arg("/S")
        .raw_arg(format!("/D={}", dir.display()))
        .spawn()
        .map_err(|e| format!("No se pudo iniciar la instalación: {e}"))?;

    let expected = app_size() as f64;
    // En una instalación nueva se mide desde el principio. Si se reinstala encima, el
    // ejecutable viejo ya ocupa su tamaño: se empieza a medir cuando NSIS lo vacía.
    let mut armed = initial == 0;
    let mut best = 0.0_f64;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {}
            Err(e) => return Err(format!("Se perdió el control de la instalación: {e}")),
        }
        if expected > 0.0 {
            let now = dir_size(dir);
            if !armed && now < initial {
                armed = true;
            }
            if armed {
                let fraction = (now as f64 / expected).min(0.97);
                if fraction > best + 0.004 {
                    best = fraction;
                    let _ = events.send(InstallEvent::Progress { fraction });
                }
            }
        }
        thread::sleep(Duration::from_millis(120));
    };

    match status.code() {
        Some(0) => {}
        Some(2) => {
            return Err("La instalación se detuvo. Si Cartucho Music está abierto, ciérralo y vuelve a intentarlo.".into())
        }
        Some(code) => return Err(format!("La instalación terminó con un error (código {code}).")),
        None => return Err("La instalación se interrumpió.".into()),
    }
    let _ = events.send(InstallEvent::Stage { stage: "finishing" });

    if !desktop_shortcut && !lnk_existed {
        if let Some(lnk) = desktop_lnk {
            let _ = fs::remove_file(lnk);
        }
    }

    Ok(installed_exe(dir))
}

/// Suma el tamaño de los archivos de la carpeta (y subcarpetas).
#[cfg(windows)]
fn dir_size(dir: &Path) -> u64 {
    fn walk(dir: &Path, depth: u8) -> u64 {
        let Ok(entries) = fs::read_dir(dir) else { return 0 };
        entries
            .flatten()
            .map(|e| match e.metadata() {
                Ok(m) if m.is_file() => m.len(),
                Ok(m) if m.is_dir() && depth < 4 => walk(&e.path(), depth + 1),
                _ => 0,
            })
            .sum()
    }
    walk(dir, 0)
}

/// Ejecutable de la app según el registro que deja NSIS; si no, el primer `.exe` que no
/// sea el desinstalador.
#[cfg(windows)]
fn installed_exe(dir: &Path) -> Option<PathBuf> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let from_registry = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(UNINSTALL_KEY)
        .and_then(|k| k.get_value::<String, _>("MainBinaryName"))
        .ok()
        .map(|name| dir.join(name))
        .filter(|p| p.is_file());
    from_registry.or_else(|| {
        fs::read_dir(dir).ok()?.flatten().map(|e| e.path()).find(|p| {
            p.extension().is_some_and(|x| x.eq_ignore_ascii_case("exe"))
                && !p.file_stem().is_some_and(|s| s.eq_ignore_ascii_case("uninstall"))
        })
    })
}

#[cfg(windows)]
fn find_existing() -> Option<ExistingInstall> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let key = RegKey::predef(HKEY_CURRENT_USER).open_subkey(UNINSTALL_KEY).ok()?;
    let version: String = key.get_value("DisplayVersion").ok()?;
    let location: String = key.get_value("InstallLocation").ok()?;
    let dir = location.trim().trim_matches('"').to_string();
    Path::new(&dir).is_dir().then_some(ExistingInstall { version, dir })
}

#[cfg(not(windows))]
fn find_existing() -> Option<ExistingInstall> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rechaza_rutas_relativas_y_vacias() {
        assert!(validate_dir("").is_err());
        assert!(validate_dir("   ").is_err());
        assert!(validate_dir("relativa\\carpeta").is_err());
    }

    #[test]
    fn rechaza_caracteres_no_validos() {
        let base = std::env::temp_dir();
        for bad in ["con\"comillas", "a<b", "a|b", "a?b", "a*b"] {
            assert!(validate_dir(&base.join(bad).display().to_string()).is_err(), "{bad}");
        }
    }

    #[test]
    fn acepta_y_crea_una_carpeta_escribible() {
        let dir = std::env::temp_dir().join(format!("cartucho-installer-test-{}", std::process::id()));
        let ok = validate_dir(&dir.display().to_string()).expect("carpeta válida");
        assert!(ok.is_dir());
        assert!(!ok.join(".cartucho-installer-probe").exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn eventos_con_el_formato_que_espera_la_interfaz() {
        let json = |e: InstallEvent| serde_json::to_string(&e).unwrap();
        assert_eq!(json(InstallEvent::Stage { stage: "copying" }), r#"{"kind":"stage","stage":"copying"}"#);
        assert_eq!(json(InstallEvent::Finished), r#"{"kind":"finished"}"#);
        assert_eq!(
            json(InstallEvent::Failed { message: "x".into() }),
            r#"{"kind":"failed","message":"x"}"#
        );
    }
}
