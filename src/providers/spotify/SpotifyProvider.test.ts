import { describe, expect, it, vi } from "vitest";
import { SpotifyProvider } from "./SpotifyProvider";
import { SpotifyAuth, type TokenSource } from "./auth";
import { createFakeSpotify } from "./testing/fakeSpotify";
import { runProviderContract } from "../testing/contract";
import { createMemoryCache } from "@/database/stores";
import { NoActiveDeviceError, NotFoundError, PremiumRequiredError, UnsupportedOperationError } from "../errors";
import { NativeCommandError } from "@/database/runtime";
import { POLL } from "./playback";

function tokens(overrides: Partial<TokenSource> = {}): TokenSource {
  let n = 0;
  return {
    authorize: async () => ({ accessToken: "a0", expiresAt: Date.now() + 3_600_000, scope: "" }),
    getToken: async (force) => ({ accessToken: force ? `r${++n}` : "a0", expiresAt: Date.now() + 3_600_000, scope: "" }),
    logout: async () => {},
    ...overrides,
  };
}

function make(fake = createFakeSpotify(), source = tokens()) {
  const auth = new SpotifyAuth(source, async () => "0123456789abcdef0123456789abcdef");
  const provider = new SpotifyProvider({
    auth,
    cacheStore: createMemoryCache(),
    http: { fetch: fake.fetch, sleep: async () => {}, random: () => 0 },
    playback: { setTimer: () => 0, clearTimer: () => {}, sleep: async () => {}, isHidden: () => false },
  });
  return { provider, fake, auth };
}

runProviderContract("Spotify (Web API simulada)", () => make().provider, {
  searchTerm: "luz", albumId: "al1", playlistId: "pl1", artistId: "ar1",
});

describe("SpotifyProvider", () => {
  it("mapea portadas a la imagen de ≤640 px y conserva nombres", async () => {
    const { provider } = make();
    const a = await provider.catalog.getAlbum("al1");
    expect(a.artwork.url).toBe("https://i.scdn.co/image/640");
    expect(a.artwork.palette).toBeUndefined(); // se extrae en el cliente
    expect(a.year).toBe(2024);
    expect(a.tracks.map((t) => t.name)[0]).toBe("Luz Primera");
  });

  it("búsqueda: ignora playlists null y limpia el HTML de descripciones", async () => {
    const { provider, fake } = make();
    const r = await provider.catalog.search("luz");
    expect(r.playlists).toHaveLength(1);
    expect(r.playlists[0].description).toBe("Hola & adiós");
    expect(r.playlists[0].trackCount).toBe(2);
    const call = fake.calls.find((c) => c.path === "search")!;
    expect(Number(call.query.get("limit"))).toBeLessThanOrEqual(10); // límite de Development Mode
  });

  it("búsqueda: una página llena indica que hay más aunque `next` sea null (Development Mode)", async () => {
    const fake = createFakeSpotify();
    const full = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`, name: `Tema ${i}`, duration_ms: 1000, artists: [], uri: `spotify:track:t${i}`, type: "track",
      album: { id: "a", name: "A", images: [], artists: [], uri: "spotify:album:a" },
    }));
    fake.overrides.set("GET search", () => new Response(JSON.stringify({ tracks: { items: full, next: null, total: 10 } }), { status: 200 }));
    const { provider } = make(fake);
    const r = await provider.catalog.search("tema", { types: ["track"], limit: 10 });
    expect(r.hasMore?.track).toBe(true);
    fake.overrides.set("GET search", () => new Response(JSON.stringify({ tracks: { items: full.slice(0, 4), next: null, total: 10 } }), { status: 200 }));
    const last = await provider.catalog.search("tema", { types: ["track"], limit: 10, offset: 10 });
    expect(last.hasMore?.track).toBe(false);
  });

  it("playlist propia: lee `items[].item` y descarta episodios y nulos", async () => {
    const { provider } = make();
    const p = await provider.catalog.getPlaylist("pl1");
    expect(p.tracks.map((t) => t.id)).toEqual(["al1-t1", "al2-t2"]);
    expect(p.tracksRestricted).toBeFalsy();
  });

  it("playlist ajena: marca el contenido como restringido en lugar de fallar", async () => {
    const { provider } = make();
    const p = await provider.catalog.getPlaylist("ajena");
    expect(p.tracks).toEqual([]);
    expect(p.tracksRestricted).toBe(true);
  });

  it("traduce 404 a NotFoundError", async () => {
    const { provider } = make();
    await expect(provider.catalog.getAlbum("nope")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("biblioteca: usa /me/library con URIs y trocea en grupos de 40", async () => {
    const { provider, fake } = make();
    const ids = Array.from({ length: 45 }, (_, i) => `x${i}`);
    await provider.library.saveTracks(ids);
    const puts = fake.calls.filter((c) => c.method === "PUT" && c.path === "me/library");
    expect(puts).toHaveLength(2);
    expect(puts[0].query.get("uris")!.split(",")[0]).toBe("spotify:track:x0");
    const flags = await provider.library.containsTracks(ids);
    expect(flags.every(Boolean)).toBe(true);
  });

  it("recientes sin duplicados", async () => {
    const { provider } = make();
    const r = await provider.personalization.getRecentlyPlayed(10);
    expect(r.map((t) => t.id)).toEqual(["al1-t1", "al2-t1"]);
  });

  it("cachea metadatos: el segundo acceso no va a la red", async () => {
    const { provider, fake } = make();
    await provider.catalog.getAlbum("al1");
    await provider.catalog.getAlbum("al1");
    expect(fake.calls.filter((c) => c.path === "albums/al1")).toHaveLength(1);
  });

  it("renueva el token una vez ante 401", async () => {
    const fake = createFakeSpotify();
    let first = true;
    fake.overrides.set("GET me", () => {
      if (first) { first = false; return new Response(JSON.stringify({ error: { status: 401 } }), { status: 401 }); }
      return new Response(JSON.stringify({ id: "u1", display_name: "U", images: [] }), { status: 200 });
    });
    const getToken = vi.fn(tokens().getToken);
    const { provider } = make(fake, tokens({ getToken }));
    await expect(provider.api.me()).resolves.toMatchObject({ displayName: "U" });
    expect(getToken).toHaveBeenCalledWith(true);
  });

  it("si la renovación falla por sesión revocada, marca el error", async () => {
    const fake = createFakeSpotify();
    fake.overrides.set("GET me", () => new Response("{}", { status: 401 }));
    const { provider, auth } = make(fake, tokens({
      getToken: async (force) => { if (force) throw new NativeCommandError("spotify_access_token", { kind: "auth", message: "revocada" }); return { accessToken: "a", expiresAt: Date.now() + 3_600_000, scope: "" }; },
    }));
    await expect(provider.api.me()).rejects.toThrow();
    expect(auth.getStatus().state).toBe("error");
  });
});

describe("SpotifyPlayback (Spotify Connect)", () => {
  it("sin dispositivo activo, envía la reproducción al primero disponible", async () => {
    const { provider, fake } = make();
    await provider.playback.play({ kind: "album", id: "al1", startTrackId: "al1-t2" });
    const play = fake.calls.find((c) => c.path === "me/player/play")!;
    expect(play.query.get("device_id")).toBe("dev1");
    expect(play.body).toMatchObject({ context_uri: "spotify:album:al1", offset: { uri: "spotify:track:al1-t2" } });
    const s = provider.playback.getState()!;
    expect(s).toMatchObject({ mode: "remote", isPlaying: true, device: { name: "Móvil" } });
    expect(s.track?.id).toBe("al1-t2");
  });

  it("lista de canciones: limita a 100 URIs alrededor de la elegida", async () => {
    const { provider, fake } = make();
    const ids = Array.from({ length: 150 }, (_, i) => `al1-t${(i % 3) + 1}`);
    await provider.playback.play({ kind: "tracks", trackIds: ids, startIndex: 120 });
    const body = fake.calls.find((c) => c.path === "me/player/play")!.body as { uris: string[]; offset: { position: number } };
    expect(body.uris).toHaveLength(100);
    expect(body.uris[body.offset.position]).toBe(`spotify:track:${ids[120]}`);
  });

  it("sin ningún dispositivo lanza NoActiveDeviceError", async () => {
    const fake = createFakeSpotify();
    fake.overrides.set("GET me/player/devices", () => new Response(JSON.stringify({ devices: [] }), { status: 200 }));
    const { provider } = make(fake);
    await expect(provider.playback.play({ kind: "album", id: "al1" })).rejects.toBeInstanceOf(NoActiveDeviceError);
  });

  it("403 PREMIUM_REQUIRED se traduce a PremiumRequiredError", async () => {
    const fake = createFakeSpotify();
    fake.overrides.set("PUT me/player/play", () => new Response(JSON.stringify({ error: { status: 403, message: "Premium required", reason: "PREMIUM_REQUIRED" } }), { status: 403 }));
    const { provider } = make(fake);
    await expect(provider.playback.play({ kind: "album", id: "al1" })).rejects.toBeInstanceOf(PremiumRequiredError);
  });

  it("pausa con actualización optimista y estado real después", async () => {
    const { provider, fake } = make();
    await provider.playback.play({ kind: "album", id: "al1" });
    await provider.playback.pause();
    expect(provider.playback.getState()?.isPlaying).toBe(false);
    await provider.playback.refresh();
    expect(fake.player?.is_playing).toBe(false);
    expect(provider.playback.getState()?.isPlaying).toBe(false);
  });

  it("repetir: traduce all/one a context/track", async () => {
    const { provider, fake } = make();
    await provider.playback.play({ kind: "album", id: "al1" });
    await provider.playback.setRepeat("one");
    expect(fake.calls.at(-1)?.query.get("state")).toBe("track");
    await provider.playback.refresh();
    expect(provider.playback.getState()?.repeat).toBe("one");
  });

  it("anterior reinicia la canción si han pasado más de 3 s", async () => {
    const { provider, fake } = make();
    await provider.playback.play({ kind: "album", id: "al1" });
    await provider.playback.seek(10_000);
    await provider.playback.previous();
    expect(fake.calls.at(-1)).toMatchObject({ path: "me/player/seek" });
    expect(fake.calls.at(-1)?.query.get("position_ms")).toBe("0");
  });

  it("la cola admite añadir pero no quitar ni reordenar", async () => {
    const { provider } = make();
    await provider.playback.play({ kind: "album", id: "al1" });
    await provider.playback.addToQueue("al2-t1");
    expect((await provider.playback.getQueue()).upNext[0].id).toBe("al2-t1");
    await expect(provider.playback.moveInQueue(0, 1)).rejects.toBeInstanceOf(UnsupportedOperationError);
  });

  it("dispositivos: lista y transfiere", async () => {
    const { provider, fake } = make();
    const ds = await provider.devices.list();
    expect(ds).toEqual([expect.objectContaining({ id: "dev1", name: "Móvil", isThisApp: false })]);
    await provider.devices.transfer("dev1");
    expect(fake.calls.at(-1)).toMatchObject({ method: "PUT", path: "me/player", body: { device_ids: ["dev1"], play: true } });
  });

  it("intervalo de consulta adaptativo", async () => {
    const { provider } = make();
    expect(provider.playback.nextPollDelay()).toBe(POLL.idle);
    await provider.playback.play({ kind: "album", id: "al1" });
    expect(provider.playback.nextPollDelay()).toBe(POLL.playing);
    await provider.playback.pause();
    expect(provider.playback.nextPollDelay()).toBe(POLL.paused);
  });
});
