import { useEffect } from "react";
import { accents, useAppearance } from "@/stores/appearance";
import { usePlayer } from "@/stores/player";
import { usePalette } from "@/utils/palette";
import { useColorScheme } from "./useColorScheme";
import { useLightMode } from "./usePerformance";

/** Texto legible sobre el acento (negro o blanco según luminancia). */
export function contrastFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? "#140a04" : "#ffffff";
}

/** Vuelca las preferencias de apariencia en el <html> como atributos y variables CSS. */
export function useAppearanceSync() {
  const a = useAppearance();
  const { scheme, oled } = useColorScheme();
  const artwork = usePlayer((s) => s.state?.track?.artwork);
  const palette = usePalette(artwork);
  const hasTrack = !!artwork;
  const light = useLightMode();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = scheme;
    root.dataset.oled = String(oled);
    root.dataset.density = a.density;
    root.dataset.motion = a.motion;
    root.dataset.glass = a.glass;
    root.dataset.typeface = a.typeface;
    root.dataset.corners = a.corners;
    root.dataset.perf = light ? "light" : "full";
  }, [scheme, oled, a.density, a.motion, a.glass, a.typeface, a.corners, light]);

  useEffect(() => {
    const base = a.accent === "custom" ? a.customAccent : accents[a.accent].value;
    const accent = a.accentFromArtwork && hasTrack ? palette[0] : base;
    const root = document.documentElement.style;
    root.setProperty("--accent", accent);
    root.setProperty("--accent-contrast", contrastFor(accent));
  }, [a.accent, a.customAccent, a.accentFromArtwork, palette, hasTrack]);
}
