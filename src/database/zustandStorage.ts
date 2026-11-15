import type { StateStorage } from "zustand/middleware";
import { kv, type KeyValueStore } from "./stores";

/**
 * Adaptador para que `zustand/persist` guarde en SQLite (o en el respaldo del navegador).
 * Los fallos de escritura se registran pero no rompen la UI.
 */
export function createKvStateStorage(store: KeyValueStore = kv): StateStorage {
  return {
    getItem: async (name) => {
      try { return await store.get(`state:${name}`); } catch (e) { console.warn("[storage] lectura fallida", name, e); return null; }
    },
    setItem: async (name, value) => {
      try { await store.set(`state:${name}`, value); } catch (e) { console.warn("[storage] escritura fallida", name, e); }
    },
    removeItem: async (name) => {
      try { await store.delete(`state:${name}`); } catch (e) { console.warn("[storage] borrado fallido", name, e); }
    },
  };
}
