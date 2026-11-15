/** ¿Estamos dentro de la app de escritorio (Tauri) o en un navegador (desarrollo)? */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Error serializado desde Rust (`AppError`). */
export interface NativeError { kind: "db" | "keyring" | "invalid" | "io" | "internal"; message: string }

export class NativeCommandError extends Error {
  readonly kind: NativeError["kind"];
  constructor(command: string, e: unknown) {
    const ne = (typeof e === "object" && e && "message" in e ? e : { kind: "internal", message: String(e) }) as NativeError;
    super(`${command}: ${ne.message}`);
    this.name = "NativeCommandError";
    this.kind = ne.kind;
  }
}

export async function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw new NativeCommandError(command, e);
  }
}
