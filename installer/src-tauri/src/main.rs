// Sin consola extra en Windows en builds de release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod install;

use tauri::{Manager, WindowEvent};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(install::InstallState::default())
        .invoke_handler(tauri::generate_handler![
            install::installer_info,
            install::pick_folder,
            install::start_install,
            install::launch_app,
        ])
        .on_window_event(|window, event| {
            // Cerrar a mitad de la instalación dejaría la app a medias: se ignora.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<install::InstallState>().is_running() {
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar el instalador de Cartucho Music");
}
