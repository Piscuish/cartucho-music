/**
 * Suite de contrato reutilizable: cualquier `MusicProvider` (vista previa,
 * Spotify con HTTP simulado, Apple Music…) debe superarla.
 *
 * Comprueba sobre todo que el proveedor cumple lo que declara en sus
 * capacidades y que nunca devuelve contenido de otro servicio.
 */
import { describe, expect, it } from "vitest";
import type { MusicProvider } from "../types";
import { UnsupportedOperationError } from "../errors";

export interface ContractFixture {
  /** Término que devuelve al menos una canción. */
  searchTerm: string;
  albumId: string;
  playlistId: string;
  artistId: string;
}

export function runProviderContract(name: string, make: () => MusicProvider, fx: ContractFixture) {
  describe(`Contrato MusicProvider · ${name}`, () => {
    const ownsAll = (p: MusicProvider, xs: { provider: string }[]) => xs.every((x) => x.provider === p.id);

    it("declara identidad y capacidades", () => {
      const p = make();
      expect(p.id).toBeTruthy();
      expect(p.displayName).toBeTruthy();
      expect(p.capabilities).toBeDefined();
    });

    it("busca solo en su propio catálogo", async () => {
      const p = make();
      if (!p.capabilities.catalog.search) {
        await expect(p.catalog.search(fx.searchTerm)).rejects.toBeInstanceOf(UnsupportedOperationError);
        return;
      }
      const r = await p.catalog.search(fx.searchTerm);
      expect(r.provider).toBe(p.id);
      expect(r.tracks.length + r.albums.length + r.artists.length + r.playlists.length).toBeGreaterThan(0);
      expect(ownsAll(p, [...r.tracks, ...r.albums, ...r.artists, ...r.playlists])).toBe(true);
    });

    it("búsqueda vacía no devuelve nada", async () => {
      const p = make();
      if (!p.capabilities.catalog.search) return;
      const r = await p.catalog.search("   ");
      expect(r.tracks.length + r.albums.length + r.artists.length + r.playlists.length).toBe(0);
    });

    it("obtiene álbum y playlist con sus canciones", async () => {
      const p = make();
      const album = await p.catalog.getAlbum(fx.albumId);
      expect(album.id).toBe(fx.albumId);
      expect(album.tracks.length).toBeGreaterThan(0);
      expect(ownsAll(p, album.tracks)).toBe(true);
      const pl = await p.catalog.getPlaylist(fx.playlistId);
      expect(ownsAll(p, pl.tracks)).toBe(true);
    });

    it("pagina las canciones de una playlist sin repetir", async () => {
      const p = make();
      const first = await p.catalog.getPlaylistTracks(fx.playlistId, { limit: 1 });
      expect(first.items.length).toBeLessThanOrEqual(1);
      expect(ownsAll(p, first.items)).toBe(true);
      if (first.nextCursor) {
        const second = await p.catalog.getPlaylistTracks(fx.playlistId, { limit: 1, cursor: first.nextCursor });
        expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
      }
    });

    it("la búsqueda admite desplazamiento e indica si hay más", async () => {
      const p = make();
      if (!p.capabilities.catalog.search) return;
      const a = await p.catalog.search(fx.searchTerm, { types: ["track"], limit: 1 });
      expect(a.tracks.length).toBeLessThanOrEqual(1);
      if (a.hasMore?.track) {
        const b = await p.catalog.search(fx.searchTerm, { types: ["track"], limit: 1, offset: 1 });
        expect(b.tracks[0]?.id).not.toBe(a.tracks[0]?.id);
      }
    });

    it("obtiene artista y discografía", async () => {
      const p = make();
      const a = await p.catalog.getArtist(fx.artistId);
      expect(a.provider).toBe(p.id);
      const page = await p.catalog.getArtistAlbums(fx.artistId);
      expect(ownsAll(p, page.items)).toBe(true);
    });

    it("respeta capacidades opcionales del catálogo", async () => {
      const p = make();
      const top = p.catalog.getArtistTopTracks(fx.artistId);
      if (p.capabilities.catalog.artistTopTracks) await expect(top).resolves.toBeInstanceOf(Array);
      else await expect(top).rejects.toBeInstanceOf(UnsupportedOperationError);

      const nr = p.catalog.getNewReleases();
      if (p.capabilities.catalog.newReleases) await expect(nr).resolves.toHaveProperty("items");
      else await expect(nr).rejects.toBeInstanceOf(UnsupportedOperationError);
    });

    it("respeta capacidades de personalización", async () => {
      const p = make();
      const recs = p.personalization.getRecommendations(5);
      if (p.capabilities.personalization.recommendations) await expect(recs).resolves.toBeInstanceOf(Array);
      else await expect(recs).rejects.toBeInstanceOf(UnsupportedOperationError);
    });

    it("pagina la biblioteca con cursor", async () => {
      const p = make();
      const first = await p.library.getSavedAlbums({ limit: 1 });
      expect(first.items.length).toBeLessThanOrEqual(1);
      if (first.nextCursor) {
        const second = await p.library.getSavedAlbums({ limit: 1, cursor: first.nextCursor });
        expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
      }
    });

    it("guarda y quita canciones de la biblioteca", async () => {
      const p = make();
      if (!p.capabilities.library.write) return;
      const album = await p.catalog.getAlbum(fx.albumId);
      const id = album.tracks[0].id;
      await p.library.removeTracks([id]);
      expect(await p.library.containsTracks([id])).toEqual([false]);
      await p.library.saveTracks([id]);
      expect(await p.library.containsTracks([id])).toEqual([true]);
      const saved = await p.library.getSavedTracks();
      expect(saved.items.some((t) => t.id === id)).toBe(true);
    });

    it("reproduce un álbum y expone la cola de su mismo proveedor", async () => {
      const p = make();
      const album = await p.catalog.getAlbum(fx.albumId);
      await p.playback.play({ kind: "album", id: fx.albumId });
      const s = p.playback.getState();
      expect(s?.provider).toBe(p.id);
      expect(s?.track?.id).toBe(album.tracks[0].id);
      if (p.capabilities.queue.read) {
        const q = await p.playback.getQueue();
        expect(ownsAll(p, q.upNext)).toBe(true);
      }
      p.dispose();
    });

    it("respeta las capacidades de la cola", async () => {
      const p = make();
      await p.playback.play({ kind: "album", id: fx.albumId });
      const reorder = p.playback.moveInQueue(0, 1);
      if (p.capabilities.queue.reorder) await expect(reorder).resolves.toBeUndefined();
      else await expect(reorder).rejects.toBeInstanceOf(UnsupportedOperationError);
      const remove = p.playback.removeFromQueue(0);
      if (p.capabilities.queue.remove) await expect(remove).resolves.toBeUndefined();
      else await expect(remove).rejects.toBeInstanceOf(UnsupportedOperationError);
      p.dispose();
    });
  });
}
