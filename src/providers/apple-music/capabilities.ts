import type { ProviderCapabilities } from "../types";

/** Apple Music API + MusicKit JS. Ver docs/VIABILIDAD.md §2. */
export const appleMusicCapabilities: ProviderCapabilities = {
  auth: { required: true, flow: "musickit" },
  catalog: { search: true, albums: true, artists: true, playlists: true, artistTopTracks: true, newReleases: true },
  library: { savedTracks: true, albums: true, artists: true, playlists: true, write: true, playlistWrite: true },
  personalization: { recentlyPlayed: true, topArtists: true, recommendations: true },
  playback: {
    inApp: "unverified",
    remoteControl: false,
    requiresPremium: true,
    seek: true,
    volume: true,
    shuffle: true,
    repeat: true,
  },
  queue: { read: true, add: true, remove: true, reorder: true },
  lyrics: { plain: false, synced: false },
};
