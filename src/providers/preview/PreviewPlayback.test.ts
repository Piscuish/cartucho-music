import { beforeEach, describe, expect, it } from "vitest";
import { PreviewPlayback } from "./PreviewPlayback";
import { spotifyCapabilities } from "../spotify/capabilities";
import { appleMusicCapabilities } from "../apple-music/capabilities";
import { UnsupportedOperationError } from "../errors";
import type { Track } from "@/types/music";

const track = (id: string, secs = 100, provider: Track["provider"] = "spotify"): Track => ({
  kind: "track", id, provider, name: id, artistIds: ["a"], artistNames: ["A"], albumId: "al", albumName: "Al",
  durationMs: secs * 1000, artwork: { palette: ["#000", "#fff"] },
});

/** Reloj y temporizadores manuales para avanzar el tiempo en los tests. */
function clock() {
  let now = 0;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let seq = 0;
  return {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => { const id = ++seq; timers.push({ at: now + ms, fn, id }); return id; },
    clearTimer: (id: unknown) => { timers = timers.filter((t) => t.id !== id); },
    async advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((t) => t !== due);
        now = due.at;
        due.fn();
        await Promise.resolve();
      }
      now = target;
    },
  };
}

const tracks = [track("t1"), track("t2"), track("t3")];

describe("PreviewPlayback", () => {
  let c: ReturnType<typeof clock>;
  const make = (caps = spotifyCapabilities, list = tracks) =>
    new PreviewPlayback({
      provider: "spotify",
      capabilities: caps,
      resolve: async (ctx) => ctx.kind === "tracks"
        ? { tracks: list.filter((t) => ctx.trackIds.includes(t.id)), startIndex: ctx.startIndex ?? 0 }
        : { tracks: list, startIndex: 0 },
      now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer,
    });

  beforeEach(() => { c = clock(); });

  it("reproduce desde el índice indicado", async () => {
    const pb = make();
    await pb.play({ kind: "tracks", trackIds: ["t1", "t2", "t3"], startIndex: 1 });
    expect(pb.getState()).toMatchObject({ isPlaying: true, mode: "preview", positionMs: 0 });
    expect(pb.getState()?.track?.id).toBe("t2");
  });

  it("avanza solo al terminar la pista y se detiene al final", async () => {
    const pb = make();
    await pb.play({ kind: "album", id: "x" });
    await c.advance(100_000);
    expect(pb.getState()?.track?.id).toBe("t2");
    await c.advance(200_000);
    expect(pb.getState()?.track?.id).toBe("t3");
    expect(pb.getState()?.isPlaying).toBe(false);
  });

  it("repetir todo vuelve al principio; repetir una se queda", async () => {
    const pb = make();
    await pb.play({ kind: "album", id: "x" });
    await pb.setRepeat("all");
    await c.advance(300_000);
    expect(pb.getState()?.track?.id).toBe("t1");
    await pb.setRepeat("one");
    await c.advance(100_000);
    expect(pb.getState()?.track?.id).toBe("t1");
  });

  it("la pausa congela la posición", async () => {
    const pb = make();
    await pb.play({ kind: "album", id: "x" });
    await c.advance(10_000);
    await pb.pause();
    await c.advance(50_000);
    expect(pb.getState()?.positionMs).toBe(10_000);
    expect(pb.getState()?.track?.id).toBe("t1");
  });

  it("anterior reinicia la pista si han pasado más de 3 s", async () => {
    const pb = make();
    await pb.play({ kind: "tracks", trackIds: ["t1", "t2"], startIndex: 1 });
    await c.advance(5_000);
    await pb.previous();
    expect(pb.getState()?.track?.id).toBe("t2");
    expect(pb.getState()?.positionMs).toBe(0);
    await pb.previous();
    expect(pb.getState()?.track?.id).toBe("t1");
  });

  it("limita seek y volumen", async () => {
    const pb = make();
    await pb.play({ kind: "album", id: "x" });
    await pb.seek(999_999);
    expect(pb.getState()?.positionMs).toBe(100_000);
    await pb.setVolume(4);
    expect(pb.getState()?.volume).toBe(1);
  });

  it("rechaza mezclar servicios en una cola", async () => {
    const pb = make(spotifyCapabilities, [track("t1"), track("x", 10, "apple-music")]);
    await expect(pb.play({ kind: "album", id: "x" })).rejects.toThrow(/mezclar/);
  });

  it("respeta una cola de solo lectura si el servicio la declara así", async () => {
    const readOnly = { ...spotifyCapabilities, queue: { read: true, add: true, remove: false, reorder: false } };
    const pb = make(readOnly);
    await pb.play({ kind: "tracks", trackIds: ["t1"] });
    await pb.addToQueue("t3");
    expect((await pb.getQueue()).upNext.map((t) => t.id)).toEqual(["t3"]);
    await expect(pb.moveInQueue(0, 0)).rejects.toBeInstanceOf(UnsupportedOperationError);
    await expect(pb.removeFromQueue(0)).rejects.toBeInstanceOf(UnsupportedOperationError);
  });

  it("Apple Music: la cola se puede reordenar y quitar", async () => {
    const pb = make(appleMusicCapabilities);
    await pb.play({ kind: "album", id: "x" });
    await pb.moveInQueue(1, 0);
    expect((await pb.getQueue()).upNext.map((t) => t.id)).toEqual(["t3", "t2"]);
    await pb.removeFromQueue(0);
    expect((await pb.getQueue()).upNext.map((t) => t.id)).toEqual(["t2"]);
  });

  it("notifica a los suscriptores y deja de hacerlo al desuscribirse", async () => {
    const pb = make();
    const seen: string[] = [];
    const off = pb.subscribe((s) => seen.push(s?.track?.id ?? "-"));
    await pb.play({ kind: "album", id: "x" });
    off();
    await pb.next();
    expect(seen).toEqual(["t1"]);
  });
});
