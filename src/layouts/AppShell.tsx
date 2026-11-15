import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Suspense, useEffect, useRef } from "react";
import { RowSkeletons, Skeleton } from "@/components/ui";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { PlayerBar } from "./PlayerBar";
import { DynamicBackground } from "./DynamicBackground";
import { useAppearance } from "@/stores/appearance";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ScrollContainerContext } from "./scrollContainer";

export function AppShell() {
  const loc = useLocation();
  const { playerStyle, sidebarStyle, motion: motionLevel } = useAppearance();
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [loc.pathname]);

  const pageMotion = motionLevel === "full"
    ? { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } }
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-bg">
      <DynamicBackground />
      <div className="relative flex min-h-0 flex-1">
        <Sidebar />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <main
            ref={scrollRef}
            className={clsx(
              "scroll-area relative min-h-0 flex-1 px-[var(--page-px)] pt-8",
              playerStyle === "island" ? "pb-36" : "pb-12",
              sidebarStyle === "floating" && "pt-10",
            )}
          >
            <AnimatePresence mode="wait">
              <motion.div key={loc.pathname} {...pageMotion} transition={{ duration: 0.22, ease: "easeOut" }} className="mx-auto max-w-[1480px]">
                <ErrorBoundary resetKey={loc.pathname}>
                  <ScrollContainerContext.Provider value={scrollRef}>
                    <Suspense fallback={<PageFallback />}>
                      <Outlet />
                    </Suspense>
                  </ScrollContainerContext.Provider>
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </main>
          {/* La isla flota sobre la columna de contenido, nunca sobre la barra lateral. */}
          {playerStyle === "island" && <PlayerBar />}
        </div>
      </div>
      {playerStyle !== "island" && <PlayerBar />}
    </div>
  );
}

/** Mientras se descarga el código de una pantalla (solo la primera vez). */
function PageFallback() {
  return (
    <div aria-busy className="pt-2">
      <Skeleton className="mb-8 h-10 w-64 rounded-[var(--radius-control)]" />
      <RowSkeletons count={6} />
    </div>
  );
}
