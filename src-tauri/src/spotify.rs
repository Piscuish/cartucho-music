//! OAuth 2.0 Authorization Code + PKCE para Spotify.
//!
//! - Sin client secret: el client ID es público y se acompaña de un `code_verifier`.
//! - Redirección por loopback (`http://127.0.0.1:<puerto dinámico>/callback`), como exige
//!   Spotify para apps nativas. Se registra en el dashboard como `http://127.0.0.1/callback`.
//! - El login se hace en el navegador del sistema (el usuario ve el dominio real de Spotify).
//! - El refresh token NUNCA sale de Rust: vive en el keychain y en memoria.
//!   El frontend solo recibe access tokens de corta duración.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::secrets;

const AUTHORIZE_URL: &str = "https://accounts.spotify.com/authorize";
const TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
const SESSION_KEY: &str = "spotify.session";
const LOGIN_TIMEOUT: Duration = Duration::from_secs(5 * 60);
/// Renovar si al token le queda menos de esto.
const REFRESH_MARGIN_MS: i64 = 60_000;

/// Scopes que la app puede solicitar. Cualquier otro se rechaza.
const ALLOWED_SCOPES: &[&str] = &[
    "user-read-private",
    "user-library-read",
    "user-library-modify",
    "user-follow-read",
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-read-recently-played",
    "user-top-read",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "streaming",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredSession {
    client_id: String,
    access_token: String,
    refresh_token: String,
    /// epoch ms
    expires_at: i64,
    scope: String,
}

/// Lo único que ve el frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessToken {
    access_token: String,
    expires_at: i64,
    scope: String,
}

impl From<&StoredSession> for AccessToken {
    fn from(s: &StoredSession) -> Self {
        AccessToken { access_token: s.access_token.clone(), expires_at: s.expires_at, scope: s.scope.clone() }
    }
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: i64,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    scope: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenError {
    error: String,
    #[serde(default)]
    error_description: Option<String>,
}

enum Cached {
    NotLoaded,
    Loaded(Option<StoredSession>),
}

pub struct SpotifyState {
    http: reqwest::Client,
    /// Serializa lecturas y renovaciones: nunca dos refresh simultáneos.
    session: Mutex<Cached>,
}

impl SpotifyState {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .user_agent(concat!("CartuchoMusic/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("cliente HTTP");
        SpotifyState { http, session: Mutex::new(Cached::NotLoaded) }
    }
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn random_b64(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::fill(&mut buf[..]);
    URL_SAFE_NO_PAD.encode(buf)
}

pub fn pkce_pair() -> (String, String) {
    let verifier = random_b64(64); // 86 caracteres, dentro de 43..=128
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

fn validate_client_id(id: &str) -> AppResult<()> {
    if id.len() < 16 || id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(AppError::Invalid("client ID de Spotify no válido".into()));
    }
    Ok(())
}

fn validate_scopes(scopes: &[String]) -> AppResult<String> {
    for s in scopes {
        if !ALLOWED_SCOPES.contains(&s.as_str()) {
            return Err(AppError::Invalid(format!("scope no permitido: {s}")));
        }
    }
    Ok(scopes.join(" "))
}

/* ───────────── Keychain ───────────── */

async fn load_session() -> AppResult<Option<StoredSession>> {
    let raw = tauri::async_runtime::spawn_blocking(|| secrets::get(SESSION_KEY)).await.map_err(|_| AppError::Poisoned)??;
    Ok(raw.and_then(|r| serde_json::from_str(&r).ok()))
}

async fn save_session(s: &StoredSession) -> AppResult<()> {
    let json = serde_json::to_string(s).map_err(|e| AppError::Invalid(e.to_string()))?;
    tauri::async_runtime::spawn_blocking(move || secrets::set(SESSION_KEY, &json)).await.map_err(|_| AppError::Poisoned)?
}

async fn delete_session() -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(|| secrets::delete(SESSION_KEY)).await.map_err(|_| AppError::Poisoned)?
}

/* ───────────── Intercambio de tokens ───────────── */

async fn token_request(http: &reqwest::Client, form: &[(&str, &str)]) -> AppResult<TokenResponse> {
    let res = http.post(TOKEN_URL).form(form).send().await?;
    let status = res.status();
    let body = res.text().await?;
    if status.is_success() {
        return serde_json::from_str(&body).map_err(|e| AppError::Auth(format!("respuesta de token inesperada: {e}")));
    }
    let err: Option<TokenError> = serde_json::from_str(&body).ok();
    match err {
        Some(e) if e.error == "invalid_grant" => Err(AppError::Auth("sesión revocada o caducada".into())),
        Some(e) => Err(AppError::Auth(format!("{}: {}", e.error, e.error_description.unwrap_or_default()))),
        None => Err(AppError::Auth(format!("HTTP {status}"))),
    }
}

/* ───────────── Servidor loopback ───────────── */

enum Callback {
    Code(String),
    Denied(String),
    Ignore,
}

fn parse_callback(request_line: &str, expected_state: &str) -> AppResult<Callback> {
    // "GET /callback?code=...&state=... HTTP/1.1"
    let target = request_line.split_whitespace().nth(1).unwrap_or("");
    let url = url::Url::parse(&format!("http://127.0.0.1{target}")).map_err(|_| AppError::Invalid("petición mal formada".into()))?;
    if url.path() != "/callback" {
        return Ok(Callback::Ignore);
    }
    let q: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
    if q.get("state").map(String::as_str) != Some(expected_state) {
        return Err(AppError::Auth("el parámetro state no coincide (posible CSRF)".into()));
    }
    if let Some(err) = q.get("error") {
        return Ok(Callback::Denied(err.clone()));
    }
    match q.get("code") {
        Some(c) if !c.is_empty() => Ok(Callback::Code(c.clone())),
        _ => Err(AppError::Auth("falta el código de autorización".into())),
    }
}

async fn respond(stream: &mut TcpStream, status: &str, title: &str, message: &str) {
    let html = format!(
        "<!doctype html><html lang=\"es\"><meta charset=\"utf-8\"><title>Cartucho Music</title>\
<body style=\"margin:0;height:100vh;display:grid;place-items:center;background:#0b0a0f;color:#f5f1ec;font-family:system-ui,sans-serif\">\
<div style=\"text-align:center;max-width:420px;padding:24px\"><div style=\"width:56px;height:56px;margin:0 auto 20px;border-radius:14px;background:linear-gradient(135deg,#ff7a2f,#ff3d7f)\"></div>\
<h1 style=\"font-size:22px;margin:0 0 10px\">{title}</h1><p style=\"color:#9b95a6;line-height:1.5;margin:0\">{message}</p></div></body></html>"
    );
    let resp = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n{html}",
        html.len()
    );
    let _ = stream.write_all(resp.as_bytes()).await;
    let _ = stream.shutdown().await;
}

async fn read_request_line(stream: &mut TcpStream) -> Option<String> {
    let mut buf = vec![0u8; 8192];
    let mut len = 0;
    loop {
        let n = tokio::time::timeout(Duration::from_secs(10), stream.read(&mut buf[len..])).await.ok()?.ok()?;
        if n == 0 { break; }
        len += n;
        if buf[..len].windows(4).any(|w| w == b"\r\n\r\n") || len == buf.len() { break; }
    }
    let text = String::from_utf8_lossy(&buf[..len]);
    text.lines().next().map(str::to_owned)
}

async fn wait_for_code(listener: TcpListener, expected_state: &str) -> AppResult<String> {
    loop {
        let (mut stream, _) = listener.accept().await?;
        let Some(line) = read_request_line(&mut stream).await else { continue };
        match parse_callback(&line, expected_state) {
            Ok(Callback::Code(code)) => {
                respond(&mut stream, "200 OK", "Conectado", "Ya puedes cerrar esta pestaña y volver a Cartucho Music.").await;
                return Ok(code);
            }
            Ok(Callback::Denied(reason)) => {
                respond(&mut stream, "200 OK", "Conexión cancelada", "No se ha concedido acceso. Puedes cerrar esta pestaña.").await;
                return Err(AppError::Auth(format!("acceso denegado: {reason}")));
            }
            Ok(Callback::Ignore) => respond(&mut stream, "404 Not Found", "No encontrado", "").await,
            Err(e) => {
                respond(&mut stream, "400 Bad Request", "Algo no cuadra", "La respuesta de Spotify no es válida. Vuelve a intentarlo desde Cartucho Music.").await;
                return Err(e);
            }
        }
    }
}

/* ───────────── Comandos ───────────── */

#[tauri::command]
pub async fn spotify_authorize(
    app: AppHandle,
    state: State<'_, SpotifyState>,
    client_id: String,
    scopes: Vec<String>,
) -> AppResult<AccessToken> {
    validate_client_id(&client_id)?;
    let scope = validate_scopes(&scopes)?;

    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let (verifier, challenge) = pkce_pair();
    let csrf = random_b64(24);

    let url = url::Url::parse_with_params(
        AUTHORIZE_URL,
        &[
            ("client_id", client_id.as_str()),
            ("response_type", "code"),
            ("redirect_uri", redirect_uri.as_str()),
            ("code_challenge_method", "S256"),
            ("code_challenge", challenge.as_str()),
            ("state", csrf.as_str()),
            ("scope", scope.as_str()),
        ],
    )
    .map_err(|e| AppError::Invalid(e.to_string()))?;

    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|e| AppError::Auth(format!("no se pudo abrir el navegador: {e}")))?;

    let code = tokio::time::timeout(LOGIN_TIMEOUT, wait_for_code(listener, &csrf))
        .await
        .map_err(|_| AppError::Auth("tiempo de espera agotado".into()))??;

    let tok = token_request(
        &state.http,
        &[
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("client_id", client_id.as_str()),
            ("code_verifier", verifier.as_str()),
        ],
    )
    .await?;

    let session = StoredSession {
        client_id,
        access_token: tok.access_token,
        refresh_token: tok.refresh_token.ok_or_else(|| AppError::Auth("Spotify no devolvió refresh token".into()))?,
        expires_at: now_ms() + tok.expires_in * 1000,
        scope: tok.scope.unwrap_or(scope),
    };
    save_session(&session).await?;
    let out = AccessToken::from(&session);
    *state.session.lock().await = Cached::Loaded(Some(session));
    Ok(out)
}

/// Devuelve un access token válido (renovándolo si hace falta) o `None` si no hay sesión.
#[tauri::command]
pub async fn spotify_access_token(state: State<'_, SpotifyState>, force_refresh: bool) -> AppResult<Option<AccessToken>> {
    let mut guard = state.session.lock().await;
    if let Cached::NotLoaded = *guard {
        *guard = Cached::Loaded(load_session().await?);
    }
    let Cached::Loaded(slot) = &mut *guard else { unreachable!() };
    let Some(session) = slot.as_mut() else { return Ok(None) };

    if !force_refresh && session.expires_at - now_ms() > REFRESH_MARGIN_MS {
        return Ok(Some(AccessToken::from(&*session)));
    }

    let client_id = session.client_id.clone();
    let refresh = session.refresh_token.clone();
    match token_request(&state.http, &[("grant_type", "refresh_token"), ("refresh_token", refresh.as_str()), ("client_id", client_id.as_str())]).await {
        Ok(tok) => {
            session.access_token = tok.access_token;
            session.expires_at = now_ms() + tok.expires_in * 1000;
            if let Some(rt) = tok.refresh_token {
                session.refresh_token = rt; // rotación
            }
            if let Some(sc) = tok.scope {
                session.scope = sc;
            }
            save_session(session).await?;
            Ok(Some(AccessToken::from(&*session)))
        }
        Err(AppError::Auth(msg)) => {
            // Refresh token inválido: la sesión ya no sirve.
            *slot = None;
            delete_session().await?;
            Err(AppError::Auth(msg))
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn spotify_logout(state: State<'_, SpotifyState>) -> AppResult<()> {
    *state.session.lock().await = Cached::Loaded(None);
    delete_session().await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_challenge_is_s256_of_verifier() {
        let (v, c) = pkce_pair();
        assert!((43..=128).contains(&v.len()));
        assert_eq!(c, URL_SAFE_NO_PAD.encode(Sha256::digest(v.as_bytes())));
        let (v2, _) = pkce_pair();
        assert_ne!(v, v2);
    }

    #[test]
    fn rfc7636_example_vector() {
        // RFC 7636, apéndice B.
        let v = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(URL_SAFE_NO_PAD.encode(Sha256::digest(v.as_bytes())), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn callback_parsing() {
        let st = "abc";
        assert!(matches!(parse_callback("GET /callback?code=XYZ&state=abc HTTP/1.1", st), Ok(Callback::Code(c)) if c == "XYZ"));
        assert!(matches!(parse_callback("GET /callback?error=access_denied&state=abc HTTP/1.1", st), Ok(Callback::Denied(_))));
        assert!(matches!(parse_callback("GET /callback?code=XYZ&state=otro HTTP/1.1", st), Err(AppError::Auth(_))));
        assert!(matches!(parse_callback("GET /favicon.ico HTTP/1.1", st), Ok(Callback::Ignore)));
        assert!(matches!(parse_callback("GET /callback?state=abc HTTP/1.1", st), Err(AppError::Auth(_))));
    }

    #[test]
    fn validation() {
        assert!(validate_client_id("0123456789abcdef0123456789abcdef").is_ok());
        assert!(validate_client_id("abc").is_err());
        assert!(validate_client_id("0123456789abcdef0123456789abcde!").is_err());
        assert!(validate_scopes(&["streaming".into()]).is_ok());
        assert!(validate_scopes(&["ugc-image-upload".into()]).is_err());
    }
}
