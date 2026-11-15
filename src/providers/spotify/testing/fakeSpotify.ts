/**
 * Servidor falso de la Spotify Web API para pruebas: reproduce la forma de las
 * respuestas de 2026 (playlists con `items/item`, biblioteca con URIs, null en
 * resultados de playlists, 204 sin reproducción…) y mantiene estado.
 */
const img = (w: number) => ({ url: `https://i.scdn.co/image/${w}`, width: w, height: w });
const artist = (id: string, name: string) => ({ id, name, uri: `spotify:artist:${id}`, type: "artist" });
const album = (id: string, name: string, n: number) => ({
  id, name, album_type: "album", release_date: "2024-05-01", total_tracks: n, images: [img(640), img(300), img(64)],
  artists: [artist("ar1", "Artista Uno")], uri: `spotify:album:${id}`,
});
const albumTrack = (albumId: string, i: number) => ({
  id: `${albumId}-t${i}`, name: i === 1 ? "Luz Primera" : `Pista ${i}`, duration_ms: 180_000 + i * 1000, explicit: false,
  artists: [artist("ar1", "Artista Uno")], uri: `spotify:track:${albumId}-t${i}`, type: "track", is_local: false,
});
const fullTrack = (albumId: string, i: number) => ({ ...albumTrack(albumId, i), album: album(albumId, `Álbum ${albumId}`, 3) });

export function createFakeSpotify() {
  const albums: Record<string, { meta: ReturnType<typeof album>; tracks: ReturnType<typeof albumTrack>[] }> = {
    al1: { meta: album("al1", "Álbum al1", 3), tracks: [1, 2, 3].map((i) => albumTrack("al1", i)) },
    al2: { meta: album("al2", "Álbum al2", 2), tracks: [1, 2].map((i) => albumTrack("al2", i)) },
  };
  const library = new Set<string>(["spotify:track:al1-t2"]);
  const devices = [{ id: "dev1", name: "Móvil", type: "Smartphone", is_active: false, is_restricted: false, volume_percent: 60 }];
  let player: null | { is_playing: boolean; progress_ms: number; item: unknown; device: typeof devices[number]; shuffle_state: boolean; repeat_state: string; queue: unknown[] } = null;
  const calls: { method: string; path: string; query: URLSearchParams; body: unknown }[] = [];
  /** Respuestas forzadas por ruta para simular errores. */
  const overrides = new Map<string, () => Response>();

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const empty = (status = 204) => new Response(null, { status });
  const paging = <T>(items: T[], offset: number, limit: number) => ({
    items: items.slice(offset, offset + limit), total: items.length, offset, limit,
    next: offset + limit < items.length ? `https://api.spotify.com/v1/x?offset=${offset + limit}` : null,
  });

  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/v1\//, "");
    const method = init?.method ?? "GET";
    const q = url.searchParams;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, query: q, body });
    const forced = overrides.get(`${method} ${path}`);
    if (forced) return forced();
    const offset = Number(q.get("offset") ?? 0), limit = Number(q.get("limit") ?? 20);

    if (method === "GET" && path === "me") return json({ id: "u1", display_name: "Usuaria", images: [] });
    if (method === "GET" && path === "search") {
      const term = (q.get("q") ?? "").toLowerCase();
      const hits = Object.values(albums).flatMap((a) => a.tracks.map((t) => ({ ...t, album: a.meta }))).filter((t) => t.name.toLowerCase().includes(term));
      return json({
        tracks: paging(hits, offset, limit),
        albums: paging(Object.values(albums).map((a) => a.meta).filter((a) => a.name.toLowerCase().includes(term)), 0, limit),
        artists: paging([], 0, limit),
        playlists: paging([null, { id: "pl1", name: "Luz de domingo", description: "<b>Hola</b> &amp; adiós", images: [], owner: { id: "u1", display_name: "Usuaria" }, uri: "spotify:playlist:pl1", items: { total: 2 } }], 0, limit),
      });
    }
    const albumMatch = path.match(/^albums\/([^/]+)$/);
    if (method === "GET" && albumMatch) {
      const a = albums[albumMatch[1]];
      if (!a) return json({ error: { status: 404, message: "Non existing id" } }, 404);
      return json({ ...a.meta, tracks: paging(a.tracks, 0, 50) });
    }
    const plItems = path.match(/^playlists\/([^/]+)\/items$/);
    if (method === "GET" && plItems) {
      if (plItems[1] !== "pl1") return json({ error: { status: 403, message: "Forbidden" } }, 403);
      return json(paging([{ item: fullTrack("al1", 1) }, { item: { type: "episode", id: "ep1" } }, { item: null }, { item: fullTrack("al2", 2) }], offset, limit));
    }
    const plMatch = path.match(/^playlists\/([^/]+)$/);
    if (method === "GET" && plMatch) {
      const base = { name: "Lista", description: null, images: [img(300)], uri: `spotify:playlist:${plMatch[1]}`, owner: { id: "u1", display_name: "Usuaria" } };
      if (plMatch[1] === "pl1") {
        return json({ ...base, id: "pl1", items: paging([{ item: fullTrack("al1", 1) }, { item: { type: "episode", id: "ep1" } }, { item: null }, { item: fullTrack("al2", 2) }], 0, 100) });
      }
      if (plMatch[1] === "ajena") return json({ ...base, id: "ajena", owner: { id: "otra", display_name: "Otra" } });
      return json({ error: { status: 404, message: "Not found" } }, 404);
    }
    const arMatch = path.match(/^artists\/([^/]+)$/);
    if (method === "GET" && arMatch) return arMatch[1] === "ar1" ? json({ ...artist("ar1", "Artista Uno"), genres: ["indie"], images: [img(320)] }) : json({ error: { status: 404 } }, 404);
    if (method === "GET" && path === "artists/ar1/albums") return json(paging(Object.values(albums).map((a) => a.meta), offset, limit));

    if (method === "GET" && path === "me/tracks") {
      const saved = [...library].map((u) => u.split(":")[2]).flatMap((id) => { const [al] = id.split("-"); return albums[al] ? [{ added_at: "2026-01-01", track: fullTrack(al, Number(id.split("-t")[1])) }] : []; });
      return json(paging(saved, offset, limit));
    }
    if (method === "GET" && path === "me/albums") return json(paging(Object.values(albums).map((a) => ({ added_at: "2026-01-01", album: { ...a.meta, tracks: paging(a.tracks, 0, 50) } })), offset, limit));
    if (method === "GET" && path === "me/following") return json({ artists: { items: [{ ...artist("ar1", "Artista Uno"), genres: [], images: [] }], next: null, total: 1, cursors: { after: null } } });
    if (method === "GET" && path === "me/playlists") return json(paging([{ id: "pl1", name: "Lista", description: "", images: [], owner: { id: "u1", display_name: "Usuaria" }, uri: "spotify:playlist:pl1", items: { total: 2 } }], offset, limit));
    if (path === "me/library") {
      const uris = (q.get("uris") ?? "").split(",").filter(Boolean);
      if (uris.length > 40) return json({ error: { status: 400, message: "Too many ids" } }, 400);
      if (method === "PUT") uris.forEach((u) => library.add(u));
      if (method === "DELETE") uris.forEach((u) => library.delete(u));
      return empty(200);
    }
    if (method === "GET" && path === "me/library/contains") {
      const uris = (q.get("uris") ?? "").split(",").filter(Boolean);
      if (uris.length > 40) return json({ error: { status: 400, message: "Too many ids" } }, 400);
      return json(uris.map((u) => library.has(u)));
    }
    if (method === "GET" && path === "me/player/recently-played") return json({ items: [{ track: fullTrack("al1", 1), played_at: "x" }, { track: fullTrack("al1", 1), played_at: "y" }, { track: fullTrack("al2", 1), played_at: "z" }] });
    if (method === "GET" && path === "me/top/artists") return json(paging([{ ...artist("ar1", "Artista Uno"), genres: [], images: [] }], 0, limit));

    if (method === "GET" && path === "me/player/devices") return json({ devices });
    if (method === "GET" && path === "me/player") {
      if (!player) return empty(204);
      return json({ device: player.device, shuffle_state: player.shuffle_state, repeat_state: player.repeat_state, progress_ms: player.progress_ms, is_playing: player.is_playing, item: player.item, currently_playing_type: "track" });
    }
    if (method === "PUT" && path === "me/player/play") {
      const devId = q.get("device_id");
      const device = devices.find((d) => d.id === devId) ?? (player?.device);
      if (!device) return json({ error: { status: 404, message: "Player command failed: No active device found", reason: "NO_ACTIVE_DEVICE" } }, 404);
      device.is_active = true;
      if (body?.context_uri?.startsWith("spotify:album:")) {
        const a = albums[body.context_uri.split(":")[2]];
        const start = body.offset?.uri ? a.tracks.findIndex((t) => t.uri === body.offset.uri) : 0;
        const list = a.tracks.map((_, i) => fullTrack(a.meta.id, i + 1));
        player = { is_playing: true, progress_ms: 0, item: list[start], device, shuffle_state: false, repeat_state: "off", queue: list.slice(start + 1) };
      } else if (body?.uris) {
        const list = (body.uris as string[]).map((u) => { const id = u.split(":")[2]; const [al, n] = id.split("-t"); return fullTrack(al, Number(n)); });
        const start = body.offset?.position ?? 0;
        player = { is_playing: true, progress_ms: 0, item: list[start], device, shuffle_state: false, repeat_state: "off", queue: list.slice(start + 1) };
      } else if (player) {
        player.is_playing = true;
      }
      return empty(204);
    }
    if (method === "PUT" && path === "me/player/pause") { if (player) player.is_playing = false; return empty(204); }
    if (method === "PUT" && path === "me/player/seek") { if (player) player.progress_ms = Number(q.get("position_ms")); return empty(204); }
    if (method === "PUT" && path === "me/player/shuffle") { if (player) player.shuffle_state = q.get("state") === "true"; return empty(204); }
    if (method === "PUT" && path === "me/player/repeat") { if (player) player.repeat_state = q.get("state") ?? "off"; return empty(204); }
    if (method === "PUT" && path === "me/player/volume") { if (player) player.device.volume_percent = Number(q.get("volume_percent")); return empty(204); }
    if (method === "POST" && path === "me/player/next") {
      if (player) { const [n, ...rest] = player.queue; if (n) { player.item = n; player.queue = rest; player.progress_ms = 0; } }
      return empty(204);
    }
    if (method === "POST" && path === "me/player/queue") {
      if (!player) return json({ error: { status: 404, reason: "NO_ACTIVE_DEVICE" } }, 404);
      const id = q.get("uri")!.split(":")[2]; const [al, n] = id.split("-t");
      player.queue.unshift(fullTrack(al, Number(n)));
      return empty(204);
    }
    if (method === "GET" && path === "me/player/queue") return json({ currently_playing: player?.item ?? null, queue: player?.queue ?? [] });
    if (method === "PUT" && path === "me/player") {
      const d = devices.find((x) => x.id === body.device_ids[0]);
      if (!d) return json({ error: { status: 404 } }, 404);
      devices.forEach((x) => (x.is_active = x === d));
      if (player) player.device = d;
      return empty(204);
    }
    return json({ error: { status: 404, message: `ruta no simulada: ${method} ${path}` } }, 404);
  };

  return {
    fetch: fetch as unknown as typeof globalThis.fetch,
    calls,
    overrides,
    library,
    get player() { return player; },
    setPlaying(p: typeof player) { player = p; },
  };
}
