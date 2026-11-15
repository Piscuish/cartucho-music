/**
 * Esquemas de validación de la Spotify Web API (estado de febrero de 2026).
 * Son tolerantes a lo que Spotify retiró en Development Mode (popularity, followers,
 * label, product…) y aceptan tanto `items/item` como el antiguo `tracks/track` en playlists.
 */
import { z } from "zod";

export const imageSchema = z.object({
  url: z.string(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});

const images = z.array(imageSchema).nullish().transform((v) => v ?? []);

export const simplifiedArtistSchema = z.object({
  id: z.string().nullish(),
  name: z.string(),
  uri: z.string().nullish(),
});

export const simplifiedAlbumSchema = z.object({
  id: z.string(),
  name: z.string(),
  album_type: z.string().nullish(),
  release_date: z.string().nullish(),
  total_tracks: z.number().nullish(),
  images,
  artists: z.array(simplifiedArtistSchema).default([]),
  uri: z.string(),
});

/** Pista dentro de un álbum (sin objeto `album`). */
export const simplifiedTrackSchema = z.object({
  id: z.string().nullish(),
  type: z.string().optional(),
  name: z.string(),
  duration_ms: z.number(),
  explicit: z.boolean().nullish(),
  artists: z.array(simplifiedArtistSchema).default([]),
  uri: z.string(),
  is_local: z.boolean().nullish(),
});

export const trackSchema = simplifiedTrackSchema.extend({
  album: simplifiedAlbumSchema,
});

export const artistSchema = z.object({
  id: z.string(),
  name: z.string(),
  genres: z.array(z.string()).nullish().transform((v) => v ?? []),
  images,
  uri: z.string(),
});

export const pagingSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    next: z.string().nullish(),
    total: z.number().nullish(),
    offset: z.number().nullish(),
    limit: z.number().nullish(),
  });

export const albumSchema = simplifiedAlbumSchema.extend({
  tracks: pagingSchema(simplifiedTrackSchema).nullish(),
});

const countSchema = z.object({ total: z.number().nullish() }).nullish();

export const simplifiedPlaylistSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  images,
  owner: z.object({ id: z.string(), display_name: z.string().nullish() }),
  uri: z.string(),
  collaborative: z.boolean().nullish(),
  items: countSchema,
  tracks: countSchema,
});

/** Entrada de playlist: el contenido puede ser canción, episodio o null (eliminado). */
const playlistEntrySchema = z.object({
  item: z.unknown().optional(),
  track: z.unknown().optional(),
});

export const playlistSchema = simplifiedPlaylistSchema.extend({
  items: pagingSchema(playlistEntrySchema).nullish(),
  tracks: pagingSchema(playlistEntrySchema).nullish(),
});

export const userSchema = z.object({
  id: z.string(),
  display_name: z.string().nullish(),
  images,
});

export const searchSchema = z.object({
  tracks: pagingSchema(z.unknown()).nullish(),
  albums: pagingSchema(z.unknown()).nullish(),
  artists: pagingSchema(z.unknown()).nullish(),
  playlists: pagingSchema(z.unknown()).nullish(),
});

export const savedTrackSchema = z.object({ added_at: z.string().nullish(), track: z.unknown() });
export const savedAlbumSchema = z.object({ added_at: z.string().nullish(), album: z.unknown() });

export const followedArtistsSchema = z.object({
  artists: z.object({
    items: z.array(z.unknown()),
    next: z.string().nullish(),
    total: z.number().nullish(),
    cursors: z.object({ after: z.string().nullish() }).nullish(),
  }),
});

export const recentlyPlayedSchema = z.object({
  items: z.array(z.object({ track: z.unknown(), played_at: z.string().nullish() })),
});

export const deviceSchema = z.object({
  id: z.string().nullish(),
  name: z.string(),
  type: z.string(),
  is_active: z.boolean(),
  is_restricted: z.boolean().nullish(),
  volume_percent: z.number().nullish(),
});

export const devicesSchema = z.object({ devices: z.array(deviceSchema) });

export const playbackStateSchema = z.object({
  device: deviceSchema.nullish(),
  shuffle_state: z.boolean().nullish(),
  repeat_state: z.enum(["off", "context", "track"]).nullish(),
  progress_ms: z.number().nullish(),
  is_playing: z.boolean(),
  item: z.unknown().nullish(),
  currently_playing_type: z.string().nullish(),
  context: z.object({ uri: z.string(), type: z.string().nullish() }).nullish(),
});

export const queueSchema = z.object({
  currently_playing: z.unknown().nullish(),
  queue: z.array(z.unknown()).default([]),
});

export type SpotifyTrack = z.infer<typeof trackSchema>;
export type SpotifySimplifiedTrack = z.infer<typeof simplifiedTrackSchema>;
export type SpotifySimplifiedAlbum = z.infer<typeof simplifiedAlbumSchema>;
export type SpotifyAlbum = z.infer<typeof albumSchema>;
export type SpotifyArtist = z.infer<typeof artistSchema>;
export type SpotifySimplifiedPlaylist = z.infer<typeof simplifiedPlaylistSchema>;
export type SpotifyPlaylist = z.infer<typeof playlistSchema>;
export type SpotifyDevice = z.infer<typeof deviceSchema>;
export type SpotifyPlaybackState = z.infer<typeof playbackStateSchema>;
export type SpotifyImage = z.infer<typeof imageSchema>;
