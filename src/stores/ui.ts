import { create } from "zustand";
import type { Track } from "@/types/music";

/** Estado de interfaz compartido entre componentes lejanos. */
interface UiStore {
  devicePickerOpen: boolean;
  setDevicePickerOpen: (open: boolean) => void;
  /** Canción del diálogo «Guardar en» (corazón): favoritos y varias playlists a la vez. */
  saveDialogTrack: Track | null;
  openSaveDialog: (track: Track | null) => void;
  /** Canción que se está arrastrando (desde el reproductor) hacia una playlist. */
  draggingTrack: Track | null;
  setDraggingTrack: (track: Track | null) => void;
  /** Panel lateral de la cola (se despliega desde la derecha). */
  queueOpen: boolean;
  setQueueOpen: (open: boolean) => void;
}

export const useUi = create<UiStore>()((set) => ({
  devicePickerOpen: false,
  setDevicePickerOpen: (devicePickerOpen) => set({ devicePickerOpen }),
  saveDialogTrack: null,
  openSaveDialog: (saveDialogTrack) => set({ saveDialogTrack }),
  draggingTrack: null,
  setDraggingTrack: (draggingTrack) => set({ draggingTrack }),
  queueOpen: false,
  setQueueOpen: (queueOpen) => set({ queueOpen }),
}));
