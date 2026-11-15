import { useEffect, useState } from "react";
import type { Artwork } from "@/types/music";

export const FALLBACK_PALETTE: [string, string] = ["#3a3442", "#14121a"];

const memory = new Map<string, Promise<[string, string]>>();

function hexToHsl(hexColor: string): [number, number, number] {
  const n = parseInt(hexColor.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return hex(f(0) * 255, f(8) * 255, f(4) * 255);
}

/**
 * Ajusta un color de portada para usarlo como fondo sin comprometer la legibilidad:
 * en tema oscuro limita la luminosidad y la saturación; en claro, la aclara.
 */
export function toneForBackground(color: string, theme: "dark" | "light"): string {
  const [h, s0, l0] = hexToHsl(color);
  // Se limita la luminancia PERCIBIDA (un amarillo con L=0,32 sigue siendo muy brillante).
  if (theme === "dark") {
    const s = Math.min(s0, 0.6);
    let l = Math.min(l0, 0.32);
    while (l > 0.04 && luminance(hslToHex(h, s, l)) > 0.16) l -= 0.02;
    return hslToHex(h, s, l);
  }
  const s = Math.min(s0, 0.55);
  let l = Math.max(l0, 0.78);
  while (l < 0.97 && luminance(hslToHex(h, s, l)) < 0.72) l += 0.02;
  return hslToHex(h, s, l);
}

/** Luminancia relativa aproximada (0–1). */
function luminance(hexColor: string): number {
  const n = parseInt(hexColor.slice(1), 16);
  return (((n >> 16) & 255) * 0.2126 + ((n >> 8) & 255) * 0.7152 + (n & 255) * 0.0722) / 255;
}

const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/**
 * Elige dos colores representativos de una lista de píxeles RGB:
 * cuantiza en cubos, puntúa por frecuencia × saturación y toma los dos más distintos.
 * Pura y testeable.
 */
export function pickPalette(pixels: Uint8ClampedArray | number[]): [string, string] {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
    if (a < 128) continue;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const e = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    e.r += r; e.g += g; e.b += b; e.n++;
    buckets.set(key, e);
  }
  const colors = [...buckets.values()].map((e) => {
    const [r, g, b] = [e.r / e.n, e.g / e.n, e.b / e.n];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const light = (max + min) / 2 / 255;
    // Favorece colores vivos y penaliza casi-blancos y casi-negros.
    const score = e.n * (0.35 + sat) * (light < 0.08 || light > 0.92 ? 0.25 : 1);
    return { r, g, b, score };
  }).sort((a, b) => b.score - a.score);
  if (!colors.length) return FALLBACK_PALETTE;
  const first = colors[0];
  const dist = (c: typeof first) => Math.hypot(c.r - first.r, c.g - first.g, c.b - first.b);
  const second = colors.find((c) => dist(c) > 90) ?? colors[1] ?? { r: first.r * 0.35, g: first.g * 0.35, b: first.b * 0.35, score: 0 };
  return [hex(first.r, first.g, first.b), hex(second.r, second.g, second.b)];
}

function loadImagePixels(url: string): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      const size = 32;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return reject(new Error("sin canvas"));
      ctx.drawImage(img, 0, 0, size, size);
      try { resolve(ctx.getImageData(0, 0, size, size).data); } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error("no se pudo cargar la portada"));
    img.src = url;
  });
}

export function extractPalette(url: string): Promise<[string, string]> {
  let p = memory.get(url);
  if (!p) {
    p = loadImagePixels(url).then(pickPalette).catch(() => FALLBACK_PALETTE);
    memory.set(url, p);
  }
  return p;
}

/** Paleta de una portada: la declarada, o la extraída de la imagen (con caché en memoria). */
export function usePalette(artwork: Artwork | null | undefined): [string, string] {
  const declared = artwork?.palette;
  const url = artwork?.url;
  const [extracted, setExtracted] = useState<[string, string] | null>(null);
  useEffect(() => {
    if (declared || !url) return;
    let alive = true;
    extractPalette(url).then((p) => alive && setExtracted(p));
    return () => { alive = false; };
  }, [declared, url]);
  return declared ?? extracted ?? FALLBACK_PALETTE;
}
