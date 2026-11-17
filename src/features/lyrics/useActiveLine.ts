import { useEffect, useState } from "react";
import { usePlayer } from "@/stores/player";
import { activeLineIndex, type LyricLine } from "./lrc";

/** Adelanto: el verso aparece un instante antes, como en Spotify. */
export const LEAD_MS = 250;

/** Posición estimada ahora mismo (sin provocar renders). */
export function currentPositionMs(): number {
  const s = usePlayer.getState().state;
  if (!s?.track) return 0;
  const pos = s.isPlaying ? s.positionMs + (Date.now() - s.timestamp) : s.positionMs;
  return Math.max(0, Math.min(pos, s.track.durationMs));
}

/**
 * Verso activo. Solo vuelve a renderizar cuando cambia de verso (no 4 veces por segundo),
 * para que la letra no cargue los equipos modestos.
 */
export function useActiveLine(lines: LyricLine[] | null): number {
  const playback = usePlayer((s) => s.state);
  const [active, setActive] = useState(() => (lines ? activeLineIndex(lines, currentPositionMs() + LEAD_MS) : -1));
  useEffect(() => {
    if (!lines) { setActive(-1); return; }
    const tick = () => setActive(activeLineIndex(lines, currentPositionMs() + LEAD_MS));
    tick();
    if (!playback?.isPlaying) return;
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [lines, playback]);
  return active;
}

/** Duración visual del relleno de un verso: hasta el siguiente, sin pasarse en los huecos largos. */
export function lineDurationMs(lines: LyricLine[], i: number): number {
  const next = lines[i + 1]?.timeMs ?? lines[i].timeMs + 5000;
  const gap = Math.max(300, next - lines[i].timeMs);
  const byLength = Math.max(1500, lines[i].text.length * 95);
  return Math.min(gap, byLength);
}
