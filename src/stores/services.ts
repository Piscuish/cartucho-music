import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { z } from "zod";
import { createKvStateStorage } from "@/database/zustandStorage";
import { providerIds } from "@/providers/registry";
import type { ProviderId } from "@/types/music";

/**
 * Servicios que el usuario ha ocultado. Un servicio oculto no se registra:
 * desaparece de la barra lateral, de Inicio, de la búsqueda y de la biblioteca.
 * Apple Music empieza oculto hasta que se pueda vincular (requiere Apple Developer Program).
 */
interface ServicesPrefs {
  hidden: ProviderId[];
  setHidden: (id: ProviderId, hidden: boolean) => void;
}

const DEFAULT_HIDDEN: ProviderId[] = ["apple-music"];

const schema = z.object({
  hidden: z.array(z.enum(providerIds as [ProviderId, ...ProviderId[]])).catch(DEFAULT_HIDDEN),
});

export const useServicesPrefs = create<ServicesPrefs>()(
  persist(
    (set) => ({
      hidden: DEFAULT_HIDDEN,
      setHidden: (id, hidden) => set((s) => ({ hidden: hidden ? [...new Set([...s.hidden, id])] : s.hidden.filter((x) => x !== id) })),
    }),
    {
      name: "services",
      version: 1,
      storage: createJSONStorage(() => createKvStateStorage()),
      partialize: (s) => ({ hidden: s.hidden }),
      merge: (persisted, current) => ({ ...current, ...schema.parse(typeof persisted === "object" && persisted ? persisted : {}) }),
      skipHydration: true,
    },
  ),
);

export const isHidden = (id: ProviderId) => useServicesPrefs.getState().hidden.includes(id);
