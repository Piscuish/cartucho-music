/**
 * Traducción de objetos de Spotify al modelo de dominio de Cartucho.
 * No se modifican nombres ni portadas (Design Guidelines de Spotify):
 * solo se reestructuran.
 */
import type { Album, Artist, Artwork, Playlist, Track } from "@/types/music";
import {
  albumSchema, artistSchema, simplifiedAlbumSchema, simplifiedPlaylistSchema, trackSchema,
  type SpotifyAlbum, type SpotifyArtist, type SpotifyImage, type SpotifySimplifiedAlbum,
  type SpotifySimplifiedPlaylist, type SpotifySimplifiedTrack, type SpotifyTrack,
} from "./schemas";

export const uri = {
  track: (id: string) => `spotify:track:${id}`,
  album: (id: string) => `spotify:album:${id}`,
  artist: (id: string) => `spotify:artist:${id}`,
  playlist: (id: string) => `spotify:playlist:${id}`,
};

/** Imagen de ~300-640 px: suficiente para tarjetas y cabeceras sin descargar la de 640 en listas. */
export function toArtwork(images: SpotifyImage[]): Artwork {
  if (!images.length) return {};
  const sorted = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  const best = sorted.find((i) => (i.width ?? 640) <= 640) ?? sorted[0];
  return { url: best.url };
}

const artistsOf = (xs: { id?: string | null; name: string }[]) => {
  const withId = xs.filter((a) => a.id);
  return { artistIds: withId.map((a) => a.id!), artistNames: withId.map((a) => a.name) };
};

const albumType = (t: string | null | undefined): Album["albumType"] => (t === "single" ? "single" : t === "ep" ? "ep" : "album");

export function mapTrack(t: SpotifyTrack): Track | null {
  if (!t.id || t.is_local) return null; // los archivos locales no se pueden reproducir vía API
  return {
    kind: "track",
    id: t.id,
    provider: "spotify",
    name: t.name,
    ...artistsOf(t.artists),
    albumId: t.album.id,
    albumName: t.album.name,
    durationMs: t.duration_ms,
    explicit: t.explicit ?? false,
    artwork: toArtwork(t.album.images),
  };
}

/** Pistas de un álbum: heredan portada y nombre del álbum. */
export function mapAlbumTrack(t: SpotifySimplifiedTrack, album: SpotifySimplifiedAlbum): Track | null {
  if (!t.id || t.is_local) return null;
  return {
    kind: "track",
    id: t.id,
    provider: "spotify",
    name: t.name,
    ...artistsOf(t.artists),
    albumId: album.id,
    albumName: album.name,
    durationMs: t.duration_ms,
    explicit: t.explicit ?? false,
    artwork: toArtwork(album.images),
  };
}

export function mapSimplifiedAlbum(a: SpotifySimplifiedAlbum, trackIds: string[] = []): Album {
  return {
    kind: "album",
    id: a.id,
    provider: "spotify",
    name: a.name,
    ...artistsOf(a.artists),
    year: Number((a.release_date ?? "").slice(0, 4)) || 0,
    albumType: albumType(a.album_type),
    trackIds,
    artwork: toArtwork(a.images),
  };
}

export function mapAlbumDetail(a: SpotifyAlbum, extraTracks: SpotifySimplifiedTrack[] = []) {
  const tracks = [...(a.tracks?.items ?? []), ...extraTracks]
    .map((t) => mapAlbumTrack(t, a))
    .filter((t): t is Track => !!t);
  return { ...mapSimplifiedAlbum(a, tracks.map((t) => t.id)), tracks };
}

export function mapArtist(a: SpotifyArtist): Artist {
  return { kind: "artist", id: a.id, provider: "spotify", name: a.name, genres: a.genres.slice(0, 3), artwork: toArtwork(a.images) };
}

export function mapPlaylist(p: SpotifySimplifiedPlaylist, trackIds: string[] = [], userId?: string): Playlist {
  return {
    kind: "playlist",
    id: p.id,
    provider: "spotify",
    name: p.name,
    description: stripHtml(p.description ?? ""),
    ownerName: p.owner.display_name ?? p.owner.id,
    trackIds,
    trackCount: p.items?.total ?? p.tracks?.total ?? trackIds.length,
    artwork: toArtwork(p.images),
    canEdit: !!userId && (p.owner.id === userId || !!p.collaborative),
  };
}

/** Las descripciones de playlists pueden traer HTML y entidades. */
export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .trim();
}

/* ───────────── Parseo tolerante de listas heterogéneas ───────────── */

/** Canciones de una lista de `unknown` (descarta episodios, nulos y locales sin romper la lista). */
export function tracksFrom(xs: unknown[]): Track[] {
  const out: Track[] = [];
  for (const x of xs) {
    const r = trackSchema.safeParse(x);
    if (r.success && (r.data.type ?? "track") === "track") {
      const t = mapTrack(r.data);
      if (t) out.push(t);
    }
  }
  return out;
}

export function albumsFrom(xs: unknown[]): Album[] {
  return xs.flatMap((x) => {
    const r = simplifiedAlbumSchema.safeParse(x);
    return r.success ? [mapSimplifiedAlbum(r.data)] : [];
  });
}

export function fullAlbumsFrom(xs: unknown[]): Album[] {
  return xs.flatMap((x) => {
    const r = albumSchema.safeParse(x);
    return r.success ? [mapAlbumDetail(r.data)] : [];
  }).map(({ tracks: _t, ...album }) => album);
}

export function artistsFrom(xs: unknown[]): Artist[] {
  return xs.flatMap((x) => {
    const r = artistSchema.safeParse(x);
    return r.success ? [mapArtist(r.data)] : [];
  });
}

export function playlistsFrom(xs: unknown[], userId?: string): Playlist[] {
  return xs.flatMap((x) => {
    if (x == null) return []; // Spotify devuelve null para playlists no disponibles
    const r = simplifiedPlaylistSchema.safeParse(x);
    return r.success ? [mapPlaylist(r.data, [], userId)] : [];
  });
}
