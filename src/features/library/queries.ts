import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useEffect } from "react";
import { providerIds, registry } from "@/providers/registry";
import { useProviders, useRegistryVersion } from "@/hooks/useProviders";
import type { MusicProvider, Page, PageRequest } from "@/providers/types";
import type { Album, Artist, Playlist, ProviderId, Track } from "@/types/music";

export type LibraryKind = "tracks" | "albums" | "artists" | "playlists";

type ItemOf<K extends LibraryKind> = K extends "tracks" ? Track : K extends "albums" ? Album : K extends "artists" ? Artist : Playlist;

const fetchers: { [K in LibraryKind]: (p: MusicProvider, signal: AbortSignal) => Promise<Page<ItemOf<K>>> } = {
  tracks: (p, signal) => p.library.getSavedTracks({ limit: 50, signal }),
  albums: (p, signal) => p.library.getSavedAlbums({ limit: 50, signal }),
  artists: (p, signal) => p.library.getFollowedArtists({ limit: 50, signal }),
  playlists: (p, signal) => p.library.getPlaylists({ limit: 50, signal }),
};

const supports: Record<LibraryKind, (p: MusicProvider) => boolean> = {
  tracks: (p) => p.capabilities.library.savedTracks,
  albums: (p) => p.capabilities.library.albums,
  artists: (p) => p.capabilities.library.artists,
  playlists: (p) => p.capabilities.library.playlists,
};

export interface ProviderSlice<T> {
  provider: MusicProvider;
  items: T[];
  isLoading: boolean;
  error: unknown;
}

/**
 * Biblioteca de cada proveedor POR SEPARADO. Se devuelven trozos por proveedor
 * para que la UI pueda mostrarlos juntos sin convertirlos en una sola colección reproducible.
 */
export function useLibraryItems<K extends LibraryKind>(kind: K): ProviderSlice<ItemOf<K>>[] {
  const v = useRegistryVersion();
  const list = useProviders().filter(supports[kind]);
  const results = useQueries({
    queries: list.map((p) => ({
      queryKey: [p.id, v, "library", kind],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchers[kind](p, signal) as Promise<Page<ItemOf<K>>>,
    })),
  });
  return list.map((p, i) => ({
    provider: p,
    items: results[i].data?.items ?? [],
    isLoading: results[i].isLoading,
    error: results[i].error,
  }));
}

/* ───────────── Biblioteca completa (scroll infinito) ───────────── */

const pageFetchers: { [K in LibraryKind]: (p: MusicProvider, req: PageRequest) => Promise<Page<ItemOf<K>>> } = {
  tracks: (p, req) => p.library.getSavedTracks(req),
  albums: (p, req) => p.library.getSavedAlbums(req),
  artists: (p, req) => p.library.getFollowedArtists(req),
  playlists: (p, req) => p.library.getPlaylists(req),
};

export interface InfiniteSlice<T> extends ProviderSlice<T> {
  /** Total que declara el servicio (si lo da). */
  total: number | null;
  hasMore: boolean;
  fetchingMore: boolean;
  fetchMore: () => void;
}

/**
 * Biblioteca paginada de cada proveedor, por separado.
 * Una consulta infinita por proveedor; la lista de proveedores es fija, así que
 * el número de hooks no cambia entre renders.
 */
export function useLibraryInfinite<K extends LibraryKind>(kind: K): InfiniteSlice<ItemOf<K>>[] {
  const v = useRegistryVersion();
  const out: InfiniteSlice<ItemOf<K>>[] = [];
  for (const id of providerIds) {
    const p = registry.tryGet(id);
    const enabled = !!p && supports[kind](p);
    // eslint-disable-next-line react-hooks/rules-of-hooks -- `providerIds` es constante
    const q = useInfiniteQuery({
      queryKey: [id, v, "library", kind, "infinite"],
      queryFn: ({ pageParam, signal }) => pageFetchers[kind](registry.get(id), { limit: 50, cursor: pageParam, signal }) as Promise<Page<ItemOf<K>>>,
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor,
      enabled,
      staleTime: 5 * 60_000,
    });
    if (!enabled || !p) continue;
    out.push({
      provider: p,
      items: q.data?.pages.flatMap((pg) => pg.items) ?? [],
      total: q.data?.pages[0]?.total ?? null,
      isLoading: q.isLoading,
      error: q.error,
      hasMore: !!q.hasNextPage,
      fetchingMore: q.isFetchingNextPage,
      fetchMore: () => { if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage(); },
    });
  }
  return out;
}

/**
 * Mientras `active` sea true, sigue pidiendo páginas hasta completar la biblioteca
 * (p. ej. para que un filtro local busque en todo). Las páginas van de una en una,
 * así que el cliente HTTP puede respetar los límites de solicitudes.
 */
export function useLoadAll<T>(slices: InfiniteSlice<T>[], active: boolean) {
  const signature = slices.map((s) => `${s.provider.id}:${s.items.length}:${s.hasMore}:${s.fetchingMore}`).join("|");
  useEffect(() => {
    if (!active) return;
    for (const s of slices) if (s.hasMore && !s.fetchingMore && !s.error) s.fetchMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, signature]);
  const loaded = slices.reduce((a, s) => a + s.items.length, 0);
  const total = slices.reduce((a, s) => a + (s.total ?? s.items.length), 0);
  return { loaded, total, complete: slices.every((s) => !s.hasMore) };
}

/* ───────────── Canciones guardadas (favoritos) ───────────── */

const savedKey = (v: number, p: ProviderId) => [p, v, "saved-contains"] as const;

/** Estado "guardada" de una lista de canciones de UN proveedor. */
export function useSavedState(provider: ProviderId, ids: string[]) {
  const v = useRegistryVersion();
  const sorted = [...ids].sort();
  return useQuery({
    queryKey: [...savedKey(v, provider), sorted.join(",")],
    queryFn: async ({ signal }) => {
      const flags = await registry.get(provider).library.containsTracks(sorted, signal);
      return new Set(sorted.filter((_, i) => flags[i]));
    },
    enabled: ids.length > 0 && (registry.tryGet(provider)?.capabilities.library.savedTracks ?? false),
    staleTime: 30_000,
  });
}

/** Igual que `useSavedState`, pero para una lista con canciones de varios proveedores. */
export function useSavedSets(tracks: Track[]): Partial<Record<ProviderId, Set<string>>> {
  const v = useRegistryVersion();
  const groups = useProviders()
    .filter((p) => p.capabilities.library.savedTracks)
    .map((p) => ({ p, ids: tracks.filter((t) => t.provider === p.id).map((t) => t.id).sort() }))
    .filter((g) => g.ids.length > 0);
  const results = useQueries({
    queries: groups.map(({ p, ids }) => ({
      queryKey: [...savedKey(v, p.id), ids.join(",")],
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const flags = await p.library.containsTracks(ids, signal);
        return new Set(ids.filter((_, i) => flags[i]));
      },
      staleTime: 30_000,
    })),
  });
  return Object.fromEntries(groups.map((g, i) => [g.p.id, results[i].data]));
}

export function useToggleSaved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ track, saved }: { track: Track; saved: boolean }) => {
      const lib = registry.get(track.provider).library;
      if (saved) await lib.removeTracks([track.id]);
      else await lib.saveTracks([track.id]);
    },
    onSuccess: (_d, { track, saved }) => {
      const isTracks = (k: readonly unknown[]) => k[0] === track.provider && k[2] === "library" && k[3] === "tracks";
      // Lista infinita: se edita en caché en lugar de volver a pedir todas las páginas cargadas.
      qc.setQueriesData<InfiniteData<Page<Track>>>(
        { predicate: (q) => isTracks(q.queryKey) && q.queryKey[4] === "infinite" },
        (data) => {
          if (!data) return data;
          const pages = data.pages.map((pg, i) => {
            const items = pg.items.filter((t) => t.id !== track.id);
            return {
              ...pg,
              items: !saved && i === 0 ? [track, ...items] : items,
              total: pg.total != null ? pg.total + (saved ? -1 : 1) : pg.total,
            };
          });
          return { ...data, pages };
        },
      );
      // Consultas pequeñas (primera página, estado "guardada"): basta con invalidarlas.
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === track.provider && (q.queryKey[2] === "saved-contains" || (isTracks(q.queryKey) && q.queryKey[4] !== "infinite")) });
    },
  });
}
