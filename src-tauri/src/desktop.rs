//! Integración con el escritorio (Fase 7):
//! - Icono en la bandeja del sistema con menú de reproducción.
//! - Cerrar la ventana la oculta en la bandeja (configurable desde la app).
//! - Arranque minimizado cuando se inicia con Windows (`--autostart`).
//!
//! Las acciones de reproducción no se ejecutan aquí: se emiten al frontend
//! (evento `tray-action`), que es quien habla con el servicio activo.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime, State, WindowEvent};

pub const TRAY_ID: &str = "main";
pub const AUTOSTART_ARG: &str = "--autostart";

pub struct DesktopState {
    pub close_to_tray: AtomicBool,
}

impl Default for DesktopState {
    fn default() -> Self {
        // Por defecto, cerrar minimiza a la bandeja (como la mayoría de reproductores).
        DesktopState { close_to_tray: AtomicBool::new(true) }
    }
}

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn toggle_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false) {
            let _ = w.hide();
        } else {
            show_main(app);
        }
    }
}

pub fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Mostrar Cartucho Music", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", "Reproducir / Pausar", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", "Siguiente", true, None::<&str>)?;
    let previous = MenuItem::with_id(app, "previous", "Anterior", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&show, &PredefinedMenuItem::separator(app)?, &toggle, &next, &previous, &PredefinedMenuItem::separator(app)?, &quit],
    )?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Cartucho Music")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "quit" => app.exit(0),
            action @ ("toggle" | "next" | "previous") => {
                let _ = app.emit("tray-action", action);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                toggle_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// Cerrar la ventana principal la oculta si así está configurado.
pub fn on_window_event<R: Runtime>(window: &tauri::Window<R>, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        if window.label() == "main" && window.state::<DesktopState>().close_to_tray.load(Ordering::Relaxed) {
            api.prevent_close();
            let _ = window.hide();
        }
    }
}

/// Lee `startMinimized` de las preferencias de escritorio guardadas por el frontend.
pub fn start_minimized_pref(stored: Option<String>) -> bool {
    stored
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|v| v.pointer("/state/startMinimized").and_then(|b| b.as_bool()))
        .unwrap_or(false)
}

/* ───────────── Comandos ───────────── */

#[tauri::command]
pub fn set_close_to_tray(state: State<'_, DesktopState>, enabled: bool) {
    state.close_to_tray.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
pub fn set_tray_tooltip<R: Runtime>(app: AppHandle<R>, text: String) {
    let text: String = text.chars().take(120).collect(); // Windows limita el tooltip a 127 caracteres
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(if text.is_empty() { "Cartucho Music".to_string() } else { text }));
    }
}

#[tauri::command]
pub fn show_main_window<R: Runtime>(app: AppHandle<R>) {
    show_main(&app);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_minimized_reads_persisted_state() {
        assert!(start_minimized_pref(Some(r#"{"state":{"startMinimized":true},"version":1}"#.into())));
        assert!(!start_minimized_pref(Some(r#"{"state":{"startMinimized":false}}"#.into())));
        assert!(!start_minimized_pref(Some("no es json".into())));
        assert!(!start_minimized_pref(None));
    }
}
