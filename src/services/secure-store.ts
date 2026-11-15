import { invokeNative, isTauri } from "@/database/runtime";

/**
 * Credenciales en el keychain del sistema operativo (vía Rust).
 * Las claves deben estar en la lista cerrada `ALLOWED_KEYS` de `src-tauri/src/secrets.rs`.
 *
 * En el navegador NO hay almacén seguro: las operaciones fallan a propósito,
 * para que nunca acaben tokens en localStorage.
 */
export type SecretKey = "spotify.session" | "apple-music.user-token";

export class SecureStoreUnavailableError extends Error {
  constructor() {
    super("El almacén seguro solo está disponible en la app de escritorio");
    this.name = "SecureStoreUnavailableError";
  }
}

function ensure() {
  if (!isTauri()) throw new SecureStoreUnavailableError();
}

export const secureStore = {
  available: () => isTauri(),
  async get(key: SecretKey): Promise<string | null> {
    ensure();
    return invokeNative<string | null>("secret_get", { key });
  },
  async set(key: SecretKey, value: string): Promise<void> {
    ensure();
    await invokeNative("secret_set", { key, value });
  },
  async delete(key: SecretKey): Promise<void> {
    ensure();
    await invokeNative("secret_delete", { key });
  },
};
