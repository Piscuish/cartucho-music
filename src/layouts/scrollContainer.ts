import { createContext, useContext, type RefObject } from "react";

/** Contenedor que hace scroll en la vista principal (lo usan las listas virtualizadas). */
export const ScrollContainerContext = createContext<RefObject<HTMLElement | null> | null>(null);

export function useScrollContainer(): RefObject<HTMLElement | null> | null {
  return useContext(ScrollContainerContext);
}
