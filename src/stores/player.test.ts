import { beforeEach, describe, expect, it } from "vitest";
import { usePlayer } from "./player";
import { registry } from "@/providers/registry";
import { PreviewProvider } from "@/providers/preview/PreviewProvider";
import { createBrowserKv, history } from "@/database/stores";

const make = (id: "spotify" | "apple-music") =>
  new PreviewProvider(id, { kv: createBrowserKv(`p.${Math.random()}.`), history, setTimer: () => 0, clearTimer: () => {} });

describe("store del reproductor", () => {
  beforeEach(async () => {
    registry.register(make("spotify"));
    registry.register(make("apple-music"));
    usePlayer.setState({ toast: null });
    await history.clear();
  });

  it("refleja el estado del proveedor al reproducir", async () => {
    await usePlayer.getState().play("spotify", { kind: "album", id: "al-orbita" });
    const s = usePlayer.getState();
    expect(s.activeProvider).toBe("spotify");
    expect(s.state).toMatchObject({ provider: "spotify", isPlaying: true, mode: "preview" });
    expect(s.state?.track?.id).toBe("al-orbita-t1");
  });

  it("al cambiar de servicio pausa el anterior", async () => {
    await usePlayer.getState().play("spotify", { kind: "album", id: "al-orbita" });
    const spotify = registry.get("spotify");
    await usePlayer.getState().play("apple-music", { kind: "album", id: "al-velas" });
    expect(spotify.playback.getState()?.isPlaying).toBe(false);
    expect(usePlayer.getState().state?.provider).toBe("apple-music");
  });

  it("no mezcla servicios en la cola", async () => {
    await usePlayer.getState().play("apple-music", { kind: "album", id: "al-velas" });
    const spotifyTrack = (await registry.get("spotify").catalog.getAlbum("al-orbita")).tracks[0];
    await usePlayer.getState().addToQueue(spotifyTrack);
    expect(usePlayer.getState().toast).toMatchObject({ kind: "error" });
    const q = await registry.get("apple-music").playback.getQueue();
    expect(q.upNext.some((t) => t.provider === "spotify")).toBe(false);
  });

  it("añade a la cola del mismo servicio y confirma", async () => {
    await usePlayer.getState().play("apple-music", { kind: "album", id: "al-sal" });
    const t = (await registry.get("apple-music").catalog.getAlbum("al-velas")).tracks[0];
    await usePlayer.getState().addToQueue(t);
    expect(usePlayer.getState().toast).toMatchObject({ kind: "info" });
    expect((await registry.get("apple-music").playback.getQueue()).upNext[0].id).toBe(t.id);
  });

  it("convierte los errores del servicio en un aviso legible", async () => {
    await usePlayer.getState().play("spotify", { kind: "album", id: "al-orbita" });
    // La cola de Spotify no se puede reordenar: la acción debe fallar con aviso, sin romper nada.
    await usePlayer.getState().play("spotify", { kind: "album", id: "no-existe" });
    expect(usePlayer.getState().toast?.kind).toBe("error");
    expect(usePlayer.getState().state?.track?.id).toBe("al-orbita-t1");
  });

  it("silenciar recuerda y restaura el volumen", async () => {
    await usePlayer.getState().play("spotify", { kind: "album", id: "al-orbita" });
    await usePlayer.getState().setVolume(0.4);
    await usePlayer.getState().toggleMute();
    expect(usePlayer.getState().state?.volume).toBe(0);
    await usePlayer.getState().toggleMute();
    expect(usePlayer.getState().state?.volume).toBe(0.4);
  });

  it("registra cada pista nueva en el historial local una sola vez", async () => {
    await usePlayer.getState().play("spotify", { kind: "album", id: "al-orbita" });
    await usePlayer.getState().toggle();
    await usePlayer.getState().toggle();
    await usePlayer.getState().next();
    await new Promise((r) => setTimeout(r, 0));
    const rows = await history.list(10);
    expect(rows.map((r) => r.trackId)).toEqual(["al-orbita-t2", "al-orbita-t1"]);
  });

  it("se vuelve a enganchar si el proveedor activo se sustituye", async () => {
    await usePlayer.getState().play("spotify", { kind: "album", id: "al-orbita" });
    const replacement = make("spotify");
    registry.register(replacement);
    await replacement.playback.play({ kind: "album", id: "al-8bit" });
    expect(usePlayer.getState().state?.track?.id).toBe("al-8bit-t1");
  });

  it("se desengancha si el proveedor activo se oculta", async () => {
    await usePlayer.getState().play("apple-music", { kind: "album", id: "al-velas" });
    registry.unregister("apple-music");
    expect(usePlayer.getState()).toMatchObject({ activeProvider: null, state: null });
  });
});
