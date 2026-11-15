import type { Track } from "@/types/music";
import type { DesktopPrefs } from "@/stores/desktop";

/** Clave estable de una pista (los IDs pueden coincidir entre servicios). */
export const trackKey = (t: Track | null | undefined) => (t ? `${t.provider}:${t.id}` : null);

/**
 * ¿Hay que notificar el cambio de canción?
 * Solo cuando empieza a sonar una pista distinta, no en la primera lectura
 * (al abrir la app) ni al pausar o reanudar.
 */
export function shouldNotify(o: {
  previousKey: string | null | undefined;
  track: Track | null | undefined;
  isPlaying: boolean;
  windowVisible: boolean;
  prefs: Pick<DesktopPrefs, "notifyTrackChange" | "notifyOnlyWhenHidden">;
}): boolean {
  const key = trackKey(o.track);
  if (!o.prefs.notifyTrackChange || !key || !o.isPlaying) return false;
  if (o.previousKey === undefined) return false; // primera lectura tras abrir
  if (key === o.previousKey) return false;
  if (o.prefs.notifyOnlyWhenHidden && o.windowVisible) return false;
  return true;
}

/** Texto del tooltip de la bandeja (Windows lo limita a ~127 caracteres). */
export function trayTooltip(t: Track | null | undefined, isPlaying: boolean): string {
  if (!t) return "Cartucho Music";
  const text = `${isPlaying ? "▶" : "⏸"} ${t.name} — ${t.artistNames.join(", ")}`;
  return text.length > 120 ? text.slice(0, 119) + "…" : text;
}

export const MEDIA_KEYS = {
  MediaPlayPause: "toggle",
  MediaTrackNext: "next",
  MediaTrackPrevious: "previous",
} as const;
export type PlayerAction = (typeof MEDIA_KEYS)[keyof typeof MEDIA_KEYS];
