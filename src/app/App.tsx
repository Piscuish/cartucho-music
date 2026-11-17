import { MotionConfig } from "framer-motion";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/layouts/AppShell";
import { MobileShell } from "@/layouts/MobileShell";
import { IS_MOBILE } from "@/utils/platform";
import { TitleBar } from "@/layouts/TitleBar";
import { lazy, Suspense } from "react";
// Inicio se carga de inmediato (es la primera pantalla); el resto, bajo demanda.
import { HomePage } from "@/pages/HomePage";

const SearchPage = lazy(() => import("@/pages/SearchPage").then((m) => ({ default: m.SearchPage })));
const LibraryPage = lazy(() => import("@/pages/LibraryPage").then((m) => ({ default: m.LibraryPage })));
const FavoritesPage = lazy(() => import("@/pages/FavoritesPage").then((m) => ({ default: m.FavoritesPage })));
const QueuePage = lazy(() => import("@/pages/QueuePage").then((m) => ({ default: m.QueuePage })));
const CollectionPage = lazy(() => import("@/pages/CollectionPage").then((m) => ({ default: m.CollectionPage })));
const ArtistPage = lazy(() => import("@/pages/ArtistPage").then((m) => ({ default: m.ArtistPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const NowPlayingPage = lazy(() => import("@/pages/NowPlayingPage").then((m) => ({ default: m.NowPlayingPage })));
import { useAppearanceSync } from "@/hooks/useAppearanceSync";
import { useShortcuts } from "@/hooks/useShortcuts";
import { useDesktopIntegration } from "@/features/desktop/useDesktopIntegration";
import { useAutoUpdateCheck } from "@/features/updates/updater";
import { useAppearance } from "@/stores/appearance";

function AppRoutes() {
  useShortcuts();
  useDesktopIntegration();
  useAutoUpdateCheck();
  return (
    <Routes>
      <Route path="/reproduciendo" element={<Suspense fallback={null}><NowPlayingPage /></Suspense>} />
      <Route element={IS_MOBILE ? <MobileShell /> : <AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="buscar" element={<SearchPage />} />
        <Route path="biblioteca" element={<LibraryPage tab="playlists" />} />
        <Route path="playlists" element={<LibraryPage tab="playlists" title="Playlists" />} />
        <Route path="albumes" element={<LibraryPage tab="albums" title="Álbumes" />} />
        <Route path="artistas" element={<LibraryPage tab="artists" title="Artistas" />} />
        <Route path="canciones" element={<LibraryPage tab="tracks" title="Canciones" />} />
        <Route path="favoritos" element={<FavoritesPage />} />
        <Route path="cola" element={<QueuePage />} />
        <Route path="album/:provider/:id" element={<CollectionPage kind="album" />} />
        <Route path="playlist/:provider/:id" element={<CollectionPage kind="playlist" />} />
        <Route path="artista/:provider/:id" element={<ArtistPage />} />
        <Route path="ajustes/:section?" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  useAppearanceSync();
  const motionLevel = useAppearance((s) => s.motion);
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion={motionLevel === "full" ? "never" : "always"}>
        {/* HashRouter: funciona igual en Vite y en el protocolo de Tauri. */}
        <HashRouter>
          <AppRoutes />
          <TitleBar />
        </HashRouter>
      </MotionConfig>
    </QueryClientProvider>
  );
}
