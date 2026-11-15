import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePlayer } from "@/stores/player";

export const shortcuts = [
  { keys: ["Espacio"], action: "Reproducir / pausar" },
  { keys: ["Ctrl", "→"], action: "Siguiente canción" },
  { keys: ["Ctrl", "←"], action: "Canción anterior" },
  { keys: ["Ctrl", "↑"], action: "Subir volumen" },
  { keys: ["Ctrl", "↓"], action: "Bajar volumen" },
  { keys: ["Ctrl", "K"], action: "Buscar" },
  { keys: ["Ctrl", ","], action: "Configuración" },
  { keys: ["Ctrl", "L"], action: "Pantalla Reproduciendo" },
] as const;

/** Atajos de teclado dentro de la ventana. Los globales del SO llegan en la Fase 7. */
export function useShortcuts() {
  const nav = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.closest("input, textarea, [contenteditable=true]") && (target as HTMLInputElement).type !== "range";
      const p = usePlayer.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); nav("/buscar"); return; }
      if (mod && e.key === ",") { e.preventDefault(); nav("/ajustes"); return; }
      if (typing) return;
      if (e.code === "Space") { e.preventDefault(); p.toggle(); }
      else if (mod && e.key === "ArrowRight") { e.preventDefault(); p.next(); }
      else if (mod && e.key === "ArrowLeft") { e.preventDefault(); p.previous(); }
      else if (mod && e.key === "ArrowUp") { e.preventDefault(); p.setVolume((p.state?.volume ?? 0) + 0.05); }
      else if (mod && e.key === "ArrowDown") { e.preventDefault(); p.setVolume((p.state?.volume ?? 0) - 0.05); }
      else if (mod && e.key.toLowerCase() === "l") { e.preventDefault(); nav("/reproduciendo"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);
}
