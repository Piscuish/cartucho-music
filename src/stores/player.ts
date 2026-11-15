import { create } from "zustand";
import { useEffect, useState } from "react";
import type { ProviderId, Track } from "@/types/music";
import type { PlayContext, PlaybackState, RepeatMode } from "@/providers/types";
import { providers, registry } from "@/providers/registry";
import { describeError, MissingPermissionError, NoActiveDeviceError } from "@/providers/errors";
import { queryClient } from "@/app/queryClient";
import { history } from "@/database/stores";

/**
 * Estado del reproductor: es un REFLEJO del proveedor activo.
 * Este store no simula nada: solo delega en `provider.playback` y escucha su estado.
 *
 * Reglas:
 * - Solo hay un proveedor activo. Al reproducir en otro, el anterior se pausa.
 * - La cola siempre pertenece a un único proveedor.
 */
interface PlayerStore {
  activeProvider: ProviderId | null;
  state: PlaybackState | null;
  /** Volumen previo al silencio, para restaurarlo. */
  volumeBeforeMute: number | null;
  /** Mensaje para el usuario (errores y confirmaciones), con acción opcional. */
  toast: Toast | null;

  play: (provider: ProviderId, ctx: PlayContext) => Promise<void>;
  toggle: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  setVolume: (v: number) => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleShuffle: () => Promise<void>;
  cycleRepeat: () => Promise<void>;
  addToQueue: (track: Track) => Promise<void>;
  removeFromQueue: (index: number) => Promise<void>;
  moveInQueue: (from: number, to: number) => Promise<void>;
  showToast: (t: Toast) => void;
  clearToast: () => void;
}

export interface Toast { kind: "error" | "info"; message: string; action?: "devices" | "reconnect" }

/** Convierte un error en un toast; algunos llevan acción directa. */
export function toastFor(e: unknown): Toast {
  const action = e instanceof NoActiveDeviceError ? "devices" : e instanceof MissingPermissionError ? "reconnect" : undefined;
  return { kind: "error", message: describeError(e), action };
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

let unsubscribe: (() => void) | null = null;
let attached: unknown = null;
let lastRecorded: string | null = null;

function attach(provider: ProviderId) {
  unsubscribe?.();
  const p = registry.get(provider);
  attached = p;
  lastRecorded = null; // nueva sesión con el proveedor: la primera pista también cuenta
  usePlayer.setState({ activeProvider: provider, state: p.playback.getState() });
  unsubscribe = p.playback.subscribe((state) => {
    usePlayer.setState({ state });
    // Historial local: una entrada por cada pista que empieza a sonar.
    const t = state?.track;
    if (t && state?.isPlaying && lastRecorded !== `${t.provider}:${t.id}`) {
      lastRecorded = `${t.provider}:${t.id}`;
      history.add(t.provider, t.id, t).catch((e) => console.warn("[history]", e));
    }
  });
}

const nextRepeat: Record<RepeatMode, RepeatMode> = { off: "all", all: "one", one: "off" };

export const usePlayer = create<PlayerStore>()((set, get) => {
  /** Ejecuta una acción sobre el proveedor activo y captura el error para la UI. */
  const run = async (fn: (pb: ReturnType<typeof registry.get>["playback"]) => Promise<void>) => {
    const id = get().activeProvider;
    if (!id) return;
    try {
      await fn(registry.get(id).playback);
    } catch (e) {
      console.warn("[player]", e);
      get().showToast(toastFor(e));
    }
  };

  return {
    activeProvider: null,
    state: null,
    volumeBeforeMute: null,
    toast: null,

    play: async (provider, ctx) => {
      const prev = get().activeProvider;
      try {
        if (prev && prev !== provider) {
          const prevPb = registry.tryGet(prev)?.playback;
          if (prevPb?.getState()?.isPlaying) await prevPb.pause();
        }
        if (prev !== provider) attach(provider);
        await registry.get(provider).playback.play(ctx);
        if (get().toast?.kind === "error") get().clearToast();
      } catch (e) {
        console.warn("[player]", e);
        get().showToast(toastFor(e));
      }
    },
    toggle: () => run((pb) => (pb.getState()?.isPlaying ? pb.pause() : pb.resume())),
    next: () => run((pb) => pb.next()),
    previous: () => run((pb) => pb.previous()),
    seek: (ms) => run((pb) => pb.seek(ms)),
    setVolume: (v) => run((pb) => pb.setVolume(Math.max(0, Math.min(1, v)))),
    toggleMute: () => run(async (pb) => {
      const vol = pb.getState()?.volume ?? 0;
      if (vol > 0) { set({ volumeBeforeMute: vol }); await pb.setVolume(0); }
      else await pb.setVolume(get().volumeBeforeMute ?? 0.7);
    }),
    toggleShuffle: () => run((pb) => pb.setShuffle(!pb.getState()?.shuffle)),
    cycleRepeat: () => run((pb) => pb.setRepeat(nextRepeat[pb.getState()?.repeat ?? "off"])),
    addToQueue: async (track) => {
      const active = get().activeProvider;
      // La cola pertenece a un único servicio: no se mezclan.
      if (active && active !== track.provider) {
        get().showToast({ kind: "error", message: `La cola actual es de ${providers[active].name}. Cartucho no mezcla servicios en una cola.` });
        return;
      }
      try {
        if (!active) attach(track.provider);
        await registry.get(track.provider).playback.addToQueue(track.id);
        await queryClient.invalidateQueries({ queryKey: [track.provider, "queue"] });
        get().showToast({ kind: "info", message: `«${track.name}» añadida a la cola` });
      } catch (e) {
        console.warn("[player]", e);
        get().showToast(toastFor(e));
      }
    },
    removeFromQueue: async (index) => {
      await run((pb) => pb.removeFromQueue(index));
      const id = get().activeProvider;
      if (id) await queryClient.invalidateQueries({ queryKey: [id, "queue"] });
    },
    moveInQueue: async (from, to) => {
      await run((pb) => pb.moveInQueue(from, to));
      const id = get().activeProvider;
      if (id) await queryClient.invalidateQueries({ queryKey: [id, "queue"] });
    },
    showToast: (t) => {
      if (toastTimer) clearTimeout(toastTimer);
      set({ toast: t });
      if (t.kind === "info") toastTimer = setTimeout(() => set({ toast: null }), 2500);
    },
    clearToast: () => set({ toast: null }),
  };
});

/**
 * Reacciona a cambios del registro:
 * - Si el proveedor activo se sustituye (p. ej. vista previa → Spotify conectado), se re-engancha.
 * - Si no suena nada en Cartucho y hay un servicio real conectado, se engancha a él para
 *   mostrar lo que esté sonando en otros dispositivos (Spotify Connect).
 */
registry.subscribe(() => {
  const { activeProvider, state } = usePlayer.getState();
  if (activeProvider) {
    const current = registry.tryGet(activeProvider);
    if (!current) { unsubscribe?.(); attached = null; usePlayer.setState({ activeProvider: null, state: null }); return; }
    if (current !== attached) attach(activeProvider);
    if (!(current.isPreview && !state?.isPlaying)) return;
  }
  const real = registry.list().find((p) => !p.isPreview);
  if (real && real !== attached) attach(real.id);
});

/** Pista actual (atajo). */
export const useCurrentTrack = () => usePlayer((s) => s.state?.track ?? null);

/**
 * Posición interpolada a partir de `positionMs` + `timestamp`.
 * El proveedor solo emite cambios; la UI calcula el avance localmente.
 */
export function usePlaybackPosition(intervalMs = 250): number {
  const state = usePlayer((s) => s.state);
  const compute = () => {
    if (!state?.track) return 0;
    const pos = state.isPlaying ? state.positionMs + (Date.now() - state.timestamp) : state.positionMs;
    return Math.max(0, Math.min(pos, state.track.durationMs));
  };
  const [pos, setPos] = useState(compute);
  useEffect(() => {
    setPos(compute());
    if (!state?.isPlaying) return;
    const id = window.setInterval(() => setPos(compute()), intervalMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, intervalMs]);
  return pos;
}
