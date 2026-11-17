import { describe, expect, it } from "vitest";
import { bootstrapProviders, setServiceVisible } from "./bootstrap";
import { registry } from "./registry";
import { useServicesPrefs } from "@/stores/services";

describe("visibilidad de servicios", () => {
  it("Apple Music empieza oculto y no se registra", () => {
    expect(useServicesPrefs.getState().hidden).toContain("apple-music");
    bootstrapProviders();
    expect(registry.list().map((p) => p.id)).toEqual(["spotify"]);
  });

  it("Apple Music sigue oculto aunque se intente mostrar", () => {
    setServiceVisible("apple-music", true);
    expect(registry.tryGet("apple-music")).toBeUndefined();
    expect(useServicesPrefs.getState().hidden).toContain("apple-music");
  });

  it("Spotify se puede ocultar y volver a mostrar en caliente", () => {
    setServiceVisible("spotify", false);
    expect(registry.tryGet("spotify")).toBeUndefined();
    setServiceVisible("spotify", true);
    expect(registry.tryGet("spotify")).toBeDefined();
    expect(useServicesPrefs.getState().hidden).not.toContain("spotify");
  });
});
