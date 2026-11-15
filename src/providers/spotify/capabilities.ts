import type { ProviderCapabilities } from "../types";

/** Spotify Web API en Development Mode (nov. 2026). Ver docs/VIABILIDAD.md §1. */
export const spotifyCapabilities: ProviderCapabilities = {
  auth: { required: true, flow: "pkce" },
  catalog: { search: true, albums: true, artists: true, playlists: true, artistTopTracks: false, newReleases: false },
  library: { savedTracks: true, albums: true, artists: true, playlists: true, write: true, playlistWrite: true },
  personalization: { recentlyPlayed: true, topArtists: true, recommendations: false },
  playback: {
    inApp: "unverified",
    remoteControl: true,
    requiresPremium: true,
    seek: true,
    volume: true,
    shuffle: true,
    repeat: true,
  },
  // Quitar y reordenar: la Web API no lo permite; Cartucho gestiona la lista y la reenvía (playback.ts).
  queue: { read: true, add: true, remove: true, reorder: true },
  lyrics: { plain: false, synced: false },
};
