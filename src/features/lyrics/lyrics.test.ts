import { describe, expect, it } from "vitest";
import { activeLineIndex, parseLrc } from "./lrc";
import { cleanTitle, fetchLyrics } from "./lrclib";
import type { Track } from "@/types/music";

const track = { id: "t1", provider: "spotify", name: "Luz de Neón - Remastered 2011", artistNames: ["Los Satélites"], artistIds: ["a"], albumName: "Órbita", albumId: "al", durationMs: 198_400 } as unknown as Track;
const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("LRC", () => {
  it("lee tiempos, varios tiempos por verso y descarta metadatos", () => {
    const lines = parseLrc("[ar:Alguien]\n[00:12.50]Hola\n[01:02.123][00:05]Coro\n[00:20.00]\nsin tiempo");
    expect(lines).toEqual([
      { timeMs: 5000, text: "Coro" },
      { timeMs: 12500, text: "Hola" },
      { timeMs: 20000, text: "" },
      { timeMs: 62123, text: "Coro" },
    ]);
  });

  it("encuentra el verso activo", () => {
    const lines = parseLrc("[00:01.00]a\n[00:05.00]b\n[00:09.00]c");
    expect(activeLineIndex(lines, 0)).toBe(-1);
    expect(activeLineIndex(lines, 1000)).toBe(0);
    expect(activeLineIndex(lines, 8999)).toBe(1);
    expect(activeLineIndex(lines, 60_000)).toBe(2);
  });
});

describe("LRCLIB", () => {
  it("limpia títulos de remasters y colaboraciones", () => {
    expect(cleanTitle("Luz de Neón - Remastered 2011")).toBe("Luz de Neón");
    expect(cleanTitle("Canción (feat. Otra)")).toBe("Canción");
    expect(cleanTitle("Live and Let Die")).toBe("Live and Let Die");
  });

  it("usa la coincidencia exacta con título limpio y duración en segundos", async () => {
    let url = "";
    const f = (async (u: URL) => { url = String(u); return res({ id: 1, syncedLyrics: "[00:01.00]Hola", plainLyrics: "Hola" }); }) as unknown as typeof fetch;
    const l = await fetchLyrics(track, undefined, f);
    expect(l.kind).toBe("synced");
    expect(url).toContain("track_name=Luz+de+Ne%C3%B3n&");
    expect(url).toContain("duration=198");
  });

  it("si no hay coincidencia exacta, busca y elige la de duración parecida con sincronía", async () => {
    const f = (async (u: URL) => String(u).includes("/get")
      ? res({ message: "not found" }, 404)
      : res([
          { id: 1, duration: 250, syncedLyrics: "[00:01.00]Otra" },
          { id: 2, duration: 199, plainLyrics: "Solo texto" },
          { id: 3, duration: 197, syncedLyrics: "[00:01.00]Buena" },
        ])) as unknown as typeof fetch;
    const l = await fetchLyrics(track, undefined, f);
    expect(l).toMatchObject({ kind: "synced", lines: [{ text: "Buena" }] });
  });

  it("instrumental y sin resultados", async () => {
    const instr = (async () => res({ id: 1, instrumental: true })) as unknown as typeof fetch;
    expect((await fetchLyrics(track, undefined, instr)).kind).toBe("instrumental");
    const none = (async (u: URL) => String(u).includes("/get") ? res({}, 404) : res([])) as unknown as typeof fetch;
    expect((await fetchLyrics(track, undefined, none)).kind).toBe("none");
  });

  it("propaga errores del servidor", async () => {
    const err = (async () => res({}, 500)) as unknown as typeof fetch;
    await expect(fetchLyrics(track, undefined, err)).rejects.toThrow(/500/);
  });
});
