import { useSyncExternalStore } from "react";
import { providers, registry, type ProviderMeta } from "@/providers/registry";
import type { ConnectionStatus, MusicProvider } from "@/providers/types";
import type { ProviderId } from "@/types/music";

/** Proveedores registrados; se actualiza cuando uno se registra o se sustituye. */
export function useProviders(): MusicProvider[] {
  useSyncExternalStore((cb) => registry.subscribe(cb), () => registry.getVersion());
  return registry.list();
}

/** Metadatos de los servicios visibles (los registrados), en orden canónico. */
export function useVisibleServices(): ProviderMeta[] {
  return useProviders().map((p) => providers[p.id]);
}

/** Versión del registro, para incluirla en las claves de consulta. */
export function useRegistryVersion(): number {
  return useSyncExternalStore((cb) => registry.subscribe(cb), () => registry.getVersion());
}

export function useConnectionStatus(id: ProviderId): ConnectionStatus {
  useRegistryVersion();
  const p = registry.tryGet(id);
  return useSyncExternalStore(
    (cb) => (p ? p.auth.subscribe(cb) : () => {}),
    () => p?.auth.getStatus() ?? ({ state: "disconnected" } as const),
  );
}

/** ¿Algún proveedor registrado sirve datos de ejemplo? */
export function useHasPreviewProviders(): boolean {
  return useProviders().some((p) => p.isPreview);
}
