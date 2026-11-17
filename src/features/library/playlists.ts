import { useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
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

/** Todas las playlists de tu biblioteca (para la barra lateral). */
export function useLibraryPlaylists(provider: ProviderId, enabled: boolean) {
  const v = useRegistryVersion();
  return useQuery({
    queryKey: [provider, v, "library", "playlists", "all-sidebar"],
    queryFn: async ({ signal }) => {
      const out: Playlist[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 10; i++) {
        const page = await registry.get(provider).library.getPlaylists({ limit: 50, cursor, signal });
        out.push(...page.items);
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      return out;
    },
    enabled: enabled && !!registry.tryGet(provider)?.capabilities.library.playlists,
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

/** Invalida lo que depende del contenido de playlists (detalle, listas e IDs). */
function invalidatePlaylists(qc: QueryClient, provider: ProviderId) {
  return qc.invalidateQueries({
    predicate: (q) => q.queryKey[0] === provider && (q.queryKey[2] === "playlist" || (q.queryKey[2] === "library" && q.queryKey[3] === "playlists")),
  });
}

/**
 * En qué playlists editables está ya la canción. Spotify no tiene un «¿dónde está esta
 * canción?», así que se leen los IDs de cada playlist (solo el campo id) y se guardan en caché.
 */
export function usePlaylistMembership(track: Track | null, playlists: Playlist[] | undefined) {
  const v = useRegistryVersion();
  const results = useQueries({
    queries: (track ? playlists ?? [] : []).map((p) => ({
      queryKey: [p.provider, v, "playlist", p.id, "ids"],
      queryFn: ({ signal }: { signal: AbortSignal }) => registry.get(p.provider).library.getPlaylistTrackIds(p.id, signal),
      staleTime: 5 * 60_000,
    })),
  });
  const loading = results.some((r) => r.isLoading);
  const contains: Record<string, boolean | undefined> = {};
  (playlists ?? []).forEach((p, i) => { contains[p.id] = track && results[i]?.data ? results[i].data!.includes(track.id) : undefined; });
  return { contains, loading };
}

export interface SaveChanges {
  track: Track;
  /** null = sin cambios en favoritos. */
  favorite: boolean | null;
  add: Playlist[];
  remove: Playlist[];
  /** Crear una playlist nueva con la canción. */
  newName?: string;
}

/** Aplica de una vez los cambios del diálogo «Guardar en». */
export function useSaveTo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ track, favorite, add, remove, newName }: SaveChanges) => {
      const lib = registry.get(track.provider).library;
      const failed: string[] = [];
      const run = async (label: string, fn: () => Promise<unknown>) => {
        try { await fn(); } catch (e) { console.warn("[guardar en]", label, e); failed.push(label); if (failed.length === 1) usePlayer.getState().showToast(toastFor(e)); }
      };
      if (favorite === true) await run("Tus favoritos", () => lib.saveTracks([track.id]));
      if (favorite === false) await run("Tus favoritos", () => lib.removeTracks([track.id]));
      for (const p of add) await run(p.name, () => lib.addToPlaylist(p.id, [track.id]));
      for (const p of remove) await run(p.name, () => lib.removeFromPlaylist(p.id, [track.id]));
      if (newName?.trim()) {
        await run(newName.trim(), async () => {
          const created = await lib.createPlaylist(newName.trim());
          await lib.addToPlaylist(created.id, [track.id]);
        });
      }
      return failed;
    },
    onSettled: (failed, _e, { track, favorite, add, remove, newName }) => {
      const provider = track.provider;
      void invalidatePlaylists(qc, provider);
      if (favorite !== null) void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === provider && (q.queryKey[2] === "saved-contains" || (q.queryKey[2] === "library" && q.queryKey[3] === "tracks")) });
      const changes = (favorite !== null ? 1 : 0) + add.length + remove.length + (newName?.trim() ? 1 : 0);
      if (failed && failed.length === 0 && changes > 0) {
        usePlayer.getState().showToast({ kind: "info", message: changes === 1 ? "Cambios guardados" : `${changes} cambios guardados` });
      } else if (failed && failed.length > 0 && failed.length < changes) {
        usePlayer.getState().showToast({ kind: "error", message: `No se pudo guardar en: ${failed.join(", ")}` });
      }
    },
  });
}
