/**
 * Reproducción de Spotify mediante los mecanismos oficiales:
 * - Web API `/me/player/*` (Spotify Connect) para controlar cualquier dispositivo.
 * - Web Playback SDK como dispositivo propio "Cartucho Music" (si está disponible).
 *
 * El estado SIEMPRE viene de Spotify. Las actualizaciones optimistas solo adelantan
 * lo que el usuario acaba de pedir y se corrigen con la siguiente lectura.
 */
import type {
  DevicesModule, InAppPlayerStatus, PlayContext, PlaybackDevice, PlaybackModule, PlaybackState, QueueSnapshot, RepeatMode,
} from "../types";
import { NoActiveDeviceError, PremiumRequiredError, UnsupportedOperationError } from "../errors";
import { HttpError } from "@/services/http/errors";
import { LIMITS, spotifyReason, type SpotifyApi } from "./api";
import { tracksFrom, uri } from "./mappers";
import type { SpotifyPlaybackState } from "./schemas";
import type { WebPlaybackDevice } from "./webPlayback";

export interface SpotifyPlaybackOptions {
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  isHidden?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
}

const toRepeat: Record<string, RepeatMode> = { off: "off", context: "all", track: "one" };
const fromRepeat: Record<RepeatMode, string> = { off: "off", all: "context", one: "track" };

export const POLL = { playing: 5_000, paused: 10_000, idle: 15_000, hidden: 30_000, afterCommand: 400 };

export class SpotifyPlayback implements PlaybackModule, DevicesModule {
  private state: PlaybackState | null = null;
  private readonly listeners = new Set<(s: PlaybackState | null) => void>();
  private timer: unknown = null;
  private polling = false;
  private inflight: Promise<void> | null = null;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (id: unknown) => void;
  private readonly isHidden: () => boolean;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly api: SpotifyApi, private readonly sdk: WebPlaybackDevice | null, opts: SpotifyPlaybackOptions = {}) {
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
    this.isHidden = opts.isHidden ?? (() => typeof document !== "undefined" && document.visibilityState === "hidden");
  }

  /* ───────────── Estado ───────────── */

  getState() { return this.state; }

  subscribe(listener: (s: PlaybackState | null) => void) {
    this.listeners.add(listener);
    if (!this.polling) { this.polling = true; void this.refresh(); }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) this.stopPolling();
    };
  }

  private emit() { for (const l of this.listeners) l(this.state); }

  private commit(next: PlaybackState | null) {
    this.state = next;
    this.emit();
  }

  /** Corrección optimista inmediata (la siguiente lectura manda). */
  private patch(p: Partial<PlaybackState>) {
    if (!this.state) return;
    const position = this.position();
    this.commit({ ...this.state, positionMs: position, ...p, timestamp: this.now() });
  }

  private position(): number {
    const s = this.state;
    if (!s?.track) return 0;
    return Math.min(s.isPlaying ? s.positionMs + (this.now() - s.timestamp) : s.positionMs, s.track.durationMs);
  }

  mapState(s: SpotifyPlaybackState | null): PlaybackState | null {
    if (!s) return null;
    const [track] = s.currently_playing_type === "track" || s.currently_playing_type == null ? tracksFrom(s.item ? [s.item] : []) : [];
    const deviceId = s.device?.id ?? null;
    return {
      provider: "spotify",
      mode: deviceId && deviceId === this.sdk?.deviceId ? "in-app" : "remote",
      track: track ?? null,
      isPlaying: s.is_playing,
      positionMs: s.progress_ms ?? 0,
      timestamp: this.now(),
      volume: s.device?.volume_percent != null ? s.device.volume_percent / 100 : null,
      shuffle: s.shuffle_state ?? false,
      repeat: toRepeat[s.repeat_state ?? "off"] ?? "off",
      device: s.device && deviceId ? { id: deviceId, name: s.device.name, type: s.device.type } : null,
    };
  }

  /** Lee el estado real. Las lecturas concurrentes se agrupan. */
  refresh(): Promise<void> {
    this.inflight ??= this.api.playbackState()
      .then((s) => this.commit(this.mapState(s)))
      .catch((e) => console.warn("[spotify] estado", e))
      .finally(() => { this.inflight = null; this.schedule(); });
    return this.inflight;
  }

  /** Intervalo adaptativo: rápido al terminar la pista, lento en pausa u oculto. */
  nextPollDelay(): number {
    if (this.isHidden()) return POLL.hidden;
    const s = this.state;
    if (!s?.track) return POLL.idle;
    if (!s.isPlaying) return POLL.paused;
    const remaining = s.track.durationMs - this.position();
    return Math.max(500, Math.min(POLL.playing, remaining + 600));
  }

  private schedule(delay = this.nextPollDelay()) {
    if (!this.polling) return;
    if (this.timer != null) this.clearTimer(this.timer);
    this.timer = this.setTimer(() => { this.timer = null; void this.refresh(); }, delay);
  }

  private stopPolling() {
    this.polling = false;
    if (this.timer != null) this.clearTimer(this.timer);
    this.timer = null;
  }

  /** Tras una orden, Spotify tarda un instante en reflejarla. */
  private refreshSoon() { this.schedule(POLL.afterCommand); }

  /* ───────────── Órdenes ───────────── */

  private async command(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      const reason = spotifyReason(e);
      if (reason === "PREMIUM_REQUIRED") throw new PremiumRequiredError("spotify");
      if (reason === "NO_ACTIVE_DEVICE" || (e instanceof HttpError && e.status === 404)) throw new NoActiveDeviceError("spotify");
      throw e;
    } finally {
      this.refreshSoon();
    }
  }

  /** Dispositivo al que enviar la reproducción si no hay ninguno activo. */
  private async targetDevice(): Promise<string | undefined> {
    if (this.state?.device) return undefined; // ya hay uno activo: Spotify lo usa por defecto
    if (this.sdk?.deviceId) return this.sdk.deviceId;
    const devices = await this.api.devices();
    const d = devices.find((x) => x.is_active && x.id) ?? devices.find((x) => !x.is_restricted && x.id);
    if (!d?.id) throw new NoActiveDeviceError("spotify");
    return d.id;
  }

  async play(ctx: PlayContext) {
    this.sdk?.activate(); // dentro del gesto del usuario
    const body: Record<string, unknown> = {};
    switch (ctx.kind) {
      case "album":
      case "playlist":
        body.context_uri = ctx.kind === "album" ? uri.album(ctx.id) : uri.playlist(ctx.id);
        if (ctx.startTrackId) body.offset = { uri: uri.track(ctx.startTrackId) };
        break;
      case "artist":
        body.context_uri = uri.artist(ctx.id);
        break;
      case "tracks": {
        // Ventana de como máximo 100 URIs alrededor de la canción elegida.
        const start = ctx.startIndex ?? 0;
        const from = Math.max(0, Math.min(start, ctx.trackIds.length - LIMITS.queueUris));
        const ids = ctx.trackIds.slice(from, from + LIMITS.queueUris);
        body.uris = ids.map(uri.track);
        body.offset = { position: start - from };
        break;
      }
    }
    await this.command(async () => {
      const device_id = await this.targetDevice();
      await this.api.http.put("me/player/play", { query: { device_id }, body });
    });
    // La nueva pista no tiene estado optimista posible: esperar a que Spotify la refleje.
    await this.sleep(POLL.afterCommand);
    await this.refresh();
  }

  pause() {
    this.patch({ isPlaying: false });
    return this.command(() => this.api.http.put("me/player/pause"));
  }
  resume() {
    this.sdk?.activate();
    this.patch({ isPlaying: true });
    return this.command(async () => {
      const device_id = await this.targetDevice();
      await this.api.http.put("me/player/play", { query: { device_id } });
    });
  }
  next() { return this.command(() => this.api.http.post("me/player/next")); }
  async previous() {
    // Igual que los clientes oficiales: pasados 3 s, vuelve al inicio de la canción.
    if (this.position() > 3000) return this.seek(0);
    return this.command(() => this.api.http.post("me/player/previous"));
  }
  seek(ms: number) {
    const pos = Math.max(0, Math.round(ms));
    this.patch({ positionMs: pos });
    return this.command(() => this.api.http.put("me/player/seek", { query: { position_ms: pos } }));
  }
  setVolume(v: number) {
    const pct = Math.round(Math.max(0, Math.min(1, v)) * 100);
    this.patch({ volume: pct / 100 });
    return this.command(() => this.api.http.put("me/player/volume", { query: { volume_percent: pct } }));
  }
  setShuffle(on: boolean) {
    this.patch({ shuffle: on });
    return this.command(() => this.api.http.put("me/player/shuffle", { query: { state: on } }));
  }
  setRepeat(mode: RepeatMode) {
    this.patch({ repeat: mode });
    return this.command(() => this.api.http.put("me/player/repeat", { query: { state: fromRepeat[mode] } }));
  }

  getQueue(signal?: AbortSignal): Promise<QueueSnapshot> { return this.api.queue(signal); }
  addToQueue(trackId: string) {
    return this.command(() => this.api.http.post("me/player/queue", { query: { uri: uri.track(trackId) } }));
  }
  // La Web API no permite quitar ni reordenar elementos de la cola.
  async removeFromQueue(_index: number): Promise<void> { throw new UnsupportedOperationError("spotify", "removeFromQueue"); }
  async moveInQueue(_from: number, _to: number): Promise<void> { throw new UnsupportedOperationError("spotify", "moveInQueue"); }

  /* ───────────── Dispositivos ───────────── */

  async list(signal?: AbortSignal): Promise<PlaybackDevice[]> {
    const ds = await this.api.devices(signal);
    return ds.filter((d) => d.id).map((d) => ({
      id: d.id!, name: d.name, type: d.type, isActive: d.is_active, isThisApp: d.id === this.sdk?.deviceId,
      restricted: d.is_restricted ?? false, volume: d.volume_percent != null ? d.volume_percent / 100 : null,
    }));
  }

  transfer(deviceId: string, play = true) {
    if (deviceId === this.sdk?.deviceId) this.sdk.activate();
    return this.command(() => this.api.http.put("me/player", { body: { device_ids: [deviceId], play } }));
  }

  getInAppStatus(): InAppPlayerStatus {
    return this.sdk?.getStatus() ?? { state: "unsupported", message: "El reproductor integrado no está disponible en este entorno." };
  }
  subscribeInApp(l: (s: InAppPlayerStatus) => void) { return this.sdk?.subscribe(l) ?? (() => {}); }

  dispose() {
    this.stopPolling();
    this.listeners.clear();
    this.sdk?.stop();
  }
}
