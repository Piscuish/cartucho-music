/**
 * Letras desde LRCLIB (https://lrclib.net), una base de datos abierta y gratuita mantenida por
 * la comunidad. Spotify y Apple Music no ofrecen letras a apps de terceros.
 *
 * Aviso: las letras tienen derechos de autor y LRCLIB no tiene licencia de las discográficas.
 * Por eso las letras se pueden desactivar en Ajustes → Reproducción.
 */
import { z } from "zod";
import type { Track } from "@/types/music";
import { parseLrc, type LyricLine } from "./lrc";
import { invokeNative, isTauri } from "@/database/runtime";

export const LRCLIB_API = "https://lrclib.net/api";

const record = z.object({
  id: z.number(),
  trackName: z.string().nullish(),
  artistName: z.string().nullish(),
  duration: z.number().nullish(),
  instrumental: z.boolean().nullish(),
  plainLyrics: z.string().nullish(),
  syncedLyrics: z.string().nullish(),
});
type LrclibRecord = z.infer<typeof record>;

export type Lyrics =
  | { kind: "synced"; lines: LyricLine[]; source: "LRCLIB" }
  | { kind: "plain"; text: string; source: "LRCLIB" }
  | { kind: "instrumental"; source: "LRCLIB" }
  | { kind: "none" };

function toLyrics(r: LrclibRecord): Lyrics {
  if (r.syncedLyrics?.trim()) {
    const lines = parseLrc(r.syncedLyrics);
    if (lines.length) return { kind: "synced", lines, source: "LRCLIB" };
  }
  if (r.plainLyrics?.trim()) return { kind: "plain", text: r.plainLyrics.trim(), source: "LRCLIB" };
  if (r.instrumental) return { kind: "instrumental", source: "LRCLIB" };
  return { kind: "none" };
}

/** Quita lo que suele diferir entre servicios: «- Remastered 2011», «(feat. X)»… */
export function cleanTitle(name: string): string {
  return name
    .replace(/\s+-\s+.*(remaster|version|versión|edit|mix|live|en vivo|mono|stereo).*$/i, "")
    .replace(/\s*[([](feat\.?|ft\.?|with|con)\s[^)\]]*[)\]]/gi, "")
    .trim();
}

/**
 * En la app la petición la hace Rust (sin CORS y con User-Agent propio); en el navegador de
 * desarrollo, `fetch`. Devuelve una `Response` en ambos casos.
 */
const defaultFetch: typeof fetch = async (input, init) => {
  if (!isTauri()) return fetch(input, init);
  const url = new URL(String(input));
  const endpoint = url.pathname.replace(/^\/api\//, "");
  const r = await invokeNative<{ status: number; body: string }>("lrclib_request", { endpoint, params: [...url.searchParams.entries()] });
  if (init?.signal?.aborted) throw new DOMException("Cancelado", "AbortError");
  return new Response(r.body, { status: r.status });
};

/** Busca la letra de una canción: primero coincidencia exacta y, si no, por búsqueda. */
export async function fetchLyrics(track: Track, signal?: AbortSignal, fetchImpl: typeof fetch = defaultFetch): Promise<Lyrics> {
  const artist = track.artistNames[0] ?? "";
  const title = cleanTitle(track.name);
  const seconds = Math.round(track.durationMs / 1000);

  const get = new URL(`${LRCLIB_API}/get`);
  get.search = new URLSearchParams({ track_name: title, artist_name: artist, album_name: track.albumName, duration: String(seconds) }).toString();
  const res = await fetchImpl(get, { signal });
  if (res.ok) return toLyrics(record.parse(await res.json()));
  if (res.status !== 404) throw new Error(`LRCLIB respondió ${res.status}`);

  const search = new URL(`${LRCLIB_API}/search`);
  search.search = new URLSearchParams({ track_name: title, artist_name: artist }).toString();
  const sres = await fetchImpl(search, { signal });
  if (!sres.ok) throw new Error(`LRCLIB respondió ${sres.status}`);
  const results = z.array(record).parse(await sres.json());
  // Misma duración (±3 s); entre ellas, mejor con letra sincronizada.
  const close = results.filter((r) => r.duration == null || Math.abs(r.duration - seconds) <= 3);
  const best = close.find((r) => r.syncedLyrics) ?? close.find((r) => r.plainLyrics || r.instrumental);
  return best ? toLyrics(best) : { kind: "none" };
}
