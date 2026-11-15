import { create } from "zustand";

/** Estado de interfaz compartido entre componentes lejanos. */
interface UiStore {
  devicePickerOpen: boolean;
  setDevicePickerOpen: (open: boolean) => void;
}

export const useUi = create<UiStore>()((set) => ({
  devicePickerOpen: false,
  setDevicePickerOpen: (devicePickerOpen) => set({ devicePickerOpen }),
}));
