import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Disc3, ExternalLink, Heart, ListPlus, MicVocal, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { Track } from "@/types/music";
import { providers, registry } from "@/providers/registry";
import { usePlayer } from "@/stores/player";
import { routes } from "@/utils/routes";
import { openExternal, serviceUrl } from "@/utils/external";

/**
 * Acciones de una canción. Solo aparecen las que el servicio permite
 * (p. ej. "Añadir a la cola" requiere `capabilities.queue.add`).
 */
export function TrackMenu({ track, saved, onToggleSaved }: { track: Track; saved: boolean; onToggleSaved?: () => void }) {
  const [pos, setPos] = useState<{ x: number; y: number; up: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const addToQueue = usePlayer((s) => s.addToQueue);
  const caps = providers[track.provider].capabilities;
  const isPreview = registry.tryGet(track.provider)?.isPreview ?? true;
  const url = serviceUrl(track.provider, "track", track.id);

  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && (menu.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node))) return;
      setPos(null);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("wheel", close, { passive: true });
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("wheel", close);
    };
  }, [pos]);

  const open = () => {
    const r = btn.current!.getBoundingClientRect();
    // Abre hacia arriba si no cabe debajo.
    const below = window.innerHeight - r.bottom > 260;
    setPos({ x: Math.min(r.right, window.innerWidth - 8), y: below ? r.bottom + 6 : r.top - 6, up: !below });
  };

  const items = [
    caps.queue.add && { icon: ListPlus, label: "Añadir a la cola", run: () => addToQueue(track) },
    { icon: Disc3, label: "Ir al álbum", run: () => nav(routes.album(track.provider, track.albumId)) },
    track.artistIds[0] && { icon: MicVocal, label: "Ir al artista", run: () => nav(routes.artist(track.provider, track.artistIds[0])) },
    caps.library.write && onToggleSaved && { icon: Heart, label: saved ? "Quitar de favoritos" : "Añadir a favoritos", run: onToggleSaved },
    !isPreview && url && { icon: ExternalLink, label: `Abrir en ${providers[track.provider].name}`, run: () => openExternal(url) },
  ].filter(Boolean) as { icon: typeof Disc3; label: string; run: () => void }[];

  return (
    <>
      <button
        ref={btn}
        aria-label={`Más acciones para ${track.name}`}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        onClick={(e) => { e.stopPropagation(); if (pos) setPos(null); else open(); }}
        className={clsx("grid size-7 place-items-center rounded-full text-muted transition-opacity hover:bg-hover hover:text-fg", pos ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {createPortal(
        <AnimatePresence>
          {pos && (
            <motion.div
              ref={menu}
              role="menu"
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              style={{ position: "fixed", left: pos.x, top: pos.y, transform: `translate(-100%, ${pos.up ? "-100%" : "0"})` }}
              className="glass z-[100] w-56 rounded-[14px] p-1.5 shadow-[var(--shadow)]"
            >
              {items.map(({ icon: Icon, label, run }) => (
                <button
                  key={label}
                  role="menuitem"
                  onClick={() => { setPos(null); run(); }}
                  className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-hover"
                >
                  <Icon className="size-4 text-muted" /> {label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
