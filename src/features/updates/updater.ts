/**
 * Actualizaciones desde GitHub Releases (plugin oficial de Tauri).
 *
 * - Cada Release publica `latest.json` y el instalador firmado con la clave privada del
 *   proyecto; la app solo acepta actualizaciones firmadas con la clave pública incluida.
 * - Comprobación manual (botón) y automática (al abrir y cada 6 horas, si está activada).
 * - En Windows, el instalador se ejecuta en modo pasivo y la app se reinicia sola.
 * - En Android se busca el APK de la última Release, se descarga dentro de la app y se abre
 *   el instalador del sistema, que pide confirmar (ver apk.ts y src-tauri/src/apk_update.rs).
 */
import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { z } from "zod";
import type { Update } from "@tauri-apps/plugin-updater";
import { isTauri } from "@/database/runtime";
import { createKvStateStorage } from "@/database/zustandStorage";
import { IS_MOBILE_APP } from "@/utils/platform";
import { openExternal } from "@/utils/external";
import { checkApkUpdate } from "./apk";

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
/** Android: enlace de descarga del APK nuevo. */
let pendingApk: string | null = null;

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
        if (IS_MOBILE_APP) {
          try {
            const update = await checkApkUpdate(__APP_VERSION__);
            set({ lastChecked: Date.now() });
            pendingApk = update?.url ?? null;
            if (update) set({ status: { state: "available", version: update.version, notes: update.notes, date: update.date } });
            else if (manual || get().status.state !== "available") set({ status: { state: manual ? "uptodate" : "idle" } });
          } catch (e) {
            console.warn("[updates]", e);
            if (manual) set({ status: { state: "error", message: describeUpdateError(e) } });
          }
          return;
        }
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
        if (IS_MOBILE_APP) {
          if (st.state !== "available" || !pendingApk) return;
          const url = pendingApk;
          const version = st.version;
          set({ status: { state: "downloading", version, downloaded: 0, total: null } });
          try {
            const { Channel, invoke } = await import("@tauri-apps/api/core");
            const channel = new Channel<{ kind: "progress"; downloaded: number; total: number | null } | { kind: "installing" }>();
            channel.onmessage = (ev) => {
              if (ev.kind === "installing") set({ status: { state: "installing", version } });
              else set({ status: { state: "downloading", version, downloaded: ev.downloaded, total: ev.total } });
            };
            await invoke("apk_update_install", { url, onProgress: channel });
            set({ status: { state: "installing", version } });
          } catch (e) {
            console.warn("[updates] apk", e);
            // Plan B: descarga en el navegador; el usuario abre el APK desde allí.
            await openExternal(url).catch(() => {});
            set({ status: { state: "available", version, notes: "", date: null } });
          }
          return;
        }
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
