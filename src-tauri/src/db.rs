//! Persistencia local en SQLite.
//!
//! Guarda solo preferencias, caché de metadatos e historial local.
//! **Nunca** tokens ni credenciales (esos van al keychain, ver `secrets.rs`).
//! El frontend no puede ejecutar SQL arbitrario: solo estos comandos acotados.

use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;

use crate::error::{AppError, AppResult};

const MAX_KEY_LEN: usize = 256;
const MAX_VALUE_LEN: usize = 2 * 1024 * 1024; // 2 MiB
const MAX_TTL_MS: i64 = 30 * 24 * 60 * 60 * 1000; // 30 días
const HISTORY_CAP: i64 = 5_000;

/// Migraciones en orden. El índice + 1 es la versión (`PRAGMA user_version`).
const MIGRATIONS: &[&str] = &[
    // v1
    "CREATE TABLE kv (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at INTEGER NOT NULL
     );
     CREATE TABLE cache (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        expires_at INTEGER NOT NULL
     );
     CREATE INDEX cache_expires ON cache(expires_at);
     CREATE TABLE play_history (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        provider   TEXT NOT NULL,
        track_id   TEXT NOT NULL,
        track_json TEXT NOT NULL,
        played_at  INTEGER NOT NULL
     );
     CREATE INDEX play_history_played_at ON play_history(played_at DESC);",
];

pub struct Db(pub Mutex<Connection>);

impl Db {
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let conn = Connection::open(path)?;
        Self::init(conn)
    }

    #[cfg(test)]
    pub fn in_memory() -> AppResult<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(mut conn: Connection) -> AppResult<Self> {
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.busy_timeout(std::time::Duration::from_secs(3))?;
        migrate(&mut conn)?;
        Ok(Db(Mutex::new(conn)))
    }

    fn with<T>(&self, f: impl FnOnce(&Connection) -> AppResult<T>) -> AppResult<T> {
        let conn = self.0.lock().map_err(|_| AppError::Poisoned)?;
        f(&conn)
    }
}

fn migrate(conn: &mut Connection) -> AppResult<()> {
    let current: usize = conn.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))? as usize;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", (i + 1) as i64)?;
        tx.commit()?;
    }
    Ok(())
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn check_key(key: &str) -> AppResult<()> {
    if key.is_empty() || key.len() > MAX_KEY_LEN {
        return Err(AppError::Invalid("clave vacía o demasiado larga".into()));
    }
    Ok(())
}

fn check_value(value: &str) -> AppResult<()> {
    if value.len() > MAX_VALUE_LEN {
        return Err(AppError::Invalid("valor demasiado grande".into()));
    }
    Ok(())
}

/* ───────────── Lógica (testeable sin Tauri) ───────────── */

impl Db {
    pub fn kv_get(&self, key: &str) -> AppResult<Option<String>> {
        check_key(key)?;
        self.with(|c| Ok(c.query_row("SELECT value FROM kv WHERE key = ?1", [key], |r| r.get(0)).optional()?))
    }

    pub fn kv_set(&self, key: &str, value: &str) -> AppResult<()> {
        check_key(key)?;
        check_value(value)?;
        self.with(|c| {
            c.execute(
                "INSERT INTO kv (key, value, updated_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                params![key, value, now_ms()],
            )?;
            Ok(())
        })
    }

    pub fn kv_delete(&self, key: &str) -> AppResult<()> {
        check_key(key)?;
        self.with(|c| {
            c.execute("DELETE FROM kv WHERE key = ?1", [key])?;
            Ok(())
        })
    }

    pub fn cache_get(&self, key: &str, now: i64) -> AppResult<Option<String>> {
        check_key(key)?;
        self.with(|c| {
            let row: Option<(String, i64)> = c
                .query_row("SELECT value, expires_at FROM cache WHERE key = ?1", [key], |r| Ok((r.get(0)?, r.get(1)?)))
                .optional()?;
            match row {
                Some((v, exp)) if exp > now => Ok(Some(v)),
                Some(_) => {
                    c.execute("DELETE FROM cache WHERE key = ?1", [key])?;
                    Ok(None)
                }
                None => Ok(None),
            }
        })
    }

    pub fn cache_put(&self, key: &str, value: &str, ttl_ms: i64, now: i64) -> AppResult<()> {
        check_key(key)?;
        check_value(value)?;
        if !(1..=MAX_TTL_MS).contains(&ttl_ms) {
            return Err(AppError::Invalid("ttl fuera de rango".into()));
        }
        self.with(|c| {
            c.execute(
                "INSERT INTO cache (key, value, expires_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at",
                params![key, value, now + ttl_ms],
            )?;
            Ok(())
        })
    }

    pub fn cache_purge(&self, now: i64) -> AppResult<usize> {
        self.with(|c| Ok(c.execute("DELETE FROM cache WHERE expires_at <= ?1", [now])?))
    }

    pub fn cache_clear(&self, prefix: Option<&str>) -> AppResult<usize> {
        self.with(|c| {
            Ok(match prefix {
                Some(p) => c.execute("DELETE FROM cache WHERE substr(key, 1, length(?1)) = ?1", [p])?,
                None => c.execute("DELETE FROM cache", [])?,
            })
        })
    }

    pub fn history_add(&self, provider: &str, track_id: &str, track_json: &str, now: i64) -> AppResult<()> {
        check_key(provider)?;
        check_key(track_id)?;
        check_value(track_json)?;
        self.with(|c| {
            c.execute(
                "INSERT INTO play_history (provider, track_id, track_json, played_at) VALUES (?1, ?2, ?3, ?4)",
                params![provider, track_id, track_json, now],
            )?;
            // Mantener el historial acotado.
            c.execute(
                "DELETE FROM play_history WHERE id NOT IN (SELECT id FROM play_history ORDER BY played_at DESC LIMIT ?1)",
                [HISTORY_CAP],
            )?;
            Ok(())
        })
    }

    pub fn history_list(&self, limit: i64) -> AppResult<Vec<HistoryEntry>> {
        let limit = limit.clamp(1, 500);
        self.with(|c| {
            let mut stmt = c.prepare(
                "SELECT provider, track_id, track_json, played_at FROM play_history ORDER BY played_at DESC, id DESC LIMIT ?1",
            )?;
            let rows = stmt
                .query_map([limit], |r| {
                    Ok(HistoryEntry { provider: r.get(0)?, track_id: r.get(1)?, track_json: r.get(2)?, played_at: r.get(3)? })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn history_clear(&self) -> AppResult<()> {
        self.with(|c| {
            c.execute("DELETE FROM play_history", [])?;
            Ok(())
        })
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub provider: String,
    pub track_id: String,
    pub track_json: String,
    pub played_at: i64,
}

/* ───────────── Comandos Tauri ───────────── */

#[tauri::command]
pub async fn kv_get(db: State<'_, Db>, key: String) -> AppResult<Option<String>> {
    db.kv_get(&key)
}
#[tauri::command]
pub async fn kv_set(db: State<'_, Db>, key: String, value: String) -> AppResult<()> {
    db.kv_set(&key, &value)
}
#[tauri::command]
pub async fn kv_delete(db: State<'_, Db>, key: String) -> AppResult<()> {
    db.kv_delete(&key)
}
#[tauri::command]
pub async fn cache_get(db: State<'_, Db>, key: String) -> AppResult<Option<String>> {
    db.cache_get(&key, now_ms())
}
#[tauri::command]
pub async fn cache_put(db: State<'_, Db>, key: String, value: String, ttl_ms: i64) -> AppResult<()> {
    db.cache_put(&key, &value, ttl_ms, now_ms())
}
#[tauri::command]
pub async fn cache_clear(db: State<'_, Db>, prefix: Option<String>) -> AppResult<usize> {
    db.cache_clear(prefix.as_deref())
}
#[tauri::command]
pub async fn history_add(db: State<'_, Db>, provider: String, track_id: String, track_json: String) -> AppResult<()> {
    db.history_add(&provider, &track_id, &track_json, now_ms())
}
#[tauri::command]
pub async fn history_list(db: State<'_, Db>, limit: i64) -> AppResult<Vec<HistoryEntry>> {
    db.history_list(limit)
}
#[tauri::command]
pub async fn history_clear(db: State<'_, Db>) -> AppResult<()> {
    db.history_clear()
}

pub fn purge_expired(db: &Db) {
    if let Err(e) = db.cache_purge(now_ms()) {
        eprintln!("[cartucho] no se pudo purgar la caché: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_idempotent() {
        let db = Db::in_memory().unwrap();
        let mut conn = db.0.lock().unwrap();
        migrate(&mut conn).unwrap();
        let v: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
        assert_eq!(v as usize, MIGRATIONS.len());
    }

    #[test]
    fn kv_roundtrip() {
        let db = Db::in_memory().unwrap();
        assert_eq!(db.kv_get("a").unwrap(), None);
        db.kv_set("a", "1").unwrap();
        db.kv_set("a", "2").unwrap();
        assert_eq!(db.kv_get("a").unwrap().as_deref(), Some("2"));
        db.kv_delete("a").unwrap();
        assert_eq!(db.kv_get("a").unwrap(), None);
    }

    #[test]
    fn kv_rejects_bad_keys() {
        let db = Db::in_memory().unwrap();
        assert!(db.kv_set("", "x").is_err());
        assert!(db.kv_set(&"k".repeat(MAX_KEY_LEN + 1), "x").is_err());
    }

    #[test]
    fn cache_expires() {
        let db = Db::in_memory().unwrap();
        db.cache_put("spotify:album:1", "{}", 1_000, 10_000).unwrap();
        assert!(db.cache_get("spotify:album:1", 10_500).unwrap().is_some());
        assert!(db.cache_get("spotify:album:1", 11_000).unwrap().is_none());
        assert!(db.cache_put("x", "{}", 0, 0).is_err());
    }

    #[test]
    fn cache_clear_by_prefix() {
        let db = Db::in_memory().unwrap();
        db.cache_put("spotify:a", "1", 1_000, 0).unwrap();
        db.cache_put("apple-music:a", "1", 1_000, 0).unwrap();
        assert_eq!(db.cache_clear(Some("spotify:")).unwrap(), 1);
        assert!(db.cache_get("apple-music:a", 1).unwrap().is_some());
    }

    #[test]
    fn history_is_ordered_and_limited() {
        let db = Db::in_memory().unwrap();
        for i in 0..5 {
            db.history_add("spotify", &format!("t{i}"), "{}", i).unwrap();
        }
        let rows = db.history_list(3).unwrap();
        assert_eq!(rows.iter().map(|r| r.track_id.as_str()).collect::<Vec<_>>(), ["t4", "t3", "t2"]);
    }
}
