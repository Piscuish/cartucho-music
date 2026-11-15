import { useInfiniteQuery, useQueries } from "@tanstack/react-query";
import { useProviders, useRegistryVersion } from "@/hooks/useProviders";
import { providerIds, registry } from "@/providers/registry";
import type { MusicProvider, SearchResults, SearchType } from "@/providers/types";
import type { Album, Artist, Playlist, Track } from "@/types/music";

export interface ProviderSearch {
  provider: MusicProvider;
  data: SearchResults | undefined;
  isLoading: boolean;
  error: unknown;
}

const KEY: Record<SearchType, keyof Pick<SearchResults, "tracks" | "albums" | "artists" | "playlists">> = {
  track: "tracks", album: "albums", artist: "artists", playlist: "playlists",
};

export interface ProviderSearchPage {
  provider: MusicProvider;
  items: (Track | Album | Artist | Playlist)[];
  isLoading: boolean;
  error: unknown;
  hasMore: boolean;
  fetchingMore: boolean;
  fetchMore: () => void;
}

/**
 * Resultados de UN tipo, paginados por proveedor ("cargar más").
 * Páginas de 10: el máximo que permite Spotify en Development Mode.
 */
export function useSearchPaged(query: string, type: SearchType | null, only: string = "all"): ProviderSearchPage[] {
  const v = useRegistryVersion();
  const q = query.trim();
  const out: ProviderSearchPage[] = [];
  for (const id of providerIds) {
    const p = registry.tryGet(id);
    const enabled = !!type && q.length > 0 && !!p?.capabilities.catalog.search && (only === "all" || only === id);
    // eslint-disable-next-line react-hooks/rules-of-hooks -- `providerIds` es constante
    const r = useInfiniteQuery({
      queryKey: [id, v, "search-paged", type, q.toLowerCase()],
      queryFn: ({ pageParam, signal }) => registry.get(id).catalog.search(q, { types: [type!], limit: 10, offset: pageParam, signal }),
      initialPageParam: 0,
      getNextPageParam: (last, pages) => (last.hasMore?.[type!] ? pages.length * 10 : undefined),
      enabled,
      staleTime: 5 * 60_000,
    });
    if (!enabled || !p) continue;
    out.push({
      provider: p,
      items: r.data?.pages.flatMap((pg) => pg[KEY[type!]] as (Track | Album | Artist | Playlist)[]) ?? [],
      isLoading: r.isLoading,
      error: r.error,
      hasMore: !!r.hasNextPage,
      fetchingMore: r.isFetchingNextPage,
      fetchMore: () => { if (r.hasNextPage && !r.isFetchingNextPage) void r.fetchNextPage(); },
    });
  }
  return out;
}

/** Una búsqueda independiente por proveedor. Los resultados no se fusionan. */
export function useSearch(query: string, only: string = "all"): ProviderSearch[] {
  const v = useRegistryVersion();
  const q = query.trim();
  const list = useProviders().filter((p) => p.capabilities.catalog.search && (only === "all" || only === p.id));
  const results = useQueries({
    queries: list.map((p) => ({
      queryKey: [p.id, v, "search", q.toLowerCase()],
      queryFn: ({ signal }: { signal: AbortSignal }) => p.catalog.search(q, { limit: 20, signal }),
      enabled: q.length > 0,
      staleTime: 5 * 60_000,
    })),
  });
  return list.map((p, i) => ({ provider: p, data: results[i].data, isLoading: results[i].isFetching, error: results[i].error }));
}
