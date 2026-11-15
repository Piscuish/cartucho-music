import { describe, expect, it } from "vitest";
import { FALLBACK_PALETTE, pickPalette, toneForBackground } from "./palette";

const px = (r: number, g: number, b: number, n: number) => Array.from({ length: n }, () => [r, g, b, 255]).flat();

describe("pickPalette", () => {
  it("elige el color vivo dominante y un segundo color distinto", () => {
    const [a, b] = pickPalette([...px(255, 60, 20, 60), ...px(30, 40, 200, 30), ...px(250, 250, 250, 10)]);
    expect(a).toMatch(/^#f/); // naranja/rojo
    expect(b).not.toBe(a);
  });

  it("devuelve la paleta por defecto sin píxeles opacos", () => {
    expect(pickPalette([0, 0, 0, 0])).toEqual(FALLBACK_PALETTE);
  });
});

describe("toneForBackground", () => {
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return (((n >> 16) & 255) * 0.2126 + ((n >> 8) & 255) * 0.7152 + (n & 255) * 0.0722) / 255; };
  it("oscurece un amarillo saturado en tema oscuro", () => {
    expect(lum(toneForBackground("#f4f000", "dark"))).toBeLessThan(0.35);
  });
  it("aclara un color oscuro en tema claro", () => {
    expect(lum(toneForBackground("#1a1030", "light"))).toBeGreaterThan(0.7);
  });
});
