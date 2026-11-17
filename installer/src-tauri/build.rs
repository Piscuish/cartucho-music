//! Incrusta el instalador NSIS de Cartucho Music dentro de este ejecutable.
//!
//! La ruta llega por la variable `CARTUCHO_SETUP_EXE` (la pone el workflow de Release).
//! Sin ella se compila igual, pero con la carga vacía: el instalador lo detecta y
//! muestra un error en vez de instalar algo incompleto.

use std::{env, fs, path::PathBuf};

fn main() {
    println!("cargo:rerun-if-env-changed=CARTUCHO_SETUP_EXE");
    println!("cargo:rerun-if-env-changed=CARTUCHO_APP_EXE");

    // Tamaño del ejecutable de la app ya instalado: sirve para medir el progreso real
    // (cuánto se ha escrito en disco) y para mostrar el espacio necesario.
    let app_size = env::var("CARTUCHO_APP_EXE")
        .ok()
        .filter(|p| !p.trim().is_empty())
        .map(|p| fs::metadata(&p).unwrap_or_else(|e| panic!("no se pudo leer CARTUCHO_APP_EXE ({p}): {e}")).len())
        .unwrap_or(0);
    println!("cargo:rustc-env=CARTUCHO_APP_SIZE={app_size}");

    let out = PathBuf::from(env::var("OUT_DIR").unwrap()).join("payload-setup.exe");

    match env::var("CARTUCHO_SETUP_EXE") {
        Ok(path) if !path.trim().is_empty() => {
            println!("cargo:rerun-if-changed={path}");
            fs::copy(&path, &out)
                .unwrap_or_else(|e| panic!("no se pudo leer CARTUCHO_SETUP_EXE ({path}): {e}"));
        }
        _ => {
            println!("cargo:warning=CARTUCHO_SETUP_EXE no está definida: el instalador se compila sin la app dentro.");
            fs::write(&out, []).unwrap();
        }
    }

    tauri_build::build()
}
