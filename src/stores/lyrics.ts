import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { z } from "zod";
import { createKvStateStorage } from "@/database/zustandStorage";

/** Tamaños de letra (como los botones A− / A+ de Spotify). */
export const LYRICS_SIZES = [
  { label: "Pequeña", px: 34 },
  { label: "Normal", px: 44 },
  { label: "Grande", px: 56 },
  { label: "Muy grande", px: 68 },
  { label: "Enorme", px: 82 },
] as const;

interface LyricsPrefs {
  /** Buscar letras en LRCLIB (fuente externa, ver features/lyrics/lrclib.ts). */
  enabled: boolean;
  /** Índice en LYRICS_SIZES. */
  size: number;
  setEnabled: (v: boolean) => void;
  bigger: () => void;
  smaller: () => void;
}

const clamp = (n: number) => Math.max(0, Math.min(LYRICS_SIZES.length - 1, n));
const schema = z.object({ enabled: z.boolean().catch(true), size: z.number().int().catch(1) });

export const useLyricsPrefs = create<LyricsPrefs>()(
  persist(
    (set) => ({
      enabled: true,
      size: 1,
      setEnabled: (enabled) => set({ enabled }),
      bigger: () => set((s) => ({ size: clamp(s.size + 1) })),
      smaller: () => set((s) => ({ size: clamp(s.size - 1) })),
    }),
    {
      name: "lyrics",
      version: 1,
      storage: createJSONStorage(() => createKvStateStorage()),
      partialize: (s) => ({ enabled: s.enabled, size: s.size }),
      merge: (p, current) => {
        const v = schema.parse(typeof p === "object" && p ? p : {});
        return { ...current, enabled: v.enabled, size: clamp(v.size) };
      },
      skipHydration: true,
    },
  ),
);
