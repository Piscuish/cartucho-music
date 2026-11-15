import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { Page, PlaylistDetail } from "@/providers/types";
import type { Album, Track } from "@/types/music";
import { registry } from "@/providers/registry";
import { useRegistryVersion } from "@/hooks/useProviders";
import type { ProviderId } from "@/types/music";

/** Claves de caché: siempre empiezan por el proveedor para no cruzar datos. */
export const catalogKeys = {
  album: (v: number, p: ProviderId, id: string) => [p, v, "album", id] as const,
  playlist: (v: number, p: ProviderId, id: string) => [p, v, "playlist", id] as const,
  artist: (v: number, p: ProviderId, id: string) => [p, v, "artist", id] as const,
  artistAlbums: (v: number, p: ProviderId, id: string) => [p, v, "artist", id, "albums"] as const,
  artistTop: (v: number, p: ProviderId, id: string) => [p, v, "artist", id, "top"] as const,
};

export function useAlbum(provider: ProviderId, id: string) {
  const v = useRegistryVersion();
  return useQuery({
    queryKey: catalogKeys.album(v, provider, id),
    queryFn: ({ signal }) => registry.get(provider).catalog.getAlbum(id, signal),
  });
}

export function usePlaylist(provider: ProviderId, id: string) {
  const v = useRegistryVersion();
  return useQuery({
    queryKey: catalogKeys.playlist(v, provider, id),
    queryFn: ({ signal }) => registry.get(provider).catalog.getPlaylist(id, signal),
  });
}

export function useArtist(provider: ProviderId, id: string) {
  const v = useRegistryVersion();
  return useQuery({
    queryKey: catalogKeys.artist(v, provider, id),
    queryFn: ({ signal }) => registry.get(provider).catalog.getArtist(id, signal),
  });
}

export function useArtistAlbums(provider: ProviderId, id: string) {
  const v = useRegistryVersion();
  return useInfiniteQuery({
    queryKey: catalogKeys.artistAlbums(v, provider, id),
    queryFn: ({ pageParam, signal }): Promise<Page<Album>> => registry.get(provider).catalog.getArtistAlbums(id, { limit: 20, cursor: pageParam, signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/**
 * Canciones de una playlist por páginas. La primera página viene con el detalle
 * (sin petición extra); el resto se pide al hacer scroll.
 */
export function usePlaylistTracks(provider: ProviderId, detail: PlaylistDetail | undefined) {
  const v = useRegistryVersion();
  const first: Page<Track> | undefined = detail && {
    items: detail.tracks,
    total: detail.trackCount,
    nextCursor: !detail.tracksRestricted && detail.trackCount > detail.tracks.length ? String(detail.tracks.length) : null,
  };
  return useInfiniteQuery({
    queryKey: [provider, v, "playlist", detail?.id, "tracks"],
    queryFn: ({ pageParam, signal }) => registry.get(provider).catalog.getPlaylistTracks(detail!.id, { limit: 50, cursor: pageParam, signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: first ? { pages: [first], pageParams: [null] } : undefined,
    enabled: !!detail,
    staleTime: 10 * 60_000,
  });
}

/** Solo se consulta si el proveedor lo permite. */
export function useArtistTopTracks(provider: ProviderId, id: string) {
  const v = useRegistryVersion();
  const enabled = registry.tryGet(provider)?.capabilities.catalog.artistTopTracks ?? false;
  return useQuery({
    queryKey: catalogKeys.artistTop(v, provider, id),
    queryFn: ({ signal }) => registry.get(provider).catalog.getArtistTopTracks(id, signal),
    enabled,
  });
}
