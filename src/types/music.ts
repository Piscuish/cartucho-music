/**
 * Modelo de dominio común. Toda entidad lleva `provider`: Cartucho Music nunca
 * mezcla entidades de distintos servicios en una colección reproducible.
 */
export type ProviderId = "spotify" | "apple-music";

/** Arte generado para la vista previa de diseño (sin imágenes con derechos). */
export interface GeneratedArt {
  from: string;
  to: string;
  shape: "orbit" | "stripes" | "grid" | "wave" | "sun";
}

export interface Artwork {
  /** URL real de la portada (servicios conectados). */
  url?: string;
  /** Arte generado (vista previa). */
  generated?: GeneratedArt;
  /** Colores dominantes (fondo dinámico). Si falta, se extraen de `url` en el cliente. */
  palette?: [string, string];
}

interface BaseEntity {
  id: string;
  provider: ProviderId;
  name: string;
  artwork: Artwork;
}

export interface Track extends BaseEntity {
  kind: "track";
  artistIds: string[];
  artistNames: string[];
  albumId: string;
  albumName: string;
  durationMs: number;
  explicit?: boolean;
}

export interface Album extends BaseEntity {
  kind: "album";
  artistIds: string[];
  artistNames: string[];
  year: number;
  trackIds: string[];
  albumType: "album" | "single" | "ep";
}

export interface Artist extends BaseEntity {
  kind: "artist";
  genres: string[];
}

export interface Playlist extends BaseEntity {
  kind: "playlist";
  description: string;
  ownerName: string;
  /** IDs conocidos (puede estar vacío si el servicio no permite listar el contenido). */
  trackIds: string[];
  trackCount: number;
}

export type MediaEntity = Track | Album | Artist | Playlist;
