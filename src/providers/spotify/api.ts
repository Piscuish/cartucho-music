/**
 * Acceso tipado a la Spotify Web API. Todas las respuestas se validan con zod
 * y se traducen al modelo de dominio. Los metadatos estables se cachean en SQLite.
 */
import { HttpClient, type HttpClientOptions } from "@/services/http/client";
import { HttpError } from "@/services/http/errors";
import { createCachedFetcher, TTL } from "@/services/cache";
import type { CacheStore } from "@/database/stores";
import type { Album, Artist, Playlist, Track } from "@/types/music";
import type { AlbumDetail, Page, PageRequest, PlaylistDetail, QueueSnapshot, SearchResults } from "../types";
import { NotFoundError } from "../errors";
import {
  albumSchema, artistSchema, devicesSchema, followedArtistsSchema, pagingSchema, playbackStateSchema, playlistSchema,
  queueSchema, recentlyPlayedSchema, savedAlbumSchema, savedTrackSchema, searchSchema, simplifiedPlaylistSchema, simplifiedTrackSchema, userSchema,
  type SpotifyDevice, type SpotifyPlaybackState,
} from "./schemas";
import {
  albumsFrom, artistsFrom, fullAlbumsFrom, mapAlbumDetail, mapArtist, mapPlaylist, playlistsFrom, tracksFrom, uri,
} from "./mappers";
import { z } from "zod";

export const SPOTIFY_API = "https://api.spotify.com/v1/";
/** Límites de Development Mode (feb. 2026). */
export const LIMITS = { search: 10, searchMaxOffset: 1000, page: 50, libraryUris: 40, queueUris: 100 };

/** Motivo de error que Spotify incluye en `error.reason` (p. ej. PREMIUM_REQUIRED, NO_ACTIVE_DEVICE). */
export function spotifyReason(e: unknown): string | undefined {
  if (!(e instanceof HttpError)) return undefined;
  const body = e.body as { error?: { reason?: string } } | undefined;
  return body?.error?.reason;
}

const offsetOf = (req?: PageRequest) => Number(req?.cursor ?? 0) || 0;
const limitOf = (req?: PageRequest) => Math.max(1, Math.min(req?.limit ?? LIMITS.page, LIMITS.page));
const nextOffset = (offset: number, count: number, total: number | null | undefined, next: string | null | undefined) =>
  next && offset + count < (total ?? Infinity) ? String(offset + count) : null;

const chunk = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export class SpotifyApi {
  readonly http: HttpClient;
  private readonly cached: ReturnType<typeof createCachedFetcher>;
  private readonly cacheStore?: CacheStore;
  private meP: Promise<{ id: string; displayName: string }> | null = null;

  constructor(opts: Omit<HttpClientOptions, "baseUrl"> & { cacheStore?: CacheStore }) {
    this.http = new HttpClient({ baseUrl: SPOTIFY_API, ...opts });
    this.cached = createCachedFetcher(opts.cacheStore);
    this.cacheStore = opts.cacheStore;
  }

  private async notFound<T>(what: string, id: string, p: Promise<T>): Promise<T> {
    try { return await p; } catch (e) {
      if (e instanceof HttpError && (e.status === 404 || e.status === 400)) throw new NotFoundError(what, id);
      throw e;
    }
  }

  /* ───────── Perfil ───────── */

  async me(signal?: AbortSignal) {
    const u = await this.http.get("me", { schema: userSchema, signal });
    return { id: u.id, displayName: u.display_name ?? u.id };
  }

  /** ID del usuario (una sola petición por sesión): sirve para saber qué playlists son suyas. */
  userId(): Promise<string> {
    this.meP ??= this.me().catch((e) => { this.meP = null; throw e; });
    return this.meP.then((m) => m.id);
  }

  /* ───────── Catálogo ───────── */

  async search(query: string, types: string[], limit: number, offset = 0, signal?: AbortSignal): Promise<SearchResults> {
    const lim = Math.min(limit, LIMITS.search);
    const more = (n: number | undefined) => (n ?? 0) >= lim && offset + lim < LIMITS.searchMaxOffset;
    const r = await this.cached(`spotify:search:v2:${types.join(",")}:${lim}:${offset}:${query.toLowerCase()}`, TTL.search, () =>
      this.http.get("search", { query: { q: query, type: types.join(","), limit: lim, offset }, schema: searchSchema, signal }));
    return {
      provider: "spotify",
      tracks: tracksFrom(r.tracks?.items ?? []),
      albums: albumsFrom(r.albums?.items ?? []),
      artists: artistsFrom(r.artists?.items ?? []),
      playlists: playlistsFrom(r.playlists?.items ?? []),
      // En Development Mode la búsqueda devuelve `next: null` y `total` = limit aunque haya más
      // (comprobado en nov. 2026): una página llena significa que puede haber más.
      hasMore: {
        track: more(r.tracks?.items.length), album: more(r.albums?.items.length),
        artist: more(r.artists?.items.length), playlist: more(r.playlists?.items.length),
      },
    };
  }

  album(id: string, signal?: AbortSignal): Promise<AlbumDetail> {
    return this.notFound("Álbum", id, this.cached(`spotify:album:${id}`, TTL.album, async () => {
      const a = await this.http.get(`albums/${encodeURIComponent(id)}`, { schema: albumSchema, signal });
      // Álbumes de más de 50 pistas: paginar el resto (una petición por página).
      const extra: z.infer<typeof simplifiedTrackSchema>[] = [];
      let offset = a.tracks?.items.length ?? 0;
      let next = a.tracks?.next;
      while (next && offset < (a.tracks?.total ?? 0)) {
        const page = await this.http.get(`albums/${encodeURIComponent(id)}/tracks`, {
          query: { limit: LIMITS.page, offset }, schema: pagingSchema(simplifiedTrackSchema), signal,
        });
        extra.push(...page.items);
        offset += page.items.length;
        next = page.next;
        if (!page.items.length) break;
      }
      return mapAlbumDetail(a, extra);
    }));
  }

  playlist(id: string, signal?: AbortSignal): Promise<PlaylistDetail> {
    return this.notFound("Playlist", id, this.cached(`spotify:playlist:${id}`, TTL.playlist, async () => {
      const p = await this.http.get(`playlists/${encodeURIComponent(id)}`, { schema: playlistSchema, signal });
      const paging = p.items ?? p.tracks;
      // `items` solo llega en playlists propias o colaborativas (Development Mode).
      const uid = await this.userId().catch(() => undefined);
      if (!paging) return { ...mapPlaylist(p, [], uid), tracks: [], tracksRestricted: true };
      // Solo la primera página: el resto se pide al hacer scroll (`playlistTracks`).
      const tracks = tracksFrom(paging.items.map((e) => e.item ?? e.track));
      const base = mapPlaylist(p, tracks.map((t) => t.id), uid);
      return { ...base, trackCount: paging.total ?? tracks.length, tracks };
    }));
  }

  /** Página de canciones de una playlist propia o colaborativa. */
  async playlistTracks(id: string, req?: PageRequest): Promise<Page<Track>> {
    const offset = offsetOf(req), limit = limitOf(req);
    const r = await this.notFound("Playlist", id, this.http.get(`playlists/${encodeURIComponent(id)}/items`, {
      query: { limit, offset }, schema: pagingSchema(z.object({ item: z.unknown().optional(), track: z.unknown().optional() })), signal: req?.signal,
    }));
    return { items: tracksFrom(r.items.map((e) => e.item ?? e.track)), total: r.total ?? undefined, nextCursor: nextOffset(offset, r.items.length, r.total, r.next) };
  }

  artist(id: string, signal?: AbortSignal): Promise<Artist> {
    return this.notFound("Artista", id, this.cached(`spotify:artist:${id}`, TTL.artist, async () =>
      mapArtist(await this.http.get(`artists/${encodeURIComponent(id)}`, { schema: artistSchema, signal }))));
  }

  async artistAlbums(id: string, req?: PageRequest): Promise<Page<Album>> {
    const offset = offsetOf(req), limit = Math.min(limitOf(req), 10);
    return this.cached(`spotify:artist-albums:${id}:${offset}:${limit}`, TTL.artistAlbums, async () => {
      const r = await this.http.get(`artists/${encodeURIComponent(id)}/albums`, {
        query: { include_groups: "album,single", limit, offset }, schema: pagingSchema(z.unknown()), signal: req?.signal,
      });
      const items = albumsFrom(r.items);
      return { items, total: r.total ?? undefined, nextCursor: nextOffset(offset, r.items.length, r.total, r.next) };
    });
  }

  /* ───────── Biblioteca ───────── */

  async savedTracks(req?: PageRequest): Promise<Page<Track>> {
    const offset = offsetOf(req), limit = limitOf(req);
    const r = await this.http.get("me/tracks", { query: { limit, offset }, schema: pagingSchema(savedTrackSchema), signal: req?.signal });
    return { items: tracksFrom(r.items.map((i) => i.track)), total: r.total ?? undefined, nextCursor: nextOffset(offset, r.items.length, r.total, r.next) };
  }

  async savedAlbums(req?: PageRequest): Promise<Page<Album>> {
    const offset = offsetOf(req), limit = limitOf(req);
    const r = await this.http.get("me/albums", { query: { limit, offset }, schema: pagingSchema(savedAlbumSchema), signal: req?.signal });
    return { items: fullAlbumsFrom(r.items.map((i) => i.album)), total: r.total ?? undefined, nextCursor: nextOffset(offset, r.items.length, r.total, r.next) };
  }

  async followedArtists(req?: PageRequest): Promise<Page<Artist>> {
    const r = await this.http.get("me/following", {
      query: { type: "artist", limit: limitOf(req), after: req?.cursor ?? undefined }, schema: followedArtistsSchema, signal: req?.signal,
    });
    return { items: artistsFrom(r.artists.items), total: r.artists.total ?? undefined, nextCursor: r.artists.next ? r.artists.cursors?.after ?? null : null };
  }

  async playlists(req?: PageRequest): Promise<Page<Playlist>> {
    const offset = offsetOf(req), limit = limitOf(req);
    const [r, uid] = await Promise.all([
      this.http.get("me/playlists", { query: { limit, offset }, schema: pagingSchema(z.unknown()), signal: req?.signal }),
      this.userId().catch(() => undefined),
    ]);
    return { items: playlistsFrom(r.items, uid), total: r.total ?? undefined, nextCursor: nextOffset(offset, r.items.length, r.total, r.next) };
  }

  /** `GET /me/library/contains` (máx. 40 URIs por petición). */
  async containsTracks(ids: string[], signal?: AbortSignal): Promise<boolean[]> {
    const out: boolean[] = [];
    for (const part of chunk(ids, LIMITS.libraryUris)) {
      const r = await this.http.get("me/library/contains", { query: { uris: part.map(uri.track).join(",") }, schema: z.array(z.boolean()), signal });
      out.push(...part.map((_, i) => r[i] ?? false));
    }
    return out;
  }

  async saveTracks(ids: string[]) {
    for (const part of chunk(ids, LIMITS.libraryUris)) await this.http.put("me/library", { query: { uris: part.map(uri.track).join(",") } });
  }

  async removeTracks(ids: string[]) {
    for (const part of chunk(ids, LIMITS.libraryUris)) await this.http.delete("me/library", { query: { uris: part.map(uri.track).join(",") } });
  }

  /** `POST /playlists/{id}/items` (máx. 100 URIs por petición). */
  async addToPlaylist(playlistId: string, trackIds: string[]) {
    for (const part of chunk(trackIds, 100)) {
      await this.http.post(`playlists/${encodeURIComponent(playlistId)}/items`, { body: { uris: part.map(uri.track) } });
    }
    await this.cacheStore?.clear(`spotify:playlist:${playlistId}`).catch(() => {});
  }

  /** `DELETE /playlists/{id}/items` con `{ items: [{ uri }] }` (máx. 100 por petición). */
  async removeFromPlaylist(playlistId: string, trackIds: string[]) {
    for (const part of chunk(trackIds, 100)) {
      await this.http.delete(`playlists/${encodeURIComponent(playlistId)}/items`, { body: { items: part.map((id) => ({ uri: uri.track(id) })) } });
    }
    await this.cacheStore?.clear(`spotify:playlist:${playlistId}`).catch(() => {});
  }

  /**
   * IDs de todas las canciones de una playlist propia o colaborativa, pidiendo solo el campo
   * `id` (hasta 2000 canciones: 20 páginas de 100).
   */
  async playlistTrackIds(playlistId: string, signal?: AbortSignal): Promise<string[]> {
    const ids: string[] = [];
    const entry = z.object({ item: z.object({ id: z.string().nullish() }).nullish(), track: z.object({ id: z.string().nullish() }).nullish() });
    let offset = 0;
    for (let i = 0; i < 20; i++) {
      const r = await this.notFound("Playlist", playlistId, this.http.get(`playlists/${encodeURIComponent(playlistId)}/items`, {
        query: { limit: 100, offset, fields: "items(item(id),track(id)),next,total" }, schema: pagingSchema(entry), signal,
      }));
      for (const e of r.items) {
        const id = e.item?.id ?? e.track?.id;
        if (id) ids.push(id);
      }
      if (!r.next || r.items.length === 0) break;
      offset += r.items.length;
    }
    return ids;
  }

  /** `POST /me/playlists`: playlist privada vacía. */
  async createPlaylist(name: string): Promise<Playlist> {
    const p = await this.http.post("me/playlists", {
      body: { name, public: false, description: "Creada con Cartucho Music" },
      schema: simplifiedPlaylistSchema,
    });
    return { ...mapPlaylist(p, [], await this.userId().catch(() => undefined)), canEdit: true };
  }

  /* ───────── Personalización ───────── */

  async recentlyPlayed(limit: number, signal?: AbortSignal): Promise<Track[]> {
    const r = await this.http.get("me/player/recently-played", { query: { limit: 50 }, schema: recentlyPlayedSchema, signal });
    const seen = new Set<string>();
    return tracksFrom(r.items.map((i) => i.track)).filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true))).slice(0, limit);
  }

  async topArtists(limit: number, signal?: AbortSignal): Promise<Artist[]> {
    const r = await this.http.get("me/top/artists", { query: { limit: Math.min(limit, 50), time_range: "short_term" }, schema: pagingSchema(z.unknown()), signal });
    return artistsFrom(r.items);
  }

  /* ───────── Reproductor ───────── */

  /** `null` si no hay nada reproduciéndose en ningún dispositivo (204). */
  async playbackState(signal?: AbortSignal): Promise<SpotifyPlaybackState | null> {
    const r = await this.http.get("me/player", { query: { additional_types: "track" }, signal });
    if (r === undefined || r === null || r === "") return null;
    return playbackStateSchema.parse(r);
  }

  async devices(signal?: AbortSignal): Promise<SpotifyDevice[]> {
    return (await this.http.get("me/player/devices", { schema: devicesSchema, signal })).devices;
  }

  async queue(signal?: AbortSignal): Promise<QueueSnapshot> {
    const r = await this.http.get("me/player/queue", { schema: queueSchema, signal });
    const [current] = tracksFrom(r.currently_playing ? [r.currently_playing] : []);
    return { current: current ?? null, upNext: tracksFrom(r.queue) };
  }
}

export { tracksFrom };
