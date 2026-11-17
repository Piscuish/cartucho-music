//! Núcleo nativo de Cartucho Music.
//!
//! - `db`: SQLite para preferencias, caché de metadatos e historial (Fase 2).
//! - `secrets`: tokens en el almacén seguro del sistema operativo (Fase 2).
//! - `spotify`: OAuth PKCE con redirección loopback (Fase 3).
//! - `desktop`: bandeja, cerrar a bandeja y arranque minimizado (Fase 7). Solo escritorio.
//!
//! Plugins comunes: enlaces externos, notificaciones y reinicio. Solo en escritorio:
//! instancia única, estado de ventana, atajos globales, inicio con el sistema y actualizaciones.
//! En Android la app se actualiza instalando el APK nuevo.

mod db;
#[cfg(desktop)]
mod desktop;
mod error;
mod secrets;
mod spotify;

use tauri::Manager;

#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Comandos de la app; en escritorio se añaden los de la bandeja.
macro_rules! handler {
    ($($extra:path),* $(,)?) => {
        tauri::generate_handler![
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
            $($extra),*
        ]
    };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(desktop)]
    let builder = {
        use tauri_plugin_window_state::StateFlags;
        builder
            // Debe ir primero: una segunda ejecución solo trae al frente la ventana existente.
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| desktop::show_main(app)))
            // Recuerda tamaño, posición y maximizado. Ni la visibilidad (la decide el arranque) ni el
            // marco: desde 1.0.3 la ventana no tiene marco de Windows, y restaurar el guardado por
            // versiones anteriores volvería a mostrar la barra nativa encima de la propia.
            .plugin(
                tauri_plugin_window_state::Builder::default()
                    .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE & !StateFlags::DECORATIONS)
                    .build(),
            )
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())
            // Actualizaciones firmadas desde GitHub Releases (ver plugins.updater en tauri.conf.json).
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec![desktop::AUTOSTART_ARG]),
            ))
            .manage(desktop::DesktopState::default())
            .on_window_event(desktop::on_window_event)
            .invoke_handler(handler![
                desktop::set_close_to_tray,
                desktop::set_tray_tooltip,
                desktop::show_main_window,
            ])
    };

    #[cfg(mobile)]
    let builder = builder.invoke_handler(handler![]);

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .manage(spotify::SpotifyState::new())
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("cartucho.db");
            let db = db::Db::open(&path).map_err(|e| format!("no se pudo abrir {}: {e}", path.display()))?;
            db::purge_expired(&db);

            #[cfg(desktop)]
            {
                // Arranque con Windows: ocultar en la bandeja si el usuario lo pidió.
                let autostarted = std::env::args().any(|a| a == desktop::AUTOSTART_ARG);
                if autostarted && desktop::start_minimized_pref(db.kv_get("state:desktop").ok().flatten()) {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.hide();
                    }
                }
                // Por si un estado guardado antiguo ya restauró el marco nativo: siempre sin él.
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.set_decorations(false);
                }
            }
            app.manage(db);
            #[cfg(desktop)]
            desktop::build_tray(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error al iniciar Cartucho Music");
}
