import type { Album, Artist, Playlist, ProviderId, Track } from "@/types/music";

/* ───────────────────────── Capacidades ───────────────────────── */

/**
 * Capacidades declaradas explícitamente por cada proveedor.
 * La UI consulta estas banderas, nunca el nombre del servicio, para decidir
 * qué controles mostrar. Ver docs/VIABILIDAD.md para la justificación de cada valor.
 */
export interface ProviderCapabilities {
  auth: { required: boolean; flow: "pkce" | "musickit" | "none" };
  catalog: { search: boolean; albums: boolean; artists: boolean; playlists: boolean; artistTopTracks: boolean; newReleases: boolean };
  library: { savedTracks: boolean; albums: boolean; artists: boolean; playlists: boolean; write: boolean };
  personalization: { recentlyPlayed: boolean; topArtists: boolean; recommendations: boolean };
  playback: {
    /** Reproducción dentro de la app (SDK con DRM). */
    inApp: "available" | "unverified" | "unavailable";
    /** Control de un dispositivo oficial externo (Spotify Connect). */
    remoteControl: boolean;
    requiresPremium: boolean;
    seek: boolean;
    volume: boolean;
    shuffle: boolean;
    repeat: boolean;
  };
  queue: { read: boolean; add: boolean; remove: boolean; reorder: boolean };
  lyrics: { plain: boolean; synced: boolean };
}

/* ───────────────────────── Conexión ───────────────────────── */

export type ConnectionStatus =
  | { state: "disconnected" }
  | { state: "connecting" }
  | { state: "connected"; displayName: string; premium?: boolean }
  | { state: "preview" }
  | { state: "unavailable"; reason: string }
  | { state: "error"; message: string };

export interface AuthModule {
  getStatus(): ConnectionStatus;
  subscribe(listener: (s: ConnectionStatus) => void): () => void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

/* ───────────────────────── Catálogo y biblioteca ───────────────────────── */

export interface PageRequest { limit?: number; cursor?: string | null; signal?: AbortSignal }
export interface Page<T> { items: T[]; total?: number; nextCursor: string | null }

export type SearchType = "track" | "album" | "artist" | "playlist";
export interface SearchOptions { types?: SearchType[]; limit?: number; /** Desplazamiento para "cargar más". */ offset?: number; signal?: AbortSignal }

/** Resultados de UN servicio. Los resultados de distintos servicios nunca se fusionan. */
export interface SearchResults {
  provider: ProviderId;
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
  /** Tipos con más resultados disponibles (para "cargar más"). */
  hasMore?: Partial<Record<SearchType, boolean>>;
}

export type AlbumDetail = Album & { tracks: Track[] };
export type PlaylistDetail = Playlist & {
  tracks: Track[];
  /** El servicio no permite listar el contenido (p. ej. Spotify con playlists ajenas). Se puede reproducir igualmente. */
  tracksRestricted?: boolean;
};

export interface CatalogModule {
  search(query: string, opts?: SearchOptions): Promise<SearchResults>;
  getAlbum(id: string, signal?: AbortSignal): Promise<AlbumDetail>;
  getPlaylist(id: string, signal?: AbortSignal): Promise<PlaylistDetail>;
  /** Canciones de una playlist por páginas (playlists grandes). */
  getPlaylistTracks(id: string, page?: PageRequest): Promise<Page<Track>>;
  getArtist(id: string, signal?: AbortSignal): Promise<Artist>;
  getArtistAlbums(id: string, page?: PageRequest): Promise<Page<Album>>;
  /** Requiere `capabilities.catalog.artistTopTracks`. */
  getArtistTopTracks(id: string, signal?: AbortSignal): Promise<Track[]>;
  /** Requiere `capabilities.catalog.newReleases`. */
  getNewReleases(page?: PageRequest): Promise<Page<Album>>;
}

export interface LibraryModule {
  getSavedTracks(page?: PageRequest): Promise<Page<Track>>;
  getSavedAlbums(page?: PageRequest): Promise<Page<Album>>;
  getFollowedArtists(page?: PageRequest): Promise<Page<Artist>>;
  getPlaylists(page?: PageRequest): Promise<Page<Playlist>>;
  /** Devuelve, en el mismo orden, si cada canción está guardada. */
  containsTracks(ids: string[], signal?: AbortSignal): Promise<boolean[]>;
  /** Requiere `capabilities.library.write`. */
  saveTracks(ids: string[]): Promise<void>;
  removeTracks(ids: string[]): Promise<void>;
}

export interface PersonalizationModule {
  getRecentlyPlayed(limit?: number, signal?: AbortSignal): Promise<Track[]>;
  getTopArtists(limit?: number, signal?: AbortSignal): Promise<Artist[]>;
  /** Requiere `capabilities.personalization.recommendations`. */
  getRecommendations(limit?: number, signal?: AbortSignal): Promise<Album[]>;
}

/* ───────────────────────── Reproducción ───────────────────────── */

export type RepeatMode = "off" | "all" | "one";

export interface PlaybackState {
  provider: ProviderId;
  /**
   * - `preview`: vista previa de diseño, SIN audio (Fase 1–2).
   * - `in-app`: audio dentro de Cartucho mediante el SDK oficial.
   * - `remote`: controla un dispositivo oficial externo (Spotify Connect).
   */
  mode: "preview" | "in-app" | "remote";
  track: Track | null;
  isPlaying: boolean;
  positionMs: number;
  /** Momento (epoch ms) en que se midió `positionMs`; la UI interpola a partir de él. */
  timestamp: number;
  volume: number | null;
  shuffle: boolean;
  repeat: RepeatMode;
  device: { id: string; name: string; type: string } | null;
}

/** Qué reproducir. Siempre dentro de UN proveedor. */
export type PlayContext =
  | { kind: "tracks"; trackIds: string[]; startIndex?: number }
  | { kind: "album" | "playlist"; id: string; startTrackId?: string }
  | { kind: "artist"; id: string };

export interface QueueSnapshot { current: Track | null; upNext: Track[] }

export interface PlaybackModule {
  getState(): PlaybackState | null;
  subscribe(listener: (s: PlaybackState | null) => void): () => void;
  play(ctx: PlayContext): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  setShuffle(on: boolean): Promise<void>;
  setRepeat(mode: RepeatMode): Promise<void>;
  getQueue(signal?: AbortSignal): Promise<QueueSnapshot>;
  /** Requiere `capabilities.queue.add`. */
  addToQueue(trackId: string): Promise<void>;
  /** Requiere `capabilities.queue.remove`. */
  removeFromQueue(index: number): Promise<void>;
  /** Requiere `capabilities.queue.reorder`. */
  moveInQueue(from: number, to: number): Promise<void>;
}

/* ───────────────────────── Dispositivos (opcional) ───────────────────────── */

export interface PlaybackDevice {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  /** El reproductor integrado de Cartucho (Web Playback SDK). */
  isThisApp: boolean;
  restricted: boolean;
  volume: number | null;
}

export type InAppPlayerStatus =
  | { state: "idle" }
  | { state: "unsupported"; message: string }
  | { state: "loading"; message?: string }
  | { state: "ready"; deviceId: string }
  | { state: "error"; message: string };

/** Servicios con varios dispositivos (Spotify Connect). */
export interface DevicesModule {
  list(signal?: AbortSignal): Promise<PlaybackDevice[]>;
  transfer(deviceId: string, play?: boolean): Promise<void>;
  getInAppStatus(): InAppPlayerStatus;
  subscribeInApp(listener: (s: InAppPlayerStatus) => void): () => void;
}

/* ───────────────────────── Contrato del proveedor ───────────────────────── */

export interface MusicProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  /** `true` si sirve datos de ejemplo (prototipo). La UI debe indicarlo. */
  readonly isPreview: boolean;
  readonly auth: AuthModule;
  readonly catalog: CatalogModule;
  readonly library: LibraryModule;
  readonly personalization: PersonalizationModule;
  readonly playback: PlaybackModule;
  /** Solo en servicios con selección de dispositivo. */
  readonly devices?: DevicesModule;
  /** Libera temporizadores, conexiones y suscripciones. */
  dispose(): void;
}
