/**
 * Proveedor de VISTA PREVIA: implementa el contrato `MusicProvider` completo
 * sobre el catálogo ficticio. Sirve para que toda la UI ya consuma la misma
 * interfaz que usarán Spotify (Fase 3) y Apple Music (Fase 5).
 *
 * - Respeta las capacidades del servicio que representa: si Spotify no permite
 *   algo, aquí tampoco (lanza `UnsupportedOperationError`).
 * - Su estado de conexión es `preview`; la UI lo muestra así.
 */
import type { Album, Artist, Playlist, ProviderId, Track } from "@/types/music";
import type {
  AlbumDetail, AuthModule, CatalogModule, ConnectionStatus, LibraryModule, MusicProvider, Page, PageRequest,
  PersonalizationModule, PlayContext, PlaylistDetail, ProviderCapabilities, SearchOptions, SearchResults,
} from "../types";
import { NotFoundError, UnsupportedOperationError } from "../errors";
import { providers } from "../registry";
import { PreviewPlayback } from "./PreviewPlayback";
import * as data from "@/services/preview/catalog";
import type { KeyValueStore, HistoryStore } from "@/database/stores";
import { normalize } from "@/utils/format";

export interface PreviewProviderOptions {
  kv: KeyValueStore;
  history: HistoryStore;
  /** Latencia simulada, para ejercitar los estados de carga. */
  latencyMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

function paginate<T>(items: T[], req: PageRequest = {}): Page<T> {
  const offset = Number(req.cursor ?? 0) || 0;
  const limit = Math.max(1, Math.min(req.limit ?? 50, 50));
  const slice = items.slice(offset, offset + limit);
  const next = offset + limit < items.length ? String(offset + limit) : null;
  return { items: slice, total: items.length, nextCursor: next };
}

export class PreviewProvider implements MusicProvider {
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  readonly isPreview = true;
  readonly auth: AuthModule;
  readonly catalog: CatalogModule;
  readonly library: LibraryModule;
  readonly personalization: PersonalizationModule;
  readonly playback: PreviewPlayback;

  private readonly tracks: Track[];
  private readonly albums: Album[];
  private readonly artists: Artist[];
  private readonly playlists: Playlist[];
  private readonly savedKey: string;

  constructor(readonly id: ProviderId, private readonly opts: PreviewProviderOptions) {
    const meta = providers[id];
    this.displayName = meta.name;
    this.capabilities = meta.capabilities;
    this.savedKey = `preview.saved.${id}`;

    this.tracks = data.tracks.filter((t) => t.provider === id);
    this.albums = data.albums.filter((a) => a.provider === id);
    this.artists = data.artists.filter((a) => a.provider === id);
    // Copias editables: los cambios de la vista previa no tocan el catálogo de ejemplo.
    this.playlists = data.playlists.filter((p) => p.provider === id).map((p) => ({ ...p, trackIds: [...p.trackIds], canEdit: true }));

    const status: ConnectionStatus = { state: "preview" };
    this.auth = {
      getStatus: () => status,
      subscribe: () => () => {},
      connect: async () => { throw new UnsupportedOperationError(id, `connect (disponible en la Fase ${meta.phase})`); },
      disconnect: async () => {},
    };

    this.catalog = {
      search: (q, o) => this.delay(() => this.search(q, o), o?.signal),
      getAlbum: (albumId, signal) => this.delay(() => this.albumDetail(albumId), signal),
      getPlaylist: (pid, signal) => this.delay(() => this.playlistDetail(pid), signal),
      getPlaylistTracks: (pid, page) => this.delay(() => paginate(this.playlistDetail(pid).tracks, page), page?.signal),
      getArtist: (aid, signal) => this.delay(() => this.find(this.artists, aid, "Artista"), signal),
      getArtistAlbums: (aid, page) => this.delay(() => paginate(this.albums.filter((a) => a.artistIds.includes(aid)), page), page?.signal),
      getArtistTopTracks: (aid, signal) => this.delay(() => {
        this.guard(this.capabilities.catalog.artistTopTracks, "getArtistTopTracks");
        return this.tracks.filter((t) => t.artistIds.includes(aid)).slice(0, 5);
      }, signal),
      getNewReleases: (page) => this.delay(() => {
        this.guard(this.capabilities.catalog.newReleases, "getNewReleases");
        return paginate([...this.albums].filter((a) => a.year >= 2025).sort((a, b) => b.year - a.year), page);
      }, page?.signal),
    };

    this.library = {
      getSavedTracks: async (page) => {
        const ids = await this.savedIds();
        return this.delay(() => paginate(ids.map((i) => this.tracks.find((t) => t.id === i)).filter((t): t is Track => !!t), page), page?.signal);
      },
      getSavedAlbums: (page) => this.delay(() => paginate(this.albums, page), page?.signal),
      getFollowedArtists: (page) => this.delay(() => paginate(this.artists, page), page?.signal),
      getPlaylists: (page) => this.delay(() => paginate(this.playlists, page), page?.signal),
      containsTracks: async (ids) => {
        const saved = new Set(await this.savedIds());
        return ids.map((i) => saved.has(i));
      },
      saveTracks: async (ids) => {
        this.guard(this.capabilities.library.write, "saveTracks");
        const current = await this.savedIds();
        await this.opts.kv.set(this.savedKey, JSON.stringify([...ids.filter((i) => !current.includes(i)), ...current]));
      },
      addToPlaylist: async (pid, ids) => {
        this.guard(this.capabilities.library.playlistWrite, "addToPlaylist");
        const p = this.find(this.playlists, pid, "Playlist");
        if (!p.canEdit) throw new UnsupportedOperationError(id, "addToPlaylist");
        p.trackIds.push(...ids.filter((x) => this.tracks.some((t) => t.id === x)));
        p.trackCount = p.trackIds.length;
      },
      removeFromPlaylist: async (pid, ids) => {
        this.guard(this.capabilities.library.playlistWrite, "removeFromPlaylist");
        const p = this.find(this.playlists, pid, "Playlist");
        if (!p.canEdit) throw new UnsupportedOperationError(id, "removeFromPlaylist");
        p.trackIds = p.trackIds.filter((x) => !ids.includes(x));
        p.trackCount = p.trackIds.length;
      },
      getPlaylistTrackIds: async (pid) => [...this.find(this.playlists, pid, "Playlist").trackIds],
      createPlaylist: async (name) => {
        this.guard(this.capabilities.library.playlistWrite, "createPlaylist");
        const p: Playlist = {
          kind: "playlist", id: `pl-local-${Date.now().toString(36)}`, provider: id, name: name.trim(), description: "",
          ownerName: "Tú", trackIds: [], trackCount: 0, canEdit: true, artwork: { palette: ["#3a3442", "#14121a"] },
        };
        this.playlists.unshift(p);
        return p;
      },
      removeTracks: async (ids) => {
        this.guard(this.capabilities.library.write, "removeTracks");
        const current = await this.savedIds();
        await this.opts.kv.set(this.savedKey, JSON.stringify(current.filter((i) => !ids.includes(i))));
      },
    };

    this.personalization = {
      getRecentlyPlayed: async (limit = 20, signal) => {
        this.guard(this.capabilities.personalization.recentlyPlayed, "getRecentlyPlayed");
        const local = (await this.opts.history.list<Track>(200)).filter((h) => h.provider === id).map((h) => h.track);
        const seeded = data.catalog.tracksOf(data.recentTrackIds).filter((t) => t.provider === id);
        const seen = new Set<string>();
        const merged = [...local, ...seeded].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
        return this.delay(() => merged.slice(0, limit), signal);
      },
      getTopArtists: (limit = 20, signal) => this.delay(() => {
        this.guard(this.capabilities.personalization.topArtists, "getTopArtists");
        return this.artists.slice(0, limit);
      }, signal),
      getRecommendations: (limit = 20, signal) => this.delay(() => {
        this.guard(this.capabilities.personalization.recommendations, "getRecommendations");
        return this.albums.slice(0, limit);
      }, signal),
    };

    this.playback = new PreviewPlayback({
      provider: id,
      capabilities: this.capabilities,
      resolve: (ctx) => this.resolveContext(ctx),
      now: opts.now,
      setTimer: opts.setTimer,
      clearTimer: opts.clearTimer,
    });
  }

  dispose() {
    this.playback.dispose();
  }

  /* ───────────── internos ───────────── */

  private async savedIds(): Promise<string[]> {
    const raw = await this.opts.kv.get(this.savedKey);
    if (raw == null) return data.favoriteTrackIds.filter((i) => this.tracks.some((t) => t.id === i));
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }

  private delay<T>(fn: () => T, signal?: AbortSignal): Promise<T> {
    const ms = this.opts.latencyMs ?? 0;
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const run = () => { try { resolve(fn()); } catch (e) { reject(e); } };
      if (ms <= 0) return run();
      const t = setTimeout(run, ms);
      signal?.addEventListener("abort", () => { clearTimeout(t); reject(signal.reason); }, { once: true });
    });
  }

  private guard(allowed: boolean, op: string) {
    if (!allowed) throw new UnsupportedOperationError(this.id, op);
  }

  private find<T extends { id: string }>(xs: T[], id: string, what: string): T {
    const x = xs.find((e) => e.id === id);
    if (!x) throw new NotFoundError(what, id);
    return x;
  }

  private byIds(ids: string[]): Track[] {
    return ids.map((i) => this.tracks.find((t) => t.id === i)).filter((t): t is Track => !!t);
  }

  private albumDetail(id: string): AlbumDetail {
    const a = this.find(this.albums, id, "Álbum");
    return { ...a, tracks: this.byIds(a.trackIds) };
  }

  private playlistDetail(id: string): PlaylistDetail {
    const p = this.find(this.playlists, id, "Playlist");
    return { ...p, tracks: this.byIds(p.trackIds) };
  }

  private search(query: string, o: SearchOptions = {}): SearchResults {
    this.guard(this.capabilities.catalog.search, "search");
    const q = normalize(query.trim());
    const types = new Set(o.types ?? ["track", "album", "artist", "playlist"]);
    const limit = o.limit ?? 20;
    const offset = o.offset ?? 0;
    const m = (s: string) => q.length > 0 && normalize(s).includes(q);
    const all = {
      track: types.has("track") ? this.tracks.filter((t) => m(t.name) || t.artistNames.some(m) || m(t.albumName)) : [],
      album: types.has("album") ? this.albums.filter((a) => m(a.name) || a.artistNames.some(m)) : [],
      artist: types.has("artist") ? this.artists.filter((a) => m(a.name) || a.genres.some(m)) : [],
      playlist: types.has("playlist") ? this.playlists.filter((p) => m(p.name) || m(p.description)) : [],
    };
    const page = <T,>(xs: T[]) => xs.slice(offset, offset + limit);
    return {
      provider: this.id,
      tracks: page(all.track),
      albums: page(all.album),
      artists: page(all.artist),
      playlists: page(all.playlist),
      hasMore: {
        track: all.track.length > offset + limit, album: all.album.length > offset + limit,
        artist: all.artist.length > offset + limit, playlist: all.playlist.length > offset + limit,
      },
    };
  }

  private async resolveContext(ctx: PlayContext): Promise<{ tracks: Track[]; startIndex: number }> {
    switch (ctx.kind) {
      case "tracks":
        return { tracks: this.byIds(ctx.trackIds), startIndex: ctx.startIndex ?? 0 };
      case "album":
      case "playlist": {
        const d = ctx.kind === "album" ? this.albumDetail(ctx.id) : this.playlistDetail(ctx.id);
        const i = ctx.startTrackId ? d.tracks.findIndex((t) => t.id === ctx.startTrackId) : 0;
        return { tracks: d.tracks, startIndex: Math.max(0, i) };
      }
      case "artist":
        return { tracks: this.tracks.filter((t) => t.artistIds.includes(ctx.id)), startIndex: 0 };
    }
  }
}
