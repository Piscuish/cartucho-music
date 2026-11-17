/**
 * Arrastrar una canción (desde el reproductor) hasta una playlist o Favoritos de la barra
 * lateral, como en Spotify. Se usa arrastre HTML5; en Tauri hay que desactivar el arrastre
 * de archivos de la ventana (`dragDropEnabled: false`) para que estos eventos lleguen.
 */
import type { DragEvent } from "react";
import { useUi } from "@/stores/ui";
import type { Track } from "@/types/music";

export const TRACK_MIME = "application/x-cartucho-track";

export function startTrackDrag(e: DragEvent, track: Track) {
  e.dataTransfer.effectAllowed = "copy";
  e.dataTransfer.setData(TRACK_MIME, `${track.provider}:${track.id}`);
  e.dataTransfer.setData("text/plain", `${track.name} — ${track.artistNames.join(", ")}`);
  // Etiqueta con el nombre, en lugar de la «foto» del reproductor entero.
  const ghost = document.createElement("div");
  ghost.textContent = track.name;
  Object.assign(ghost.style, {
    position: "fixed", top: "-100px", left: "0", padding: "6px 14px", borderRadius: "999px", maxWidth: "260px",
    background: "var(--accent)", color: "var(--accent-contrast)", font: "600 13px Inter, sans-serif",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  });
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 16, 16);
  setTimeout(() => ghost.remove(), 0);
  useUi.getState().setDraggingTrack(track);
}

export function endTrackDrag() {
  useUi.getState().setDraggingTrack(null);
}

/** ¿El arrastre en curso es una canción de Cartucho? */
export function isTrackDrag(e: DragEvent) {
  return e.dataTransfer.types.includes(TRACK_MIME);
}
