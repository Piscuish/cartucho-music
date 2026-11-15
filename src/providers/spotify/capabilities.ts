import type { ProviderCapabilities } from "../types";

/** Spotify Web API en Development Mode (nov. 2026). Ver docs/VIABILIDAD.md §1. */
export const spotifyCapabilities: ProviderCapabilities = {
  auth: { required: true, flow: "pkce" },
  catalog: { search: true, albums: true, artists: true, playlists: true, artistTopTracks: false, newReleases: false },
  library: { savedTracks: true, albums: true, artists: true, playlists: true, write: true },
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
  queue: { read: true, add: true, remove: false, reorder: false },
  lyrics: { plain: false, synced: false },
};
