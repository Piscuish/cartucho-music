/** Letras sincronizadas en formato LRC: `[mm:ss.xx] verso`. */

export interface LyricLine { timeMs: number; text: string }

const TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/** Convierte un texto LRC en versos ordenados por tiempo. Ignora metadatos ([ar:], [ti:]…). */
export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const times: number[] = [];
    let last = 0;
    TAG.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TAG.exec(raw)) && m.index === last) {
      const frac = m[3] ?? "0";
      const ms = frac.length === 3 ? Number(frac) : frac.length === 2 ? Number(frac) * 10 : Number(frac) * 100;
      times.push(Number(m[1]) * 60_000 + Number(m[2]) * 1000 + ms);
      last = TAG.lastIndex;
    }
    if (!times.length) continue;
    const text = raw.slice(last).trim();
    for (const t of times) out.push({ timeMs: t, text });
  }
  return out.sort((a, b) => a.timeMs - b.timeMs);
}

/** Índice del verso que suena en `positionMs` (-1 antes del primero). Búsqueda binaria. */
export function activeLineIndex(lines: LyricLine[], positionMs: number): number {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= positionMs) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
