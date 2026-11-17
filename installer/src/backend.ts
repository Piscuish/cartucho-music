import { Channel, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export interface InstallerInfo {
  version: string;
  defaultDir: string;
  existing: { version: string; dir: string } | null;
  payloadOk: boolean;
  requiredBytes: number;
}

export type InstallEvent =
  | { kind: "stage"; stage: string }
  | { kind: "progress"; fraction: number }
  | { kind: "finished" }
  | { kind: "failed"; message: string };

export interface Backend {
  info(): Promise<InstallerInfo>;
  pickFolder(current: string): Promise<string | null>;
  startInstall(dir: string, desktopShortcut: boolean, onEvent: (e: InstallEvent) => void): Promise<void>;
  launchApp(): Promise<void>;
  minimize(): Promise<void>;
  close(): Promise<void>;
}

const tauriBackend: Backend = {
  info: () => invoke<InstallerInfo>("installer_info"),
  pickFolder: (current) => invoke<string | null>("pick_folder", { current }),
  startInstall: (dir, desktopShortcut, onEvent) => {
    const channel = new Channel<InstallEvent>();
    channel.onmessage = onEvent;
    return invoke("start_install", { dir, desktopShortcut, onEvent: channel });
  },
  launchApp: () => invoke("launch_app"),
  minimize: () => getCurrentWindow().minimize(),
  close: () => getCurrentWindow().close(),
};

/**
 * Solo para ver el diseño en un navegador (`npm run installer:dev`): no instala nada.
 * Dentro de Tauri nunca se usa. Parámetros: `?existing=1.0.4`, `?fail=1`.
 */
function previewBackend(): Backend {
  const params = new URLSearchParams(location.search);
  const existing = params.get("existing");
  return {
    info: async () => ({
      version: "1.0.5",
      defaultDir: "C:\\Users\\usuario\\AppData\\Local\\Cartucho Music",
      existing: existing ? { version: existing, dir: "C:\\Users\\usuario\\AppData\\Local\\Cartucho Music" } : null,
      payloadOk: params.get("payload") !== "0",
      requiredBytes: 19 * 1024 * 1024,
    }),
    pickFolder: async () => "D:\\Programas\\Cartucho Music",
    startInstall: async (_dir, _desktop, onEvent) => {
      const stop = params.get("stop");
      onEvent({ kind: "stage", stage: "preparing" });
      await new Promise((r) => setTimeout(r, 600));
      onEvent({ kind: "stage", stage: "copying" });
      for (let f = 0; f <= 0.97; f += 0.03) {
        if (stop && f >= Number(stop)) return;
        onEvent({ kind: "progress", fraction: f });
        await new Promise((r) => setTimeout(r, 70));
      }
      if (params.get("fail")) {
        onEvent({ kind: "failed", message: "La instalación se detuvo. Si Cartucho Music está abierto, ciérralo y vuelve a intentarlo." });
        return;
      }
      onEvent({ kind: "stage", stage: "finishing" });
      await new Promise((r) => setTimeout(r, 400));
      onEvent({ kind: "progress", fraction: 1 });
      onEvent({ kind: "finished" });
    },
    launchApp: async () => {},
    minimize: async () => {},
    close: async () => {},
  };
}

export const backend: Backend = "__TAURI_INTERNALS__" in window ? tauriBackend : previewBackend();
