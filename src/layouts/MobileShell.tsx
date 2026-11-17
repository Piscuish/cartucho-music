/**
 * Interfaz de teléfono (Android): contenido a pantalla completa, minirreproductor y
 * pestañas abajo, al alcance del pulgar. Usa las mismas pantallas que el escritorio.
 */
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Home, Library, ListOrdered, Loader2, Music2, Pause, Play, Search, Settings, SkipForward, X } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Cover } from "@/components/Cover";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RowSkeletons, Skeleton } from "@/components/ui";
import { DevicePicker } from "@/features/player/DevicePicker";
import { usePlaybackPosition, usePlayer } from "@/stores/player";
import { useUpdates } from "@/features/updates/updater";
import { DynamicBackground } from "./DynamicBackground";
import { PlayerToast } from "./PlayerBar";
import { ScrollContainerContext } from "./scrollContainer";

const tabs = [
  { to: "/", label: "Inicio", icon: Home, end: true },
  { to: "/buscar", label: "Buscar", icon: Search },
  { to: "/biblioteca", label: "Biblioteca", icon: Library },
  { to: "/cola", label: "Cola", icon: ListOrdered },
  { to: "/ajustes", label: "Ajustes", icon: Settings },
] as const;

export function MobileShell() {
  const loc = useLocation();
  const scrollRef = useRef<HTMLElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [loc.pathname]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-bg">
      <DynamicBackground />
      <main ref={scrollRef} className="scroll-area relative min-h-0 flex-1 px-[var(--page-px)] pt-[calc(var(--safe-top)+18px)] pb-6">
        <AnimatePresence mode="wait">
          <motion.div key={loc.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <ErrorBoundary resetKey={loc.pathname}>
              <ScrollContainerContext.Provider value={scrollRef}>
                <Suspense fallback={<div aria-busy><Skeleton className="mb-6 h-9 w-48" /><RowSkeletons count={6} /></div>}>
                  <Outlet />
                </Suspense>
              </ScrollContainerContext.Provider>
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>
      <UpdateBanner />
      <MiniPlayer />
      <TabBar />
    </div>
  );
}

function TabBar() {
  const updateReady = useUpdates((s) => s.status.state === "available");
  return (
    <nav className="glass relative z-30 grid shrink-0 grid-cols-5 border-x-0 border-b-0 pb-[var(--safe-bottom)]" aria-label="Secciones">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={"end" in t && t.end}
          className={({ isActive }) => clsx(
            "flex flex-col items-center gap-1 pt-2.5 pb-2 text-[10.5px] font-medium transition-colors",
            isActive ? "text-accent" : "text-muted active:text-fg",
          )}
        >
          <span className="relative">
            <t.icon className="size-[22px]" />
            {t.to === "/ajustes" && updateReady && <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-accent" aria-label="Actualización disponible" />}
          </span>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

function MiniPlayer() {
  const nav = useNavigate();
  const state = usePlayer((s) => s.state);
  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const position = usePlaybackPosition();
  const t = state?.track ?? null;
  const pct = t ? Math.min(100, (position / t.durationMs) * 100) : 0;

  return (
    <div className="relative z-30 shrink-0 px-2 pb-2">
      <PlayerToast />
      <div className="glass relative flex items-center gap-3 overflow-hidden rounded-[18px] py-2 pr-1.5 pl-2 shadow-[var(--shadow)]">
        <button
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => t && nav("/reproduciendo")}
          aria-label={t ? "Abrir Reproduciendo" : undefined}
          disabled={!t}
        >
          {t ? (
            <Cover artwork={t.artwork} className="size-11 shrink-0" rounded="rounded-[10px]" />
          ) : (
            <span className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-hover text-muted"><Music2 className="size-5" /></span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold">{t?.name ?? "Nada sonando"}</span>
            <span className="block truncate text-[12.5px] text-muted">
              {t ? t.artistNames.join(", ") : "Elige una canción o un dispositivo"}
              {state?.mode === "remote" && state.device && <span className="text-accent"> · {state.device.name}</span>}
            </span>
          </span>
        </button>
        <DevicePicker />
        <button
          onClick={() => void toggle()}
          disabled={!t}
          aria-label={state?.isPlaying ? "Pausar" : "Reproducir"}
          className="grid size-11 shrink-0 place-items-center rounded-full text-fg active:bg-hover disabled:opacity-30"
        >
          {state?.isPlaying ? <Pause className="size-6 fill-current" /> : <Play className="ml-0.5 size-6 fill-current" />}
        </button>
        <button
          onClick={() => void next()}
          disabled={!t}
          aria-label="Siguiente"
          className="grid size-11 shrink-0 place-items-center rounded-full text-fg active:bg-hover disabled:opacity-30"
        >
          <SkipForward className="size-5 fill-current" />
        </button>
        <div className="absolute right-3 bottom-0 left-3 h-[2px] rounded-full bg-line">
          <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

/** Aviso de versión nueva, como el de la barra lateral en Windows: un toque y se actualiza. */
function UpdateBanner() {
  const status = useUpdates((s) => s.status);
  const install = useUpdates((s) => s.install);
  const [hidden, setHidden] = useState<string | null>(null);
  if (status.state !== "available" && status.state !== "downloading" && status.state !== "installing") return null;
  if (status.state === "available" && hidden === status.version) return null;

  const pct = status.state === "downloading" && status.total ? Math.round((status.downloaded / status.total) * 100) : null;
  return (
    <div className="relative z-30 shrink-0 px-2 pb-2">
      <div className="flex items-center gap-3 rounded-[16px] border border-accent/40 bg-accent/[0.08] py-2 pr-1.5 pl-3 text-[13px] backdrop-blur">
        {status.state === "available" ? <Download className="size-4 shrink-0 text-accent" /> : <Loader2 className="size-4 shrink-0 animate-spin text-accent" />}
        <span className="min-w-0 flex-1 truncate">
          {status.state === "available" && <>Cartucho Music <b>{status.version}</b> disponible</>}
          {status.state === "downloading" && <>Descargando {status.version}{pct !== null ? ` · ${pct}%` : "…"}</>}
          {status.state === "installing" && <>Confirma la instalación en el aviso de Android</>}
        </span>
        {status.state === "available" && (
          <>
            <button onClick={() => void install()} className="rounded-full bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-on-accent">Actualizar</button>
            <button onClick={() => setHidden(status.version)} aria-label="Ahora no" className="grid size-8 place-items-center text-muted"><X className="size-4" /></button>
          </>
        )}
      </div>
    </div>
  );
}
