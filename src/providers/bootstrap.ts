import { history, kv } from "@/database/stores";
import { isHidden, useServicesPrefs } from "@/stores/services";
import type { ProviderId } from "@/types/music";
import { providerIds, registry } from "./registry";
import { PreviewProvider } from "./preview/PreviewProvider";
import { restoreSpotify } from "./spotify/connector";

/**
 * Registra los proveedores al arrancar.
 *
 * 1. Los servicios visibles empiezan en vista previa, así la UI pinta al instante.
 * 2. Si hay una sesión de Spotify en el keychain, `SpotifyProvider` sustituye
 *    al de vista previa en cuanto se valida (sin abrir el navegador).
 * Los servicios ocultos por el usuario no se registran.
 */
export function bootstrapProviders() {
  for (const id of providerIds) {
    if (!isHidden(id) && !registry.tryGet(id)) registry.register(new PreviewProvider(id, { kv, history, latencyMs: 120 }));
  }
  if (!isHidden("spotify")) void restoreSpotify();
}

/** Muestra u oculta un servicio en caliente. */
export function setServiceVisible(id: ProviderId, visible: boolean) {
  useServicesPrefs.getState().setHidden(id, !visible);
  if (!visible) registry.unregister(id);
  else if (!registry.tryGet(id)) {
    registry.register(new PreviewProvider(id, { kv, history, latencyMs: 120 }));
    if (id === "spotify") void restoreSpotify();
  }
}
