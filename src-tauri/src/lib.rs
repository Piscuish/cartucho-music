//! Núcleo nativo de Cartucho Music.
//!
//! - `db`: SQLite para preferencias, caché de metadatos e historial (Fase 2).
//! - `secrets`: tokens en el keychain del sistema operativo (Fase 2).
//! - `spotify`: OAuth PKCE con redirección loopback (Fase 3).
//! - `desktop`: bandeja, cerrar a bandeja y arranque minimizado (Fase 7).
//!
//! Plugins: instancia única, estado de ventana, atajos globales, notificaciones,
//! inicio con el sistema, actualizaciones y reinicio.

mod db;
mod desktop;
mod error;
mod secrets;
mod spotify;

use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Debe ir primero: una segunda ejecución solo trae al frente la ventana existente.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| desktop::show_main(app)))
        // Recuerda tamaño, posición y maximizado (no la visibilidad: eso lo decide el arranque).
        .plugin(tauri_plugin_window_state::Builder::default().with_state_flags(StateFlags::all() & !StateFlags::VISIBLE).build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        // Actualizaciones firmadas desde GitHub Releases (ver plugins.updater en tauri.conf.json).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![desktop::AUTOSTART_ARG]),
        ))
        .manage(spotify::SpotifyState::new())
        .manage(desktop::DesktopState::default())
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("cartucho.db");
            let db = db::Db::open(&path).map_err(|e| format!("no se pudo abrir {}: {e}", path.display()))?;
            db::purge_expired(&db);

            // Arranque con Windows: ocultar en la bandeja si el usuario lo pidió.
            let autostarted = std::env::args().any(|a| a == desktop::AUTOSTART_ARG);
            if autostarted && desktop::start_minimized_pref(db.kv_get("state:desktop").ok().flatten()) {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            app.manage(db);
            desktop::build_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(desktop::on_window_event)
        .invoke_handler(tauri::generate_handler![
            app_version,
            db::kv_get,
            db::kv_set,
            db::kv_delete,
            db::cache_get,
            db::cache_put,
            db::cache_clear,
            db::history_add,
            db::history_list,
            db::history_clear,
            secrets::secret_get,
            secrets::secret_set,
            secrets::secret_delete,
            spotify::spotify_authorize,
            spotify::spotify_access_token,
            spotify::spotify_logout,
            desktop::set_close_to_tray,
            desktop::set_tray_tooltip,
            desktop::show_main_window,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar Cartucho Music");
}
