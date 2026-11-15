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

  it("se puede mostrar y volver a ocultar en caliente", () => {
    setServiceVisible("apple-music", true);
    expect(registry.tryGet("apple-music")).toBeDefined();
    expect(useServicesPrefs.getState().hidden).not.toContain("apple-music");
    setServiceVisible("apple-music", false);
    expect(registry.tryGet("apple-music")).toBeUndefined();
    expect(useServicesPrefs.getState().hidden).toContain("apple-music");
  });
});
