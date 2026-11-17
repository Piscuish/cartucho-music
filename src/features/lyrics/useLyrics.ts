import { useQuery } from "@tanstack/react-query";
import { cache } from "@/database/stores";
import { useLyricsPrefs } from "@/stores/lyrics";
import type { Track } from "@/types/music";
import { fetchLyrics, type Lyrics } from "./lrclib";

const TTL = 7 * 24 * 60 * 60_000;

/** Letra de la canción (caché en memoria y en disco una semana, para no repetir peticiones). */
export function useLyrics(track: Track | null) {
  const enabled = useLyricsPrefs((s) => s.enabled);
  return useQuery({
    queryKey: ["lyrics", track?.provider, track?.id],
    queryFn: async ({ signal }): Promise<Lyrics> => {
      const key = `lyrics:${track!.provider}:${track!.id}`;
      const stored = await cache.get<Lyrics>(key).catch(() => null);
      if (stored) return stored;
      const lyrics = await fetchLyrics(track!, signal);
      await cache.put(key, lyrics, TTL).catch(() => {});
      return lyrics;
    },
    enabled: enabled && !!track,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: 1,
  });
}
