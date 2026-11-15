import { describe, expect, it, vi } from "vitest";
import { ProviderRegistry } from "./registry";
import { PreviewProvider } from "./preview/PreviewProvider";
import { createBrowserKv, createMemoryHistory } from "@/database/stores";

const make = (id: "spotify" | "apple-music") => new PreviewProvider(id, { kv: createBrowserKv(`r.${Math.random()}.`), history: createMemoryHistory() });

describe("ProviderRegistry", () => {
  it("lista en orden canónico y notifica cambios", () => {
    const r = new ProviderRegistry();
    const cb = vi.fn();
    r.subscribe(cb);
    r.register(make("apple-music"));
    r.register(make("spotify"));
    expect(r.list().map((p) => p.id)).toEqual(["spotify", "apple-music"]);
    expect(cb).toHaveBeenCalledTimes(2);
    expect(r.getVersion()).toBe(2);
  });

  it("al sustituir un proveedor libera el anterior", () => {
    const r = new ProviderRegistry();
    const a = make("spotify");
    const spy = vi.spyOn(a, "dispose");
    r.register(a);
    r.register(make("spotify"));
    expect(spy).toHaveBeenCalled();
  });

  it("get lanza si no está registrado; tryGet devuelve undefined", () => {
    const r = new ProviderRegistry();
    expect(() => r.get("spotify")).toThrow();
    expect(r.tryGet("spotify")).toBeUndefined();
  });
});
