import type { ProviderId, Track } from "@/types/music";
import type { PlayContext, PlaybackModule, PlaybackState, QueueSnapshot, RepeatMode } from "../types";
import { UnsupportedOperationError } from "../errors";
import type { ProviderCapabilities } from "../types";

/**
 * Reproducción de VISTA PREVIA: no emite audio.
 * Avanza el tiempo para poder evaluar el diseño y respeta las capacidades del
 * servicio al que representa (p. ej. la cola de Spotify no se puede reordenar).
 * El estado sale con `mode: "preview"` y la UI lo indica siempre.
 */
export interface PreviewPlaybackDeps {
  provider: ProviderId;
  capabilities: ProviderCapabilities;
  resolve: (ctx: PlayContext) => Promise<{ tracks: Track[]; startIndex: number }>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

export class PreviewPlayback implements PlaybackModule {
  private state: PlaybackState | null = null;
  private order: Track[] = [];
  private index = -1;
  private readonly listeners = new Set<(s: PlaybackState | null) => void>();
  private timer: unknown = null;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (id: unknown) => void;

  constructor(private readonly deps: PreviewPlaybackDeps) {
    this.now = deps.now ?? Date.now;
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  }

  getState() { return this.state; }

  subscribe(listener: (s: PlaybackState | null) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Posición real en este instante (interpolada si está sonando). */
  private position(): number {
    const s = this.state;
    if (!s?.track) return 0;
    const pos = s.isPlaying ? s.positionMs + (this.now() - s.timestamp) : s.positionMs;
    return Math.min(pos, s.track.durationMs);
  }

  private commit(patch: Partial<PlaybackState>) {
    const base: PlaybackState = this.state ?? {
      provider: this.deps.provider, mode: "preview", track: null, isPlaying: false, positionMs: 0,
      timestamp: this.now(), volume: 0.7, shuffle: false, repeat: "off", device: null,
    };
    const positionMs = patch.positionMs ?? (this.state ? this.position() : 0);
    this.state = { ...base, ...patch, positionMs, timestamp: this.now() };
    this.schedule();
    for (const l of this.listeners) l(this.state);
  }

  /** Programa el salto a la siguiente pista cuando termine la actual. */
  private schedule() {
    if (this.timer != null) { this.clearTimer(this.timer); this.timer = null; }
    const s = this.state;
    if (!s?.track || !s.isPlaying) return;
    const remaining = Math.max(0, s.track.durationMs - s.positionMs);
    this.timer = this.setTimer(() => { this.timer = null; void this.advance(true); }, remaining);
  }

  private async advance(auto: boolean) {
    const s = this.state;
    if (!s) return;
    if (auto && s.repeat === "one") return this.commit({ positionMs: 0 });
    let next = this.index + 1;
    if (next >= this.order.length) {
      if (s.repeat === "all" && this.order.length) next = 0;
      else return this.commit({ isPlaying: false, positionMs: s.track?.durationMs ?? 0 });
    }
    this.index = next;
    this.commit({ track: this.order[next], positionMs: 0 });
  }

  async play(ctx: PlayContext) {
    const { tracks, startIndex } = await this.deps.resolve(ctx);
    if (!tracks.length) return;
    if (tracks.some((t) => t.provider !== this.deps.provider)) {
      throw new Error("Una cola no puede mezclar contenido de distintos servicios");
    }
    this.order = tracks;
    this.index = Math.min(Math.max(0, startIndex), tracks.length - 1);
    if (this.state?.shuffle) this.shuffleRest();
    this.commit({ track: this.order[this.index], positionMs: 0, isPlaying: true });
  }

  async pause() { if (this.state) this.commit({ isPlaying: false }); }
  async resume() {
    if (!this.state?.track) return;
    const atEnd = this.position() >= this.state.track.durationMs;
    this.commit({ isPlaying: true, ...(atEnd ? { positionMs: 0 } : {}) });
  }
  async next() { await this.advance(false); }
  async previous() {
    if (!this.state) return;
    if (this.position() > 3000 || this.index <= 0) return this.commit({ positionMs: 0 });
    this.index -= 1;
    this.commit({ track: this.order[this.index], positionMs: 0 });
  }
  async seek(positionMs: number) {
    this.guard(this.deps.capabilities.playback.seek, "seek");
    const max = this.state?.track?.durationMs ?? 0;
    this.commit({ positionMs: Math.max(0, Math.min(positionMs, max)) });
  }
  async setVolume(volume: number) {
    this.guard(this.deps.capabilities.playback.volume, "setVolume");
    this.commit({ volume: Math.max(0, Math.min(1, volume)) });
  }
  async setShuffle(on: boolean) {
    this.guard(this.deps.capabilities.playback.shuffle, "setShuffle");
    if (on) this.shuffleRest();
    this.commit({ shuffle: on });
  }
  async setRepeat(mode: RepeatMode) {
    this.guard(this.deps.capabilities.playback.repeat, "setRepeat");
    this.commit({ repeat: mode });
  }

  async getQueue(): Promise<QueueSnapshot> {
    this.guard(this.deps.capabilities.queue.read, "getQueue");
    return { current: this.state?.track ?? null, upNext: this.order.slice(this.index + 1) };
  }
  async addToQueue(trackId: string) {
    this.guard(this.deps.capabilities.queue.add, "addToQueue");
    const { tracks } = await this.deps.resolve({ kind: "tracks", trackIds: [trackId] });
    this.order.splice(this.index + 1, 0, ...tracks);
    this.commit({});
  }
  async removeFromQueue(i: number) {
    this.guard(this.deps.capabilities.queue.remove, "removeFromQueue");
    this.order.splice(this.index + 1 + i, 1);
    this.commit({});
  }
  async clearQueue() {
    this.guard(this.deps.capabilities.queue.remove, "clearQueue");
    this.order = this.order.slice(0, this.index + 1);
    this.commit({});
  }
  async moveInQueue(from: number, to: number) {
    this.guard(this.deps.capabilities.queue.reorder, "moveInQueue");
    const up = this.order.slice(this.index + 1);
    const [item] = up.splice(from, 1);
    if (!item) return;
    up.splice(to, 0, item);
    this.order = [...this.order.slice(0, this.index + 1), ...up];
    this.commit({});
  }

  dispose() {
    if (this.timer != null) this.clearTimer(this.timer);
    this.listeners.clear();
  }

  private shuffleRest() {
    const head = this.order.slice(0, this.index + 1);
    const rest = this.order.slice(this.index + 1);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.order = [...head, ...rest];
  }

  private guard(allowed: boolean, op: string) {
    if (!allowed) throw new UnsupportedOperationError(this.deps.provider, op);
  }
}
