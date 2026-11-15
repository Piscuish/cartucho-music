import { beforeEach, describe, expect, it } from "vitest";
import { defaults, homeSectionIds, parseAppearance, resolveTheme, useAppearance } from "./appearance";

describe("parseAppearance", () => {
  it("devuelve los valores por defecto ante datos ausentes o corruptos", () => {
    expect(parseAppearance(undefined)).toEqual(defaults);
    expect(parseAppearance("basura")).toEqual(defaults);
  });

  it("conserva los campos válidos y corrige solo los inválidos", () => {
    const r = parseAppearance({ theme: "light", accent: "no-existe", density: "compact", glass: 42, bgIntensity: 500 });
    expect(r.theme).toBe("light");
    expect(r.density).toBe("compact");
    expect(r.accent).toBe(defaults.accent);
    expect(r.glass).toBe(defaults.glass);
    expect(r.bgIntensity).toBe(defaults.bgIntensity);
  });

  it("descarta campos desconocidos", () => {
    expect(parseAppearance({ ...defaults, hack: "<script>" })).not.toHaveProperty("hack");
  });

  it("migra dynamicBackground: false de la versión anterior a bgStyle: off", () => {
    expect(parseAppearance({ dynamicBackground: false }).bgStyle).toBe("off");
    expect(parseAppearance({ dynamicBackground: true }).bgStyle).toBe("aurora");
  });

  it("rechaza un acento personalizado que no sea #RRGGBB", () => {
    expect(parseAppearance({ customAccent: "red; background:url(x)" }).customAccent).toBe(defaults.customAccent);
    expect(parseAppearance({ customAccent: "#12ab9F" }).customAccent).toBe("#12ab9F");
  });

  it("completa y deduplica las secciones de Inicio respetando el orden", () => {
    const r = parseAppearance({ homeSections: [{ id: "artists", visible: false }, { id: "artists", visible: true }, { id: "quick", visible: true }] });
    expect(r.homeSections.map((s) => s.id)).toEqual(["artists", "quick", ...homeSectionIds.filter((id) => id !== "artists" && id !== "quick")]);
    expect(r.homeSections[0].visible).toBe(false);
  });
});

describe("resolveTheme", () => {
  it("resuelve sistema y OLED", () => {
    expect(resolveTheme("system", true)).toEqual({ scheme: "dark", oled: false });
    expect(resolveTheme("system", false)).toEqual({ scheme: "light", oled: false });
    expect(resolveTheme("oled", false)).toEqual({ scheme: "dark", oled: true });
  });
});

describe("store de apariencia", () => {
  beforeEach(() => useAppearance.setState({ ...defaults, customPresets: [] }));

  it("guarda, aplica y borra diseños propios", () => {
    const s = useAppearance.getState();
    s.set("typeface", "mono");
    s.set("corners", "sharp");
    s.savePreset("  Mi diseño  ");
    const [p] = useAppearance.getState().customPresets;
    expect(p.name).toBe("Mi diseño");
    s.reset();
    expect(useAppearance.getState().typeface).toBe("grotesk");
    useAppearance.getState().applyCustomPreset(p.id);
    expect(useAppearance.getState()).toMatchObject({ typeface: "mono", corners: "sharp" });
    useAppearance.getState().deletePreset(p.id);
    expect(useAppearance.getState().customPresets).toHaveLength(0);
  });

  it("reordena y oculta secciones de Inicio sin salirse de los límites", () => {
    const s = useAppearance.getState();
    s.moveHomeSection("quick", -1); // ya es la primera
    expect(useAppearance.getState().homeSections[0].id).toBe("quick");
    s.moveHomeSection("quick", 1);
    expect(useAppearance.getState().homeSections.map((x) => x.id).slice(0, 2)).toEqual(["recent", "quick"]);
    s.toggleHomeSection("artists", false);
    expect(useAppearance.getState().homeSections.find((x) => x.id === "artists")?.visible).toBe(false);
  });

  it("oculta y muestra entradas de la barra lateral", () => {
    useAppearance.getState().toggleNav("explore", false);
    useAppearance.getState().toggleNav("explore", false);
    expect(useAppearance.getState().hiddenNav).toEqual(["explore"]);
    useAppearance.getState().toggleNav("explore", true);
    expect(useAppearance.getState().hiddenNav).toEqual([]);
  });
});
