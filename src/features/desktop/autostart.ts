import { isDesktopApp } from "@/utils/platform";

/** Inicio con Windows (plugin oficial de Tauri: entrada en el registro del usuario). */
export async function isAutostartEnabled(): Promise<boolean> {
  if (!isDesktopApp()) return false;
  const { isEnabled } = await import("@tauri-apps/plugin-autostart");
  return isEnabled();
}

export async function setAutostart(enabled: boolean): Promise<boolean> {
  if (!isDesktopApp()) return false;
  const a = await import("@tauri-apps/plugin-autostart");
  if (enabled) await a.enable();
  else await a.disable();
  return a.isEnabled();
}
