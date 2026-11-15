import type {
  AuthModule, CatalogModule, LibraryModule, MusicProvider, PersonalizationModule,
} from "../types";
import { UnsupportedOperationError } from "../errors";
import { providers } from "../registry";
import { SpotifyApi } from "./api";
import type { SpotifyAuth } from "./auth";
import { SpotifyPlayback, type SpotifyPlaybackOptions } from "./playback";
import { WebPlaybackDevice } from "./webPlayback";
import type { CacheStore } from "@/database/stores";
import type { HttpClientOptions } from "@/services/http/client";

export interface SpotifyProviderOptions {
  auth: SpotifyAuth;
  /** Arranca el Web Playback SDK (desactivado en tests y fuera de Tauri). */
  inAppPlayer?: boolean;
  cacheStore?: CacheStore;
  http?: Partial<Omit<HttpClientOptions, "baseUrl" | "getAccessToken" | "refreshAuth">>;
  playback?: SpotifyPlaybackOptions;
}

/** Spotify real: Web API + Spotify Connect + Web Playback SDK. */
export class SpotifyProvider implements MusicProvider {
  readonly id = "spotify" as const;
  readonly displayName = "Spotify";
  readonly capabilities = providers.spotify.capabilities;
  readonly isPreview = false;
  readonly auth: AuthModule;
  readonly api: SpotifyApi;
  readonly catalog: CatalogModule;
  readonly library: LibraryModule;
  readonly personalization: PersonalizationModule;
  readonly playback: SpotifyPlayback;
  readonly devices: SpotifyPlayback;
  private readonly sdk: WebPlaybackDevice | null;

  constructor(opts: SpotifyProviderOptions) {
    const { auth } = opts;
    this.auth = auth;
    this.api = new SpotifyApi({
      ...opts.http,
      cacheStore: opts.cacheStore,
      getAccessToken: () => auth.getAccessToken(),
      refreshAuth: () => auth.refresh(),
    });
    const api = this.api;
    const unsupported = (op: string) => Promise.reject(new UnsupportedOperationError("spotify", op));

    this.catalog = {
      search: (q, o) => (q.trim()
        ? api.search(q.trim(), (o?.types ?? ["track", "album", "artist", "playlist"]), o?.limit ?? 10, o?.offset ?? 0, o?.signal)
        : Promise.resolve({ provider: "spotify", tracks: [], albums: [], artists: [], playlists: [] })),
      getAlbum: (id, s) => api.album(id, s),
      getPlaylist: (id, s) => api.playlist(id, s),
      getPlaylistTracks: (id, page) => api.playlistTracks(id, page),
      getArtist: (id, s) => api.artist(id, s),
      getArtistAlbums: (id, page) => api.artistAlbums(id, page),
      // Retirados para apps en Development Mode (feb. 2026).
      getArtistTopTracks: () => unsupported("getArtistTopTracks"),
      getNewReleases: () => unsupported("getNewReleases"),
    };

    this.library = {
      getSavedTracks: (p) => api.savedTracks(p),
      getSavedAlbums: (p) => api.savedAlbums(p),
      getFollowedArtists: (p) => api.followedArtists(p),
      getPlaylists: (p) => api.playlists(p),
      containsTracks: (ids, s) => api.containsTracks(ids, s),
      saveTracks: (ids) => api.saveTracks(ids),
      removeTracks: (ids) => api.removeTracks(ids),
    };

    this.personalization = {
      getRecentlyPlayed: (limit = 20, s) => api.recentlyPlayed(limit, s),
      getTopArtists: (limit = 20, s) => api.topArtists(limit, s),
      // Retirado para apps nuevas (nov. 2024).
      getRecommendations: () => unsupported("getRecommendations"),
    };

    this.sdk = opts.inAppPlayer ? new WebPlaybackDevice(() => auth.getAccessToken(), () => void this.playback.refresh()) : null;
    this.playback = new SpotifyPlayback(api, this.sdk, opts.playback);
    this.devices = this.playback;
    void this.sdk?.start();
  }

  dispose() {
    this.playback.dispose();
  }
}
