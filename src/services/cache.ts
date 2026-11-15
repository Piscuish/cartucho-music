import { cache as defaultStore, type CacheStore } from "@/database/stores";

/**
 * Caché persistente con deduplicación: la primera llamada consulta la red y las
 * siguientes (incluso tras reiniciar la app) se sirven desde SQLite hasta que caduque.
 * Un fallo de la caché nunca rompe la petición: se degrada a ir a la red.
 */
export function createCachedFetcher(store: CacheStore = defaultStore) {
  const inflight = new Map<string, Promise<unknown>>();
  return async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    try {
      const hit = await store.get<T>(key);
      if (hit != null) return hit;
    } catch (e) {
      console.warn("[cache] lectura fallida", key, e);
    }
    const running = inflight.get(key);
    if (running) return running as Promise<T>;
    const p = fetcher()
      .then(async (value) => {
        try { await store.put(key, value, ttlMs); } catch (e) { console.warn("[cache] escritura fallida", key, e); }
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
}

export const TTL = {
  album: 24 * 60 * 60_000,
  artist: 24 * 60 * 60_000,
  artistAlbums: 6 * 60 * 60_000,
  playlist: 10 * 60_000,
  search: 30 * 60_000,
};
