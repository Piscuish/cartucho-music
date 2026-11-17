//! Letras desde LRCLIB (https://lrclib.net). La petición sale desde Rust, no desde el WebView,
//! para no depender de CORS e identificar la app con su User-Agent, como pide LRCLIB.
//! Solo se permiten sus dos endpoints de lectura y parámetros conocidos.

use std::sync::OnceLock;
use std::time::Duration;

use serde::Serialize;

use crate::error::{AppError, AppResult};

const BASE: &str = "https://lrclib.net/api/";
const ENDPOINTS: &[&str] = &["get", "search"];
const PARAMS: &[&str] = &["track_name", "artist_name", "album_name", "duration", "q"];

#[derive(Serialize)]
pub struct LrclibResponse {
    status: u16,
    body: String,
}

fn client() -> AppResult<&'static reqwest::Client> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(c) = CLIENT.get() {
        return Ok(c);
    }
    let c = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(concat!("CartuchoMusic/", env!("CARGO_PKG_VERSION"), " (https://github.com/Piscuish/cartucho-music)"))
        .build()?;
    Ok(CLIENT.get_or_init(|| c))
}

pub fn build_url(endpoint: &str, params: &[(String, String)]) -> AppResult<url::Url> {
    if !ENDPOINTS.contains(&endpoint) {
        return Err(AppError::Invalid("endpoint de LRCLIB no permitido".into()));
    }
    let mut url = url::Url::parse(BASE).and_then(|b| b.join(endpoint)).map_err(|_| AppError::Invalid("URL de LRCLIB".into()))?;
    {
        let mut q = url.query_pairs_mut();
        for (k, v) in params {
            if !PARAMS.contains(&k.as_str()) || v.len() > 300 {
                return Err(AppError::Invalid(format!("parámetro de LRCLIB no permitido: {k}")));
            }
            q.append_pair(k, v);
        }
    }
    Ok(url)
}

#[tauri::command]
pub async fn lrclib_request(endpoint: String, params: Vec<(String, String)>) -> AppResult<LrclibResponse> {
    let url = build_url(&endpoint, &params)?;
    let res = client()?.get(url).send().await?;
    let status = res.status().as_u16();
    let body = res.text().await?;
    if body.len() > 2 * 1024 * 1024 {
        return Err(AppError::Invalid("respuesta de LRCLIB demasiado grande".into()));
    }
    Ok(LrclibResponse { status, body })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solo_endpoints_y_parametros_conocidos() {
        let p = vec![("track_name".to_string(), "Luz de Neón".to_string()), ("duration".to_string(), "198".to_string())];
        let u = build_url("get", &p).unwrap();
        assert_eq!(u.host_str(), Some("lrclib.net"));
        assert_eq!(u.path(), "/api/get");
        assert!(u.query().unwrap().contains("track_name=Luz+de+Ne%C3%B3n"));
        assert!(build_url("../admin", &p).is_err());
        assert!(build_url("publish", &p).is_err());
        assert!(build_url("get", &[("token".into(), "x".into())]).is_err());
    }
}
