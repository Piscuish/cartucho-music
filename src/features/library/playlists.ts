import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { registry } from "@/providers/registry";
import { useRegistryVersion } from "@/hooks/useProviders";
import { toastFor, usePlayer } from "@/stores/player";
import type { Playlist, ProviderId, Track } from "@/types/music";

/** Playlists en las que el usuario puede añadir canciones (propias o colaborativas). */
export function useEditablePlaylists(provider: ProviderId, enabled: boolean) {
  const v = useRegistryVersion();
  return useQuery({
    queryKey: [provider, v, "library", "playlists", "editable"],
    queryFn: async ({ signal }) => {
      const out: Playlist[] = [];
      let cursor: string | null = null;
      // Como mucho 10 páginas de 50: más que suficiente para elegir destino.
      for (let i = 0; i < 10; i++) {
        const page = await registry.get(provider).library.getPlaylists({ limit: 50, cursor, signal });
        out.push(...page.items.filter((p) => p.canEdit));
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      return out;
    },
    enabled: enabled && !!registry.tryGet(provider)?.capabilities.library.playlistWrite,
    staleTime: 5 * 60_000,
  });
}

/** Añade canciones a una playlist (y opcionalmente la crea antes). */
export function useAddToPlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tracks, playlist, newName }: { tracks: Track[]; playlist?: Playlist; newName?: string }) => {
      const provider = tracks[0].provider;
      const lib = registry.get(provider).library;
      const target = playlist ?? (await lib.createPlaylist(newName!.trim()));
      await lib.addToPlaylist(target.id, tracks.map((t) => t.id));
      return target;
    },
    onSuccess: (target, { tracks }) => {
      const provider = tracks[0].provider;
      usePlayer.getState().showToast({
        kind: "info",
        message: tracks.length === 1 ? `«${tracks[0].name}» añadida a «${target.name}»` : `${tracks.length} canciones añadidas a «${target.name}»`,
      });
      void qc.invalidateQueries({
        predicate: (q) => q.queryKey[0] === provider && (q.queryKey[2] === "playlist" || (q.queryKey[2] === "library" && q.queryKey[3] === "playlists")),
      });
    },
    onError: (e) => usePlayer.getState().showToast(toastFor(e)),
  });
}
