import { isTauri } from "@/database/runtime";
import type { ProviderId } from "@/types/music";

/** Abre un enlace en el navegador del sistema (o en una pestaña nueva en desarrollo). */
export async function openExternal(url: string) {
  if (!/^https:\/\//.test(url)) throw new Error("Solo se abren enlaces https");
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** Enlace al contenido en la app o web oficial del servicio (atribución obligatoria). */
export function serviceUrl(provider: ProviderId, kind: "album" | "playlist" | "artist" | "track", id: string): string | null {
  if (provider === "spotify") return `https://open.spotify.com/${kind}/${encodeURIComponent(id)}`;
  return null; // Apple Music: Fase 5
}
