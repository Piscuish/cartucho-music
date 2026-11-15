import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import { bootstrapProviders } from "@/providers/bootstrap";
import { useAppearance } from "@/stores/appearance";
import { useServicesPrefs } from "@/stores/services";
import { useDesktop } from "@/stores/desktop";
import "@/styles/fonts";
import "@/styles/index.css";

async function start() {
  // Preferencias desde SQLite (o el respaldo del navegador) ANTES del primer render,
  // para no mostrar un tema y cambiarlo un instante después.
  try {
    await Promise.all([useAppearance.persist.rehydrate(), useServicesPrefs.persist.rehydrate(), useDesktop.persist.rehydrate()]);
  } catch (e) {
    console.warn("[arranque] no se pudieron cargar las preferencias", e);
  }
  bootstrapProviders();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
