import type { AuthModule, ConnectionStatus } from "../types";
import { ProviderAuthError } from "../errors";
import { invokeNative, NativeCommandError } from "@/database/runtime";

/** Permisos mínimos que necesita Cartucho Music. */
export const SPOTIFY_SCOPES = [
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
] as const;

export interface AccessToken { accessToken: string; expiresAt: number; scope: string }

/** Origen de tokens. En la app es Rust (`spotify.rs`); en los tests, un doble. */
export interface TokenSource {
  authorize(clientId: string, scopes: readonly string[]): Promise<AccessToken>;
  getToken(forceRefresh: boolean): Promise<AccessToken | null>;
  logout(): Promise<void>;
}

export const nativeTokenSource: TokenSource = {
  authorize: (clientId, scopes) => invokeNative<AccessToken>("spotify_authorize", { clientId, scopes }),
  getToken: (forceRefresh) => invokeNative<AccessToken | null>("spotify_access_token", { forceRefresh }),
  logout: () => invokeNative("spotify_logout"),
};

const isAuthFailure = (e: unknown) => e instanceof NativeCommandError && (e.kind as string) === "auth";

export class SpotifyAuth implements AuthModule {
  private status: ConnectionStatus = { state: "disconnected" };
  private readonly listeners = new Set<(s: ConnectionStatus) => void>();
  private token: AccessToken | null = null;
  private refreshing: Promise<boolean> | null = null;

  constructor(
    private readonly source: TokenSource,
    private readonly getClientId: () => Promise<string | null>,
    private readonly now: () => number = Date.now,
  ) {}

  getStatus() { return this.status; }

  subscribe(listener: (s: ConnectionStatus) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setStatus(s: ConnectionStatus) {
    this.status = s;
    for (const l of this.listeners) l(s);
  }

  /** Inicia el login en el navegador del sistema. */
  async connect() {
    const clientId = await this.getClientId();
    if (!clientId) throw new Error("Falta el Client ID de Spotify");
    this.setStatus({ state: "connecting" });
    try {
      this.token = await this.source.authorize(clientId, SPOTIFY_SCOPES);
    } catch (e) {
      this.setStatus({ state: "error", message: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }

  async disconnect() {
    this.token = null;
    await this.source.logout();
    this.setStatus({ state: "disconnected" });
  }

  /** ¿Hay una sesión guardada en el keychain? (sin abrir el navegador) */
  async restore(): Promise<boolean> {
    try {
      this.token = await this.source.getToken(false);
      return !!this.token;
    } catch (e) {
      if (isAuthFailure(e)) return false;
      throw e;
    }
  }

  /** Token válido para la Web API y el Web Playback SDK. */
  async getAccessToken(): Promise<string | null> {
    if (this.token && this.token.expiresAt - this.now() > 30_000) return this.token.accessToken;
    try {
      this.token = await this.source.getToken(false);
    } catch (e) {
      if (isAuthFailure(e)) this.expire();
      throw e;
    }
    return this.token?.accessToken ?? null;
  }

  /** Fuerza la renovación (tras un 401). Las llamadas concurrentes comparten una sola renovación. */
  refresh(): Promise<boolean> {
    this.refreshing ??= this.source
      .getToken(true)
      .then((t) => { this.token = t; return !!t; })
      .catch((e) => { if (isAuthFailure(e)) this.expire(); return false; })
      .finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  private expire() {
    this.token = null;
    this.setStatus({ state: "error", message: new ProviderAuthError("spotify").message });
  }
}
