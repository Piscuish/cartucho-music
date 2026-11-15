import { describe, expect, it } from "vitest";
import { createMemoryCache, createMemoryHistory } from "./stores";

describe("caché en memoria", () => {
  it("caduca por TTL y borra por prefijo", async () => {
    let now = 0;
    const c = createMemoryCache(() => now);
    await c.put("spotify:a", { x: 1 }, 1000);
    await c.put("apple-music:a", 2, 1000);
    expect(await c.get("spotify:a")).toEqual({ x: 1 });
    now = 1000;
    expect(await c.get("spotify:a")).toBeNull();
    now = 0;
    await c.put("spotify:b", 1, 1000);
    await c.clear("spotify:");
    expect(await c.get("spotify:b")).toBeNull();
    expect(await c.get("apple-music:a")).toBe(2);
  });
});

describe("historial en memoria", () => {
  it("devuelve lo más reciente primero y respeta el tope", async () => {
    const h = createMemoryHistory(2);
    await h.add("spotify", "1", {});
    await h.add("spotify", "2", {});
    await h.add("spotify", "3", {});
    expect((await h.list(10)).map((e) => e.trackId)).toEqual(["3", "2"]);
  });
});
