import { describe, expect, it } from "vitest";
import { PreviewProvider } from "./PreviewProvider";
import { runProviderContract } from "../testing/contract";
import { createBrowserKv, createMemoryHistory } from "@/database/stores";
import { spotifyCapabilities } from "../spotify/capabilities";
import { appleMusicCapabilities } from "../apple-music/capabilities";

// En Node no hay localStorage: el respaldo usa memoria.
const make = (id: "spotify" | "apple-music") => () =>
  new PreviewProvider(id, { kv: createBrowserKv(`test.${Math.random()}.`), history: createMemoryHistory(), setTimer: () => 0, clearTimer: () => {} });

runProviderContract("Vista previa (Spotify)", make("spotify"), {
  searchTerm: "neón", albumId: "al-orbita", playlistId: "pl-carretera", artistId: "ar-satelites",
});

runProviderContract("Vista previa (Apple Music)", make("apple-music"), {
  searchTerm: "noche", albumId: "al-velas", playlistId: "pl-calma", artistId: "ar-nocturna",
});

describe("PreviewProvider", () => {
  it("usa exactamente las capacidades del servicio real", () => {
    expect(make("spotify")().capabilities).toBe(spotifyCapabilities);
    expect(make("apple-music")().capabilities).toBe(appleMusicCapabilities);
  });

  it("se identifica como vista previa y no permite conectar", async () => {
    const p = make("spotify")();
    expect(p.isPreview).toBe(true);
    expect(p.auth.getStatus().state).toBe("preview");
    await expect(p.auth.connect()).rejects.toThrow();
  });

  it("no encuentra contenido de otro servicio", async () => {
    const p = make("spotify")();
    await expect(p.catalog.getAlbum("al-velas")).rejects.toThrow(/no encontrado/);
  });

  it("emite estado en modo preview, sin audio", async () => {
    const p = make("apple-music")();
    await p.playback.play({ kind: "playlist", id: "pl-calma" });
    expect(p.playback.getState()?.mode).toBe("preview");
  });
});
