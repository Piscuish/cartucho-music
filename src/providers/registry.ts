import type { ProviderId } from "@/types/music";
import type { MusicProvider, ProviderCapabilities } from "./types";
import { spotifyCapabilities } from "./spotify/capabilities";
import { appleMusicCapabilities } from "./apple-music/capabilities";

/* ───────────── Metadatos estáticos (marca, color, fase) ───────────── */

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  /** Color de identificación del servicio (solo para la insignia de procedencia). */
  color: string;
  capabilities: ProviderCapabilities;
  /** Fase del plan en la que se habilita la conexión real. */
  phase: number;
}

export const providers: Record<ProviderId, ProviderMeta> = {
  spotify: { id: "spotify", name: "Spotify", color: "#1ED760", capabilities: spotifyCapabilities, phase: 3 },
  "apple-music": { id: "apple-music", name: "Apple Music", color: "#FA2D48", capabilities: appleMusicCapabilities, phase: 5 },
};

export const providerList = Object.values(providers);
export const providerIds = providerList.map((p) => p.id);

/* ───────────── Registro en tiempo de ejecución ───────────── */

/**
 * Instancias activas de cada proveedor. El núcleo solo conoce `MusicProvider`:
 * un servicio nuevo, o la versión real que sustituye a la de vista previa,
 * se activa con `register()` sin tocar la UI.
 */
export class ProviderRegistry {
  private readonly map = new Map<ProviderId, MusicProvider>();
  private readonly listeners = new Set<() => void>();
  private version = 0;

  register(provider: MusicProvider): void {
    const meta = providers[provider.id];
    if (!meta) throw new Error(`Proveedor desconocido: ${provider.id}`);
    const prev = this.map.get(provider.id);
    if (prev && prev !== provider) prev.dispose();
    this.map.set(provider.id, provider);
    this.emit();
  }

  unregister(id: ProviderId): void {
    const prev = this.map.get(id);
    if (!prev) return;
    prev.dispose();
    this.map.delete(id);
    this.emit();
  }

  get(id: ProviderId): MusicProvider {
    const p = this.map.get(id);
    if (!p) throw new Error(`Proveedor no registrado: ${id}`);
    return p;
  }

  tryGet(id: ProviderId): MusicProvider | undefined {
    return this.map.get(id);
  }

  /** En el orden canónico de `providerList`. */
  list(): MusicProvider[] {
    return providerIds.map((id) => this.map.get(id)).filter((p): p is MusicProvider => !!p);
  }

  /** Cambia cada vez que se registra o retira un proveedor (para claves de caché). */
  getVersion(): number {
    return this.version;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.version++;
    for (const l of this.listeners) l();
  }
}

export const registry = new ProviderRegistry();
