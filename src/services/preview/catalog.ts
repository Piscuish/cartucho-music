/**
 * CATÁLOGO DE VISTA PREVIA (Fase 1).
 *
 * Todo lo de este archivo es inventado: artistas, álbumes y canciones ficticios
 * con arte generado. Solo sirve para evaluar el diseño. La UI lo marca siempre
 * como "datos de ejemplo" y se sustituye por los proveedores reales en la Fase 3.
 */
import type { Album, Artist, GeneratedArt, Playlist, ProviderId, Track } from "@/types/music";

type Shape = GeneratedArt["shape"];

const art = (from: string, to: string, shape: Shape) => ({
  generated: { from, to, shape },
  palette: [from, to] as [string, string],
});

interface AlbumSeed {
  id: string;
  name: string;
  artist: string;
  provider: ProviderId;
  year: number;
  type?: Album["albumType"];
  colors: [string, string];
  shape: Shape;
  tracks: [string, number][];
}

const artistSeeds: { id: string; name: string; provider: ProviderId; genres: string[]; colors: [string, string]; shape: Shape }[] = [
  { id: "ar-satelites", name: "Los Satélites del Sur", provider: "spotify", genres: ["Indie rock", "Psicodelia"], colors: ["#FF7A2F", "#7A1FFF"], shape: "orbit" },
  { id: "ar-marea", name: "Marea Baja", provider: "spotify", genres: ["Dream pop"], colors: ["#3BC9DB", "#1A2A6C"], shape: "wave" },
  { id: "ar-ines", name: "Inés Corral", provider: "apple-music", genres: ["Soul", "R&B"], colors: ["#F2C14E", "#B23A48"], shape: "sun" },
  { id: "ar-voltio", name: "Voltio", provider: "spotify", genres: ["Electrónica", "House"], colors: ["#C6F432", "#0E7C66"], shape: "grid" },
  { id: "ar-nocturna", name: "Orquesta Nocturna", provider: "apple-music", genres: ["Neoclásica", "Ambient"], colors: ["#A974FF", "#14102A"], shape: "stripes" },
  { id: "ar-cobre", name: "Cobre & Sal", provider: "apple-music", genres: ["Folk", "Cantautor"], colors: ["#E07A5F", "#3D405B"], shape: "sun" },
  { id: "ar-pixel", name: "Pixel Bandido", provider: "spotify", genres: ["Chiptune", "Synthwave"], colors: ["#FF3D7F", "#2B1055"], shape: "grid" },
];

const albumSeeds: AlbumSeed[] = [
  { id: "al-orbita", name: "Órbita Baja", artist: "ar-satelites", provider: "spotify", year: 2025, colors: ["#FF7A2F", "#7A1FFF"], shape: "orbit",
    tracks: [["Despegue", 214], ["Gravedad Cero", 247], ["Luz de Neón", 198], ["Radio Lunar", 263], ["Cometa", 231], ["Regreso", 289]] },
  { id: "al-mareas", name: "Mareas Lentas", artist: "ar-marea", provider: "spotify", year: 2024, colors: ["#3BC9DB", "#1A2A6C"], shape: "wave",
    tracks: [["Bruma", 242], ["Arena Tibia", 205], ["Faro", 276], ["Corriente", 219], ["Azul Profundo", 301]] },
  { id: "al-terciopelo", name: "Terciopelo", artist: "ar-ines", provider: "apple-music", year: 2025, colors: ["#F2C14E", "#B23A48"], shape: "sun",
    tracks: [["Miel", 223], ["Domingo Lento", 254], ["Te Debo Una", 197], ["Vino Tinto", 240], ["Sin Prisa", 266]] },
  { id: "al-circuito", name: "Circuito Abierto", artist: "ar-voltio", provider: "spotify", year: 2026, type: "ep", colors: ["#C6F432", "#0E7C66"], shape: "grid",
    tracks: [["Ohm", 312], ["Fase", 287], ["Tierra Común", 334], ["Pulso", 298]] },
  { id: "al-velas", name: "Velas para la Noche", artist: "ar-nocturna", provider: "apple-music", year: 2023, colors: ["#A974FF", "#14102A"], shape: "stripes",
    tracks: [["Preludio en Sombra", 182], ["Nocturno I", 256], ["Vigilia", 301], ["Nocturno II", 244], ["Amanecer Gris", 279]] },
  { id: "al-sal", name: "Sal de Mar", artist: "ar-cobre", provider: "apple-music", year: 2024, colors: ["#E07A5F", "#3D405B"], shape: "sun",
    tracks: [["Puerto Viejo", 201], ["Redes", 233], ["La Barca", 188], ["Viento Norte", 252]] },
  { id: "al-8bit", name: "Insert Coin", artist: "ar-pixel", provider: "spotify", year: 2026, colors: ["#FF3D7F", "#2B1055"], shape: "grid",
    tracks: [["Press Start", 176], ["Nivel 2", 203], ["Jefe Final", 245], ["Continuar?", 190], ["Créditos", 221]] },
  { id: "al-satelites-s", name: "Señal Débil", artist: "ar-satelites", provider: "spotify", year: 2026, type: "single", colors: ["#FFB347", "#FF3D7F"], shape: "wave",
    tracks: [["Señal Débil", 228]] },
];

export const artists: Artist[] = artistSeeds.map((a) => ({
  kind: "artist",
  id: a.id,
  provider: a.provider,
  name: a.name,
  genres: a.genres,
  artwork: art(a.colors[0], a.colors[1], a.shape),
}));

const artistById = new Map(artists.map((a) => [a.id, a]));

export const tracks: Track[] = [];
export const albums: Album[] = albumSeeds.map((s) => {
  const artist = artistById.get(s.artist)!;
  const trackIds = s.tracks.map(([name, secs], i) => {
    const t: Track = {
      kind: "track",
      id: `${s.id}-t${i + 1}`,
      provider: s.provider,
      name,
      artistIds: [artist.id],
      artistNames: [artist.name],
      albumId: s.id,
      albumName: s.name,
      durationMs: secs * 1000,
      artwork: art(s.colors[0], s.colors[1], s.shape),
    };
    tracks.push(t);
    return t.id;
  });
  return {
    kind: "album",
    id: s.id,
    provider: s.provider,
    name: s.name,
    artistIds: [artist.id],
    artistNames: [artist.name],
    year: s.year,
    albumType: s.type ?? "album",
    trackIds,
    artwork: art(s.colors[0], s.colors[1], s.shape),
  };
});

const pick = (ids: string[]) => ids.filter((id) => tracks.some((t) => t.id === id));

export const playlists: Playlist[] = [
  { kind: "playlist", id: "pl-carretera", provider: "spotify", name: "Carretera Nocturna", ownerName: "Tú", trackCount: 0,
    description: "Para conducir con las ventanillas bajadas.",
    trackIds: pick(["al-orbita-t3", "al-8bit-t1", "al-mareas-t3", "al-circuito-t4", "al-orbita-t4", "al-satelites-s-t1"]),
    artwork: art("#FF7A2F", "#2B1055", "wave") },
  { kind: "playlist", id: "pl-foco", provider: "spotify", name: "Modo Foco", ownerName: "Tú", trackCount: 0,
    description: "Electrónica tranquila para concentrarse.",
    trackIds: pick(["al-circuito-t1", "al-circuito-t3", "al-mareas-t1", "al-mareas-t5"]),
    artwork: art("#C6F432", "#1A2A6C", "grid") },
  { kind: "playlist", id: "pl-domingo", provider: "apple-music", name: "Domingo de Vinilo", ownerName: "Tú", trackCount: 0,
    description: "Soul, folk y café.",
    trackIds: pick(["al-terciopelo-t2", "al-sal-t1", "al-terciopelo-t1", "al-sal-t3", "al-terciopelo-t5"]),
    artwork: art("#F2C14E", "#3D405B", "sun") },
  { kind: "playlist", id: "pl-calma", provider: "apple-music", name: "Calma Absoluta", ownerName: "Tú", trackCount: 0,
    description: "Piano, cuerdas y silencio.",
    trackIds: pick(["al-velas-t1", "al-velas-t2", "al-velas-t4", "al-velas-t5"]),
    artwork: art("#A974FF", "#0F2027", "stripes") },
];

for (const p of playlists) p.trackCount = p.trackIds.length;

export const favoriteTrackIds = ["al-orbita-t3", "al-terciopelo-t1", "al-8bit-t3", "al-mareas-t3", "al-velas-t2", "al-circuito-t1", "al-sal-t2"];
export const recentTrackIds = ["al-orbita-t3", "al-terciopelo-t2", "al-circuito-t1", "al-velas-t3", "al-8bit-t1", "al-mareas-t1"];

export const catalog = {
  track: (id: string) => tracks.find((t) => t.id === id),
  album: (id: string) => albums.find((a) => a.id === id),
  artist: (id: string) => artistById.get(id),
  playlist: (id: string) => playlists.find((p) => p.id === id),
  tracksOf: (ids: string[]) => ids.map((id) => tracks.find((t) => t.id === id)!).filter(Boolean),
  albumsOfArtist: (artistId: string) => albums.filter((a) => a.artistIds.includes(artistId)),
};
