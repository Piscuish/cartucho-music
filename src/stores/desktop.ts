import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { z } from "zod";
import { createKvStateStorage } from "@/database/zustandStorage";

/**
 * Preferencias de escritorio. Se guardan en SQLite como `state:desktop`;
 * Rust lee `startMinimized` al arrancar con Windows (ver `desktop.rs`).
 */
export interface DesktopPrefs {
  /** Cerrar la ventana la oculta en la bandeja en lugar de salir. */
  closeToTray: boolean;
  /** Al iniciarse con Windows, arrancar oculta en la bandeja. */
  startMinimized: boolean;
  /** Teclas multimedia globales (pueden chocar con la app oficial de Spotify si está abierta). */
  mediaKeys: boolean;
  notifyTrackChange: boolean;
  /** Solo notificar si la ventana no está visible. */
  notifyOnlyWhenHidden: boolean;
}

export const desktopDefaults: DesktopPrefs = {
  closeToTray: true,
  startMinimized: false,
  mediaKeys: false,
  notifyTrackChange: true,
  notifyOnlyWhenHidden: true,
};

const schema = z.object({
  closeToTray: z.boolean().catch(desktopDefaults.closeToTray),
  startMinimized: z.boolean().catch(desktopDefaults.startMinimized),
  mediaKeys: z.boolean().catch(desktopDefaults.mediaKeys),
  notifyTrackChange: z.boolean().catch(desktopDefaults.notifyTrackChange),
  notifyOnlyWhenHidden: z.boolean().catch(desktopDefaults.notifyOnlyWhenHidden),
});

export const parseDesktopPrefs = (raw: unknown): DesktopPrefs => schema.parse(typeof raw === "object" && raw ? raw : {});

interface DesktopStore extends DesktopPrefs {
  set: <K extends keyof DesktopPrefs>(key: K, value: DesktopPrefs[K]) => void;
  /** Estado en tiempo de ejecución de las teclas multimedia (no se persiste). */
  mediaKeysStatus: { state: "off" | "active" | "error"; message?: string };
}

export const useDesktop = create<DesktopStore>()(
  persist(
    (set) => ({
      ...desktopDefaults,
      mediaKeysStatus: { state: "off" },
      set: (key, value) => set({ [key]: value } as Partial<DesktopPrefs>),
    }),
    {
      name: "desktop",
      version: 1,
      storage: createJSONStorage(() => createKvStateStorage()),
      partialize: (s) => parseDesktopPrefs(s),
      merge: (persisted, current) => ({ ...current, ...parseDesktopPrefs(persisted) }),
      skipHydration: true,
    },
  ),
);
