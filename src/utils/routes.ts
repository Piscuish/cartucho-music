import type { ProviderId } from "@/types/music";

/** Rutas de detalle: siempre incluyen el proveedor (los IDs pueden coincidir entre servicios). */
export const routes = {
  album: (p: ProviderId, id: string) => `/album/${p}/${encodeURIComponent(id)}`,
  playlist: (p: ProviderId, id: string) => `/playlist/${p}/${encodeURIComponent(id)}`,
  artist: (p: ProviderId, id: string) => `/artista/${p}/${encodeURIComponent(id)}`,
};
