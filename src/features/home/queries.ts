import { useQueries } from "@tanstack/react-query";
import { useProviders, useRegistryVersion } from "@/hooks/useProviders";
import type { MusicProvider, ProviderCapabilities } from "@/providers/types";
import type { ProviderSlice } from "@/features/library/queries";

/**
 * Consulta la misma sección en cada proveedor que la admite.
 * Los proveedores sin la capacidad se devuelven aparte para poder explicarlo en la UI.
 */
function usePerProvider<T>(
  name: string,
  can: (c: ProviderCapabilities) => boolean,
  fetch: (p: MusicProvider, signal: AbortSignal) => Promise<T[]>,
) {
  const v = useRegistryVersion();
  const all = useProviders();
  const supported = all.filter((p) => can(p.capabilities));
  const unsupported = all.filter((p) => !can(p.capabilities));
  const results = useQueries({
    queries: supported.map((p) => ({
      queryKey: [p.id, v, "home", name],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetch(p, signal),
    })),
  });
  const slices: ProviderSlice<T>[] = supported.map((p, i) => ({
    provider: p, items: results[i].data ?? [], isLoading: results[i].isLoading, error: results[i].error,
  }));
  return { slices, unsupported };
}

export const useRecentlyPlayed = () =>
  usePerProvider("recent", (c) => c.personalization.recentlyPlayed, (p, s) => p.personalization.getRecentlyPlayed(12, s));

export const useTopArtists = () =>
  usePerProvider("top-artists", (c) => c.personalization.topArtists, (p, s) => p.personalization.getTopArtists(12, s));

export const useRecommendations = () =>
  usePerProvider("recommendations", (c) => c.personalization.recommendations, (p, s) => p.personalization.getRecommendations(12, s));

