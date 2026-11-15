/**
 * Capa de persistencia del frontend.
 *
 * - En la app de escritorio usa los comandos de SQLite de Rust (`src-tauri/src/db.rs`).
 * - En el navegador (desarrollo con `npm run dev`) usa localStorage como respaldo.
 *
 * Ninguna de las dos guarda tokens: para eso está `services/secure-store.ts`.
 */
import { invokeNative, isTauri } from "./runtime";

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T, ttlMs: number): Promise<void>;
  clear(prefix?: string): Promise<void>;
}

export interface HistoryEntry<T = unknown> { provider: string; trackId: string; track: T; playedAt: number }
export interface HistoryStore {
  add(provider: string, trackId: string, track: unknown): Promise<void>;
  list<T>(limit: number): Promise<HistoryEntry<T>[]>;
  clear(): Promise<void>;
}

/* ───────────── Implementación nativa (SQLite vía Tauri) ───────────── */

const nativeKv: KeyValueStore = {
  get: (key) => invokeNative<string | null>("kv_get", { key }),
  set: (key, value) => invokeNative("kv_set", { key, value }),
  delete: (key) => invokeNative("kv_delete", { key }),
};

const nativeCache: CacheStore = {
  async get<T>(key: string) {
    const raw = await invokeNative<string | null>("cache_get", { key });
    return raw == null ? null : (JSON.parse(raw) as T);
  },
  put: (key, value, ttlMs) => invokeNative("cache_put", { key, value: JSON.stringify(value), ttlMs: Math.round(ttlMs) }),
  clear: async (prefix) => { await invokeNative("cache_clear", { prefix: prefix ?? null }); },
};

const nativeHistory: HistoryStore = {
  add: (provider, trackId, track) => invokeNative("history_add", { provider, trackId, trackJson: JSON.stringify(track) }),
  async list<T>(limit: number) {
    const rows = await invokeNative<{ provider: string; trackId: string; trackJson: string; playedAt: number }[]>("history_list", { limit });
    return rows.map((r) => ({ provider: r.provider, trackId: r.trackId, track: JSON.parse(r.trackJson) as T, playedAt: r.playedAt }));
  },
  clear: () => invokeNative("history_clear"),
};

/* ───────────── Respaldo para navegador (solo desarrollo) ───────────── */

function safeLocalStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function createBrowserKv(prefix = "cartucho.kv."): KeyValueStore {
  const memory = new Map<string, string>();
  const ls = safeLocalStorage();
  return {
    get: async (k) => (ls ? ls.getItem(prefix + k) : memory.get(k) ?? null),
    set: async (k, v) => { if (ls) ls.setItem(prefix + k, v); else memory.set(k, v); },
    delete: async (k) => { if (ls) ls.removeItem(prefix + k); else memory.delete(k); },
  };
}

export function createMemoryCache(now: () => number = Date.now): CacheStore {
  const map = new Map<string, { value: unknown; expiresAt: number }>();
  return {
    async get<T>(key: string) {
      const e = map.get(key);
      if (!e) return null;
      if (e.expiresAt <= now()) { map.delete(key); return null; }
      return e.value as T;
    },
    async put(key, value, ttlMs) { map.set(key, { value, expiresAt: now() + ttlMs }); },
    async clear(prefix) {
      if (!prefix) return map.clear();
      for (const k of [...map.keys()]) if (k.startsWith(prefix)) map.delete(k);
    },
  };
}

export function createMemoryHistory(cap = 500): HistoryStore {
  let rows: HistoryEntry[] = [];
  return {
    async add(provider, trackId, track) { rows = [{ provider, trackId, track, playedAt: Date.now() }, ...rows].slice(0, cap); },
    async list<T>(limit: number) { return rows.slice(0, limit) as HistoryEntry<T>[]; },
    async clear() { rows = []; },
  };
}

/* ───────────── Selección según entorno ───────────── */

const native = isTauri();
export const kv: KeyValueStore = native ? nativeKv : createBrowserKv();
export const cache: CacheStore = native ? nativeCache : createMemoryCache();
export const history: HistoryStore = native ? nativeHistory : createMemoryHistory();
export const storageBackend = native ? "sqlite" : "browser";
