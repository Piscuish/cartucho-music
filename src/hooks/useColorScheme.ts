import { useSyncExternalStore } from "react";
import { resolveTheme, useAppearance } from "@/stores/appearance";

const query = () => (typeof window !== "undefined" ? window.matchMedia?.("(prefers-color-scheme: dark)") : undefined);

function subscribe(cb: () => void) {
  const mq = query();
  mq?.addEventListener("change", cb);
  return () => mq?.removeEventListener("change", cb);
}

/** Esquema efectivo: resuelve "Sistema" (y lo sigue en vivo) y "OLED". */
export function useColorScheme() {
  const theme = useAppearance((s) => s.theme);
  const prefersDark = useSyncExternalStore(subscribe, () => query()?.matches ?? true, () => true);
  return resolveTheme(theme, prefersDark);
}
