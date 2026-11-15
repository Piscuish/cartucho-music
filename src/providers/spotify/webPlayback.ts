/**
 * Reproductor integrado mediante el Spotify Web Playback SDK oficial.
 * Crea un dispositivo Spotify Connect llamado "Cartucho Music" dentro de la app.
 *
 * Requisitos (docs/VIABILIDAD.md §1.3): cuenta Premium y DRM Widevine en el WebView.
 * Si algo falla, el estado lo explica y la app sigue funcionando como mando remoto.
 */
import type { InAppPlayerStatus } from "../types";

interface SdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  activateElement?(): Promise<void>;
  addListener(event: string, cb: (payload: never) => void): boolean;
}
interface SdkNamespace {
  Player: new (opts: { name: string; getOAuthToken: (cb: (token: string) => void) => void; volume?: number }) => SdkPlayer;
}
declare global {
  interface Window {
    Spotify?: SdkNamespace;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

const SDK_URL = "https://sdk.scdn.co/spotify-player.js";
const READY_TIMEOUT_MS = 20_000;

export async function widevineAvailable(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.requestMediaKeySystemAccess) return false;
  try {
    await navigator.requestMediaKeySystemAccess("com.widevine.alpha", [{
      initDataTypes: ["cenc"],
      audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: "SW_SECURE_CRYPTO" }],
    }]);
    return true;
  } catch {
    return false;
  }
}

let sdkLoading: Promise<SdkNamespace> | null = null;

function loadSdk(): Promise<SdkNamespace> {
  if (window.Spotify) return Promise.resolve(window.Spotify);
  sdkLoading ??= new Promise<SdkNamespace>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("El SDK de Spotify no se ha cargado")), 15_000);
    window.onSpotifyWebPlaybackSDKReady = () => { clearTimeout(timer); resolve(window.Spotify!); };
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onerror = () => { clearTimeout(timer); sdkLoading = null; reject(new Error("No se pudo descargar el SDK de Spotify")); };
    document.head.appendChild(s);
  });
  return sdkLoading;
}

export class WebPlaybackDevice {
  private status: InAppPlayerStatus = { state: "idle" };
  private readonly listeners = new Set<(s: InAppPlayerStatus) => void>();
  private player: SdkPlayer | null = null;

  constructor(
    private readonly getToken: () => Promise<string | null>,
    /** Se llama cuando el SDK informa de un cambio de estado (para refrescar al instante). */
    private readonly onPlayerStateChanged: () => void,
  ) {}

  getStatus() { return this.status; }
  get deviceId(): string | null { return this.status.state === "ready" ? this.status.deviceId : null; }

  subscribe(l: (s: InAppPlayerStatus) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private set(s: InAppPlayerStatus) {
    this.status = s;
    for (const l of this.listeners) l(s);
  }

  async start(): Promise<void> {
    if (this.player || this.status.state === "loading") return;
    if (!(await widevineAvailable())) {
      return this.set({ state: "unsupported", message: "Este equipo no ofrece el DRM Widevine que exige Spotify. Usa el mando remoto." });
    }
    this.set({ state: "loading", message: "Preparando el reproductor integrado…" });
    let Spotify: SdkNamespace;
    try {
      Spotify = await loadSdk();
    } catch (e) {
      return this.set({ state: "error", message: e instanceof Error ? e.message : String(e) });
    }

    const player = new Spotify.Player({
      name: "Cartucho Music",
      volume: 0.7,
      getOAuthToken: (cb) => { this.getToken().then((t) => t && cb(t)).catch(() => {}); },
    });
    this.player = player;

    const timeout = setTimeout(() => {
      if (this.status.state === "loading") this.set({ state: "error", message: "El reproductor integrado no ha respondido. Puedes seguir usando el mando remoto." });
    }, READY_TIMEOUT_MS);

    const on = <T>(event: string, cb: (p: T) => void) => player.addListener(event, cb as (p: never) => void);
    on<{ device_id: string }>("ready", ({ device_id }) => { clearTimeout(timeout); this.set({ state: "ready", deviceId: device_id }); });
    on<{ device_id: string }>("not_ready", () => this.set({ state: "loading", message: "Reconectando el reproductor integrado…" }));
    on<{ message: string }>("initialization_error", ({ message }) => this.set({ state: "error", message: `No se pudo iniciar: ${message}` }));
    on<{ message: string }>("authentication_error", () => this.set({ state: "error", message: "Spotify ha rechazado la sesión del reproductor integrado." }));
    on<{ message: string }>("account_error", () => this.set({ state: "error", message: "El reproductor integrado requiere Spotify Premium." }));
    on<{ message: string }>("playback_error", ({ message }) => console.warn("[spotify-sdk] playback_error", message));
    on<unknown>("autoplay_failed", () => console.warn("[spotify-sdk] autoplay bloqueado"));
    on<unknown>("player_state_changed", () => this.onPlayerStateChanged());

    const ok = await player.connect();
    if (!ok) { clearTimeout(timeout); this.set({ state: "error", message: "El reproductor integrado no pudo conectarse." }); }
  }

  /** Debe llamarse dentro de un gesto del usuario (política de autoplay). */
  activate() {
    this.player?.activateElement?.().catch(() => {});
  }

  stop() {
    this.player?.disconnect();
    this.player = null;
    this.set({ state: "idle" });
  }
}
