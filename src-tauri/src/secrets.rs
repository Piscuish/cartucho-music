//! Almacén seguro de credenciales sobre el keychain del sistema operativo
//! (Windows Credential Manager · macOS Keychain · Secret Service en Linux · en Android,
//! SharedPreferences cifradas con una clave del Android Keystore).
//!
//! Solo se aceptan claves de una lista cerrada, para que el frontend no pueda
//! usar el keychain del usuario como almacén genérico.

use crate::error::{AppError, AppResult};

const SERVICE: &str = "site.cartucho.music";

/// Claves permitidas. Añadir aquí cada credencial nueva de forma explícita.
pub const ALLOWED_KEYS: &[&str] = &[
    // Sesión de Spotify (access + refresh token). Se usará en la Fase 3.
    "spotify.session",
    // Music User Token de Apple Music. Se usará en la Fase 5.
    "apple-music.user-token",
];

const MAX_SECRET_LEN: usize = 16 * 1024;

#[cfg(not(target_os = "android"))]
type Entry = keyring::Entry;
#[cfg(target_os = "android")]
type Entry = keyring_core::Entry;

fn entry(key: &str) -> AppResult<Entry> {
    if !ALLOWED_KEYS.contains(&key) {
        return Err(AppError::Invalid(format!("clave de secreto no permitida: {key}")));
    }
    new_entry(key)
}

#[cfg(not(target_os = "android"))]
fn new_entry(key: &str) -> AppResult<Entry> {
    Ok(keyring::Entry::new(SERVICE, key)?)
}

/// En Android el almacén por defecto hay que registrarlo una vez (Tauri ya inicializó el
/// contexto de la app que necesita). Si falla, se devuelve el error en cada intento.
#[cfg(target_os = "android")]
fn new_entry(key: &str) -> AppResult<Entry> {
    use std::sync::OnceLock;
    static STORE: OnceLock<Result<(), String>> = OnceLock::new();
    STORE
        .get_or_init(|| {
            android_native_keyring_store::Store::new()
                .map(|store| keyring_core::set_default_store(store))
                .map_err(|e| e.to_string())
        })
        .clone()
        .map_err(|e| AppError::Invalid(format!("almacén seguro de Android no disponible: {e}")))?;
    Ok(keyring_core::Entry::new(SERVICE, key)?)
}

pub fn get(key: &str) -> AppResult<Option<String>> {
    match entry(key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn set(key: &str, value: &str) -> AppResult<()> {
    if value.is_empty() || value.len() > MAX_SECRET_LEN {
        return Err(AppError::Invalid("secreto vacío o demasiado grande".into()));
    }
    Ok(entry(key)?.set_password(value)?)
}

pub fn delete(key: &str) -> AppResult<()> {
    match entry(key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}

/* El acceso al keychain puede bloquear (p. ej. un diálogo del sistema): se ejecuta fuera del hilo principal. */

#[tauri::command]
pub async fn secret_get(key: String) -> AppResult<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || get(&key)).await.map_err(|_| AppError::Poisoned)?
}

#[tauri::command]
pub async fn secret_set(key: String, value: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || set(&key, &value)).await.map_err(|_| AppError::Poisoned)?
}

#[tauri::command]
pub async fn secret_delete(key: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || delete(&key)).await.map_err(|_| AppError::Poisoned)?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_keys() {
        assert!(matches!(entry("otra.cosa"), Err(AppError::Invalid(_))));
        assert!(matches!(set("otra.cosa", "x"), Err(AppError::Invalid(_))));
    }

    #[test]
    fn rejects_empty_values() {
        assert!(matches!(set("spotify.session", ""), Err(AppError::Invalid(_))));
    }
}
