/**
 * Plataforma en la que corre la app.
 *
 * `TAURI_ENV_PLATFORM` lo define la CLI de Tauri al compilar (`windows`, `android`…), así que
 * en el APK es una constante. En el navegador (desarrollo) se puede simular el teléfono con
 * `?movil=1` en la URL.
 */
import { isTauri } from "@/database/runtime";

const platform = (import.meta.env.TAURI_ENV_PLATFORM as string | undefined) ?? "";

function previewMobile(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).has("movil");
  } catch {
    return false;
  }
}

/** App de Android (o iOS) compilada con Tauri. */
export const IS_MOBILE_APP = platform === "android" || platform === "ios";

/** Interfaz de teléfono: la app móvil o la vista previa `?movil=1` en el navegador. */
export const IS_MOBILE = IS_MOBILE_APP || previewMobile();

/** App de escritorio: hay bandeja, atajos globales, ventana propia y actualizador firmado. */
export function isDesktopApp(): boolean {
  return isTauri() && !IS_MOBILE_APP;
}

// Los estilos del teléfono cuelgan de este atributo (ver index.css).
if (IS_MOBILE && typeof document !== "undefined") document.documentElement.dataset.platform = "mobile";
