import { useAppearance } from "@/stores/appearance";

/** ¿Equipo modesto? Pocos núcleos o poca memoria (deviceMemory solo existe en Chromium/WebView2). */
export function isLowEndDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return cores <= 4 || memory <= 4;
}

/** `true` si hay que ahorrar recursos (modo ligero elegido o detectado). */
export function useLightMode(): boolean {
  const mode = useAppearance((s) => s.performance);
  return mode === "light" || (mode === "auto" && isLowEndDevice());
}
