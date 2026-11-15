use serde::{Serialize, Serializer};

/// Error único que cruza la frontera Rust → JS. Se serializa como `{ kind, message }`.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("base de datos: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("almacén seguro: {0}")]
    Keyring(#[from] keyring::Error),
    #[error("entrada no válida: {0}")]
    Invalid(String),
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("estado interno no disponible")]
    Poisoned,
    #[error("autenticación: {0}")]
    Auth(String),
    #[error("red: {0}")]
    Network(#[from] reqwest::Error),
}

impl AppError {
    fn kind(&self) -> &'static str {
        match self {
            AppError::Db(_) => "db",
            AppError::Keyring(_) => "keyring",
            AppError::Invalid(_) => "invalid",
            AppError::Io(_) => "io",
            AppError::Poisoned => "internal",
            AppError::Auth(_) => "auth",
            AppError::Network(_) => "network",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = s.serialize_struct("AppError", 2)?;
        st.serialize_field("kind", self.kind())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
