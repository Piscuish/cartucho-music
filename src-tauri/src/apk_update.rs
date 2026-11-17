//! Actualizaciones en Android.
//!
//! Descarga el APK nuevo de la Release de GitHub y abre el instalador del sistema. Android
//! solo acepta instalarlo encima si está firmado con la misma clave que la app instalada,
//! así que un APK ajeno nunca puede sustituir a Cartucho; además, el usuario confirma la
//! instalación en el aviso del sistema (Android no permite instalar en silencio).

use std::time::Duration;

use jni::objects::{JClass, JObject, JString, JValue};
use jni::JNIEnv;
use serde::Serialize;
use tauri::ipc::Channel;

use crate::error::{AppError, AppResult};

/// Solo se descargan APK de las Releases de este repositorio.
const ALLOWED_PREFIX: &str = "https://github.com/Piscuish/cartucho-music/releases/download/";
const MAX_APK_BYTES: u64 = 200 * 1024 * 1024;
const FILE_NAME: &str = "cartucho-update.apk";
const AUTHORITY: &str = "site.cartucho.music.fileprovider";

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ApkProgress {
    Progress { downloaded: u64, total: Option<u64> },
    Installing,
}

pub fn validate_url(url: &str) -> AppResult<()> {
    let ok = url.starts_with(ALLOWED_PREFIX)
        && url.to_ascii_lowercase().ends_with(".apk")
        && !url.contains("..")
        && url.len() < 400;
    if ok {
        Ok(())
    } else {
        Err(AppError::Invalid("enlace de actualización no permitido".into()))
    }
}

/// Descarga el APK y abre el instalador de Android.
#[tauri::command]
pub async fn apk_update_install(url: String, on_progress: Channel<ApkProgress>) -> AppResult<()> {
    validate_url(&url)?;
    let path = std::path::PathBuf::from(cache_dir()?).join(FILE_NAME);

    let http = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .read_timeout(Duration::from_secs(60))
        .user_agent(concat!("CartuchoMusic/", env!("CARGO_PKG_VERSION")))
        .build()?;
    let mut res = http.get(&url).send().await?.error_for_status()?;
    let total = res.content_length();
    if total.is_some_and(|t| t > MAX_APK_BYTES) {
        return Err(AppError::Invalid("el APK es demasiado grande".into()));
    }

    let mut data: Vec<u8> = Vec::with_capacity(total.unwrap_or(0) as usize);
    let mut last_sent = 0u64;
    while let Some(chunk) = res.chunk().await? {
        data.extend_from_slice(&chunk);
        let downloaded = data.len() as u64;
        if downloaded > MAX_APK_BYTES {
            return Err(AppError::Invalid("el APK es demasiado grande".into()));
        }
        if downloaded - last_sent >= 256 * 1024 || Some(downloaded) == total {
            last_sent = downloaded;
            let _ = on_progress.send(ApkProgress::Progress { downloaded, total });
        }
    }
    // Un APK es un ZIP: si no empieza así, la descarga no es lo que esperamos.
    if !data.starts_with(b"PK\x03\x04") {
        return Err(AppError::Invalid("la descarga no es un APK válido".into()));
    }
    std::fs::write(&path, &data)?;

    let _ = on_progress.send(ApkProgress::Installing);
    open_installer(&path.to_string_lossy())
}

fn with_env<T>(f: impl FnOnce(&mut JNIEnv, &JObject) -> jni::errors::Result<T>) -> AppResult<T> {
    let ctx = ndk_context::android_context();
    // SAFETY: Tauri inicializa ndk-context con la JavaVM y el contexto de la app al arrancar.
    let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }.map_err(jni_err)?;
    let mut env = vm.attach_current_thread().map_err(jni_err)?;
    // SAFETY: referencia global al contexto que mantiene viva el propio runtime de Android.
    let context = unsafe { JObject::from_raw(ctx.context().cast()) };
    let result = f(&mut env, &context);
    if env.exception_check().unwrap_or(false) {
        let _ = env.exception_describe();
        let _ = env.exception_clear();
    }
    result.map_err(jni_err)
}

fn jni_err(e: jni::errors::Error) -> AppError {
    AppError::Invalid(format!("Android: {e}"))
}

/// Carpeta de caché de la app (la que comparte el FileProvider, ver res/xml/file_paths.xml).
fn cache_dir() -> AppResult<String> {
    with_env(|env, context| {
        let dir = env.call_method(context, "getCacheDir", "()Ljava/io/File;", &[])?.l()?;
        let path = env.call_method(&dir, "getAbsolutePath", "()Ljava/lang/String;", &[])?.l()?;
        let path: String = env.get_string(&JString::from(path))?.into();
        Ok(path)
    })
}

/// Abre el instalador del sistema con el APK descargado (Intent ACTION_VIEW + FileProvider).
fn open_installer(path: &str) -> AppResult<()> {
    with_env(|env, context| {
        let jpath = env.new_string(path)?;
        let file = env.new_object("java/io/File", "(Ljava/lang/String;)V", &[JValue::Object(&jpath)])?;

        // Las clases de AndroidX son de la app: desde un hilo nativo hay que cargarlas con el
        // class loader de la app, no con FindClass.
        let loader = env.call_method(context, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])?.l()?;
        let name = env.new_string("androidx.core.content.FileProvider")?;
        let class = env
            .call_method(&loader, "loadClass", "(Ljava/lang/String;)Ljava/lang/Class;", &[JValue::Object(&name)])?
            .l()?;
        let provider = JClass::from(class);
        let authority = env.new_string(AUTHORITY)?;
        let uri = env
            .call_static_method(
                &provider,
                "getUriForFile",
                "(Landroid/content/Context;Ljava/lang/String;Ljava/io/File;)Landroid/net/Uri;",
                &[JValue::Object(context), JValue::Object(&authority), JValue::Object(&file)],
            )?
            .l()?;

        let action = env.new_string("android.intent.action.VIEW")?;
        let intent = env.new_object("android/content/Intent", "(Ljava/lang/String;)V", &[JValue::Object(&action)])?;
        let mime = env.new_string("application/vnd.android.package-archive")?;
        env.call_method(
            &intent,
            "setDataAndType",
            "(Landroid/net/Uri;Ljava/lang/String;)Landroid/content/Intent;",
            &[JValue::Object(&uri), JValue::Object(&mime)],
        )?;
        // FLAG_ACTIVITY_NEW_TASK | FLAG_GRANT_READ_URI_PERMISSION
        env.call_method(&intent, "addFlags", "(I)Landroid/content/Intent;", &[JValue::Int(0x1000_0000 | 0x0000_0001)])?;
        env.call_method(context, "startActivity", "(Landroid/content/Intent;)V", &[JValue::Object(&intent)])?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solo_apk_de_las_releases_del_proyecto() {
        assert!(validate_url("https://github.com/Piscuish/cartucho-music/releases/download/v1.0.7/Cartucho-Music-v1.0.7-android.apk").is_ok());
        assert!(validate_url("https://github.com/otro/repo/releases/download/v1/x.apk").is_err());
        assert!(validate_url("https://github.com/Piscuish/cartucho-music/releases/download/v1.0.7/x.exe").is_err());
        assert!(validate_url("http://github.com/Piscuish/cartucho-music/releases/download/v1/x.apk").is_err());
    }
}
