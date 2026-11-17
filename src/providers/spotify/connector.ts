/**
 * Ciclo de vida de la conexión con Spotify:
 * - Al arrancar, si hay sesión en el keychain, registra `SpotifyProvider` sin abrir el navegador.
 * - `connect()` abre el login y, al volver, sustituye el proveedor de vista previa.
 * - `disconnect()` borra la sesión y vuelve a la vista previa.
 *
 * El resto de la app no sabe nada de esto: solo ve cambiar el registro.
 */
import { create } from "zustand";
import { cache, history, kv } from "@/database/stores";
import { isTauri } from "@/database/runtime";
import { registry } from "../registry";
import { PreviewProvider } from "../preview/PreviewProvider";
import type { ConnectionStatus } from "../types";
import { nativeTokenSource, SpotifyAuth } from "./auth";
import { SpotifyProvider } from "./SpotifyProvider";

const CLIENT_ID_KEY = "spotify.clientId";
/** URI que hay que registrar en el dashboard de Spotify (el puerto lo asigna el sistema). */
export const SPOTIFY_REDIRECT_URI = "http://127.0.0.1/callback";

/**
 * Client ID de la app «Cartucho Music» en el dashboard de Spotify, incluido para que nadie
 * tenga que configurarlo. No es un secreto: con PKCE no existe Client Secret, y Spotify
 * muestra este identificador en cada pantalla de autorización.
 * `VITE_SPOTIFY_CLIENT_ID` lo sustituye al compilar; en Ajustes se puede usar uno propio.
 */
export const BUILTIN_SPOTIFY_CLIENT_ID: string =
  ((import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) ?? "").trim() || "adb12a47450b424f8dae9a7b5e291960";

/** Client ID propio guardado por el usuario en Ajustes (null si usa el incluido). */
export async function getCustomClientId(): Promise<string | null> {
  const stored = await kv.get(CLIENT_ID_KEY).catch(() => null);
  const clean = (stored ?? "").trim();
  return clean && clean !== BUILTIN_SPOTIFY_CLIENT_ID ? clean : null;
}

export async function getClientId(): Promise<string | null> {
  return (await getCustomClientId()) ?? (BUILTIN_SPOTIFY_CLIENT_ID || null);
}

/** Guarda un Client ID propio. Vacío (o igual al incluido) vuelve a usar el de Cartucho Music. */
export async function setClientId(id: string): Promise<void> {
  const clean = id.trim();
  if (!clean || clean === BUILTIN_SPOTIFY_CLIENT_ID) {
    await kv.delete(CLIENT_ID_KEY);
    return;
  }
  if (!/^[A-Za-z0-9]{16,64}$/.test(clean)) throw new Error("El Client ID debe tener entre 16 y 64 caracteres alfanuméricos.");
  await kv.set(CLIENT_ID_KEY, clean);
}

/** Estado del flujo de conexión para la UI de ajustes. */
interface ConnectorState {
  status: ConnectionStatus;
  setStatus: (s: ConnectionStatus) => void;
}
export const useSpotifyConnector = create<ConnectorState>()((set) => ({
  status: { state: "disconnected" },
  setStatus: (status) => set({ status }),
}));

let auth: SpotifyAuth | null = null;

function getAuth(): SpotifyAuth {
  if (!auth) {
    auth = new SpotifyAuth(nativeTokenSource, getClientId);
    auth.subscribe((s) => {
      useSpotifyConnector.getState().setStatus(s);
      // Sesión revocada o caducada sin remedio: volver a la vista previa.
      if (s.state === "error" && registry.tryGet("spotify") instanceof SpotifyProvider) usePreview();
    });
  }
  return auth;
}

function usePreview() {
  registry.register(new PreviewProvider("spotify", { kv, history, latencyMs: 120 }));
}

async function activate(a: SpotifyAuth) {
  const provider = new SpotifyProvider({ auth: a, inAppPlayer: isTauri(), cacheStore: cache });
  const me = await provider.api.me();
  a.setStatus({ state: "connected", displayName: me.displayName });
  registry.register(provider);
}

/** Restaura la sesión guardada (sin interacción). Devuelve `true` si queda conectado. */
export async function restoreSpotify(): Promise<boolean> {
  if (!isTauri()) return false;
  const a = getAuth();
  try {
    if (!(await a.restore())) return false;
    await activate(a);
    return true;
  } catch (e) {
    console.warn("[spotify] no se pudo restaurar la sesión", e);
    a.setStatus({ state: "error", message: "No se pudo restaurar la sesión de Spotify." });
    return false;
  }
}

export async function connectSpotify(): Promise<void> {
  if (!isTauri()) throw new Error("La conexión con Spotify solo está disponible en la app de escritorio.");
  const a = getAuth();
  await a.connect();
  await activate(a);
}

export async function disconnectSpotify(): Promise<void> {
  const a = getAuth();
  await a.disconnect();
  await cache.clear("spotify:").catch(() => {});
  usePreview();
}
