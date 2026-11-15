/**
 * Actualizaciones desde GitHub Releases (plugin oficial de Tauri).
 *
 * - Cada Release publica `latest.json` y el instalador firmado con la clave privada del
 *   proyecto; la app solo acepta actualizaciones firmadas con la clave pública incluida.
 * - Comprobación manual (botón) y automática (al abrir y cada 6 horas, si está activada).
 * - En Windows, el instalador se ejecuta en modo pasivo y la app se reinicia sola.
 */
import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { z } from "zod";
import type { Update } from "@tauri-apps/plugin-updater";
import { isTauri } from "@/database/runtime";
import { createKvStateStorage } from "@/database/zustandStorage";

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "uptodate" }
  | { state: "available"; version: string; notes: string; date: string | null }
  | { state: "downloading"; version: string; downloaded: number; total: number | null }
  | { state: "installing"; version: string }
  | { state: "error"; message: string };

export const AUTO_CHECK_EVERY_MS = 6 * 60 * 60_000;
const FIRST_CHECK_DELAY_MS = 8_000;

interface UpdatesStore {
  status: UpdateStatus;
  autoCheck: boolean;
  lastChecked: number | null;
  setAutoCheck: (v: boolean) => void;
  check: (opts?: { manual?: boolean }) => Promise<void>;
  install: () => Promise<void>;
}

/** El objeto `Update` del plugin no es serializable: vive fuera del store. */
let pending: Update | null = null;

/** Mensaje claro para los errores más habituales del actualizador. */
export function describeUpdateError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/404|valid release JSON|Not Found/i.test(msg)) return "Todavía no hay ninguna versión publicada con actualizaciones automáticas.";
  if (/signature/i.test(msg)) return "La actualización no tiene una firma válida y se ha descartado por seguridad.";
  if (/network|connect|dns|timed out|timeout/i.test(msg)) return "Sin conexión con GitHub. Inténtalo más tarde.";
  return `No se pudo comprobar: ${msg}`;
}

const persisted = z.object({
  autoCheck: z.boolean().catch(true),
  lastChecked: z.number().nullable().catch(null),
});

export const useUpdates = create<UpdatesStore>()(
  persist(
    (set, get) => ({
      status: { state: "idle" },
      autoCheck: true,
      lastChecked: null,
      setAutoCheck: (autoCheck) => set({ autoCheck }),

      check: async ({ manual = false } = {}) => {
        const s = get().status.state;
        if (s === "checking" || s === "downloading" || s === "installing") return;
        if (!isTauri()) {
          if (manual) set({ status: { state: "error", message: "Las actualizaciones solo funcionan en la app de escritorio." } });
          return;
        }
        if (manual) set({ status: { state: "checking" } });
        try {
          const { check } = await import("@tauri-apps/plugin-updater");
          const update = await check({ timeout: 20_000 });
          set({ lastChecked: Date.now() });
          if (update) {
            pending = update;
            set({ status: { state: "available", version: update.version, notes: update.body ?? "", date: update.date ?? null } });
          } else if (manual || get().status.state !== "available") {
            set({ status: { state: manual ? "uptodate" : "idle" } });
          }
        } catch (e) {
          console.warn("[updates]", e);
          // Las comprobaciones automáticas fallan en silencio; las manuales lo explican.
          if (manual) set({ status: { state: "error", message: describeUpdateError(e) } });
        }
      },

      install: async () => {
        const st = get().status;
        if (st.state !== "available" || !pending) return;
        const version = st.version;
        let downloaded = 0;
        let total: number | null = null;
        set({ status: { state: "downloading", version, downloaded, total } });
        try {
          await pending.downloadAndInstall((ev) => {
            if (ev.event === "Started") total = ev.data.contentLength ?? null;
            if (ev.event === "Progress") downloaded += ev.data.chunkLength;
            if (ev.event === "Finished") set({ status: { state: "installing", version } });
            else set({ status: { state: "downloading", version, downloaded, total } });
          });
          // En Windows el instalador cierra la app; en el resto de sistemas, reinicio explícito.
          const { relaunch } = await import("@tauri-apps/plugin-process");
          await relaunch();
        } catch (e) {
          console.warn("[updates] instalación", e);
          set({ status: { state: "error", message: `No se pudo instalar la actualización: ${e instanceof Error ? e.message : String(e)}` } });
        }
      },
    }),
    {
      name: "updates",
      version: 1,
      storage: createJSONStorage(() => createKvStateStorage()),
      partialize: (s) => ({ autoCheck: s.autoCheck, lastChecked: s.lastChecked }),
      merge: (p, current) => ({ ...current, ...persisted.parse(typeof p === "object" && p ? p : {}) }),
      skipHydration: true,
    },
  ),
);

/** Comprobación automática: poco después de abrir y luego cada 6 horas. */
export function useAutoUpdateCheck() {
  const autoCheck = useUpdates((s) => s.autoCheck);
  useEffect(() => {
    if (!autoCheck || !isTauri()) return;
    const first = setTimeout(() => void useUpdates.getState().check(), FIRST_CHECK_DELAY_MS);
    const every = setInterval(() => void useUpdates.getState().check(), AUTO_CHECK_EVERY_MS);
    return () => { clearTimeout(first); clearInterval(every); };
  }, [autoCheck]);
}
