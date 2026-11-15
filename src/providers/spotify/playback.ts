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
import { NoActiveDeviceError, PremiumRequiredError } from "../errors";
import { HttpError } from "@/services/http/errors";
import { LIMITS, spotifyReason, type SpotifyApi } from "./api";
import { mapTrack, tracksFrom, uri } from "./mappers";
import { trackSchema, type SpotifyPlaybackState } from "./schemas";
import type { Track } from "@/types/music";
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
  /**
   * Cola gestionada por Cartucho: [actual, ...siguientes]. Existe desde que el usuario
   * quita o reordena; Spotify no permite editar su cola, así que Cartucho reenvía la lista.
   */
  private managed: Track[] | null = null;
  /** Último contexto lanzado desde Cartucho (para recuperar la lista completa al editar). */
  private lastContext: PlayContext | null = null;

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
      .then((s) => { const next = this.mapState(s); this.syncManaged(next); this.commit(next); })
      .catch((e) => console.warn("[spotify] estado", e))
      .finally(() => { this.inflight = null; this.schedule(); });
    return this.inflight;
  }

  /** Al avanzar, se descartan las pistas ya sonadas; si suena algo ajeno a la lista, se deja de gestionar. */
  private syncManaged(s: PlaybackState | null) {
    if (!this.managed) return;
    const id = s?.track?.id;
    if (!id) return;
    const i = this.managed.findIndex((t) => t.id === id);
    if (i < 0) this.managed = null;
    else if (i > 0) this.managed = this.managed.slice(i);
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
    this.managed = null;
    this.lastContext = ctx;
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

  async getQueue(signal?: AbortSignal): Promise<QueueSnapshot> {
    const current = this.state?.track ?? null;
    if (this.managed && current && this.managed[0]?.id === current.id) {
      return { current, upNext: this.managed.slice(1) };
    }
    return this.api.queue(signal);
  }

  async addToQueue(trackId: string) {
    if (this.managed) {
      // Con la cola gestionada, la canción entra justo después de la actual.
      const track = await this.trackById(trackId);
      if (track) return this.applyQueue([this.managed[0], track, ...this.managed.slice(1)]);
    }
    return this.command(() => this.api.http.post("me/player/queue", { query: { uri: uri.track(trackId) } }));
  }

  /** Quita la canción `index` de «A continuación». */
  async removeFromQueue(index: number): Promise<void> {
    const list = await this.editableList();
    if (index < 0 || index + 1 >= list.length) return;
    list.splice(index + 1, 1);
    await this.applyQueue(list);
  }

  /** Mueve una canción de «A continuación» de `from` a `to`. */
  async moveInQueue(from: number, to: number): Promise<void> {
    const list = await this.editableList();
    const up = list.slice(1);
    if (from < 0 || from >= up.length || to < 0 || to >= up.length || from === to) return;
    const [item] = up.splice(from, 1);
    up.splice(to, 0, item);
    await this.applyQueue([list[0], ...up]);
  }

  /**
   * Lista [actual, ...siguientes] para editar. Si la reproducción la lanzó Cartucho con un
   * álbum o playlist, se usa la lista completa; si no, la cola que informa Spotify.
   */
  private async editableList(): Promise<Track[]> {
    const current = this.state?.track;
    if (!current) throw new NoActiveDeviceError("spotify");
    if (this.managed && this.managed[0]?.id === current.id) return [...this.managed];
    let source: Track[] | null = null;
    const ctx = this.lastContext;
    try {
      if (ctx?.kind === "album") source = (await this.api.album(ctx.id)).tracks;
      else if (ctx?.kind === "playlist") source = (await this.api.playlist(ctx.id)).tracks;
    } catch { source = null; }
    const i = source ? source.findIndex((t) => t.id === current.id) : -1;
    if (source && i >= 0) return source.slice(i, i + LIMITS.queueUris);
    const q = await this.api.queue();
    return [q.current ?? current, ...q.upNext].slice(0, LIMITS.queueUris);
  }

  /** Reenvía la lista a Spotify continuando la canción actual en el mismo punto. */
  private async applyQueue(list: Track[]) {
    const trimmed = list.slice(0, LIMITS.queueUris);
    const position = Math.round(this.position());
    await this.command(async () => {
      // Con aleatorio activo, Spotify desordenaría la lista.
      if (this.state?.shuffle) await this.api.http.put("me/player/shuffle", { query: { state: false } });
      await this.api.http.put("me/player/play", {
        query: { device_id: this.state?.device?.id ?? undefined },
        body: { uris: trimmed.map((t) => uri.track(t.id)), offset: { position: 0 }, position_ms: position },
      });
    });
    this.managed = trimmed;
    this.lastContext = { kind: "tracks", trackIds: trimmed.map((t) => t.id) };
    this.patch({ shuffle: false });
  }

  /** Pista completa (para mostrarla en la cola): de lo ya conocido o con `GET /tracks/{id}`. */
  private async trackById(trackId: string): Promise<Track | null> {
    const known = [...(this.managed ?? []), this.state?.track].find((t) => t?.id === trackId);
    if (known) return known;
    const t = await this.api.http.get(`tracks/${encodeURIComponent(trackId)}`, { schema: trackSchema });
    return mapTrack(t);
  }

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
