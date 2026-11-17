/**
 * Orden propio de las playlists en la barra lateral. Spotify no ofrece a otras apps el orden
 * ni las playlists fijadas de tu biblioteca, así que Cartucho guarda el suyo en este equipo.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { z } from "zod";
import { createKvStateStorage } from "@/database/zustandStorage";
import type { Playlist } from "@/types/music";

export const playlistKey = (p: Pick<Playlist, "provider" | "id">) => `${p.provider}:${p.id}`;

interface PlaylistOrder {
  /** Fijadas, en su orden (siempre arriba). */
  pinned: string[];
  /** Orden manual del resto. Las que no están aquí van después, en el orden del servicio. */
  order: string[];
  togglePin: (key: string) => void;
  /** Mueve `key` justo antes de `beforeKey` (o al final si es null), dentro de su grupo. */
  move: (key: string, beforeKey: string | null, visible: string[]) => void;
}

/** Ordena: fijadas primero; luego el orden manual; luego el resto como venga. */
export function sortPlaylists<T extends Pick<Playlist, "provider" | "id">>(items: T[], pinned: string[], order: string[]): T[] {
  const rank = (k: string) => {
    const p = pinned.indexOf(k);
    if (p >= 0) return p;
    const o = order.indexOf(k);
    return o >= 0 ? 10_000 + o : Number.POSITIVE_INFINITY;
  };
  return items
    .map((it, i) => ({ it, i, r: rank(playlistKey(it)) }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r))
    .map((x) => x.it);
}

const schema = z.object({ pinned: z.array(z.string()).catch([]), order: z.array(z.string()).catch([]) });

export const usePlaylistOrder = create<PlaylistOrder>()(
  persist(
    (set, get) => ({
      pinned: [],
      order: [],
      togglePin: (key) => set((s) => (s.pinned.includes(key) ? { pinned: s.pinned.filter((k) => k !== key) } : { pinned: [...s.pinned, key] })),
      move: (key, beforeKey, visible) => {
        if (key === beforeKey) return;
        const { pinned } = get();
        const inPinned = pinned.includes(key);
        // Lista del grupo de `key` en el orden que ve el usuario.
        const group = visible.filter((k) => pinned.includes(k) === inPinned).filter((k) => k !== key);
        const at = beforeKey && group.includes(beforeKey) ? group.indexOf(beforeKey) : group.length;
        group.splice(at, 0, key);
        if (inPinned) set({ pinned: group });
        else set((s) => ({ order: [...group, ...s.order.filter((k) => !group.includes(k))] }));
      },
    }),
    {
      name: "playlist-order",
      version: 1,
      storage: createJSONStorage(() => createKvStateStorage()),
      partialize: (s) => ({ pinned: s.pinned, order: s.order }),
      merge: (p, current) => ({ ...current, ...schema.parse(typeof p === "object" && p ? p : {}) }),
      skipHydration: true,
    },
  ),
);
