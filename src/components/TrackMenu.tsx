import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Disc3, ExternalLink, Heart, ListMusic, ListPlus, Loader2, MicVocal, MoreHorizontal, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { Track } from "@/types/music";
import { providers, registry } from "@/providers/registry";
import { usePlayer } from "@/stores/player";
import { useAddToPlaylist, useEditablePlaylists } from "@/features/library/playlists";
import { normalize } from "@/utils/format";
import { routes } from "@/utils/routes";
import { openExternal, serviceUrl } from "@/utils/external";
import { Cover } from "./Cover";
import { QueryError } from "./ui";

/**
 * Acciones de una canción. Solo aparecen las que el servicio permite
 * (p. ej. "Añadir a la cola" requiere `capabilities.queue.add`).
 */
export function TrackMenu({ track, saved, onToggleSaved }: { track: Track; saved: boolean; onToggleSaved?: () => void }) {
  const [pos, setPos] = useState<{ x: number; y: number; up: boolean } | null>(null);
  const [view, setView] = useState<"main" | "playlists">("main");
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const addToQueue = usePlayer((s) => s.addToQueue);
  const caps = providers[track.provider].capabilities;
  const isPreview = registry.tryGet(track.provider)?.isPreview ?? true;
  const url = serviceUrl(track.provider, "track", track.id);

  const close = () => { setPos(null); setView("main"); };

  useEffect(() => {
    if (!pos) return;
    const onEvent = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && (menu.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node))) return;
      if (e.type === "wheel" && menu.current?.contains(e.target as Node)) return; // scroll dentro de la lista de playlists
      close();
    };
    window.addEventListener("mousedown", onEvent);
    window.addEventListener("keydown", onEvent);
    window.addEventListener("wheel", onEvent, { passive: true });
    return () => {
      window.removeEventListener("mousedown", onEvent);
      window.removeEventListener("keydown", onEvent);
      window.removeEventListener("wheel", onEvent);
    };
  }, [pos]);

  const open = () => {
    const r = btn.current!.getBoundingClientRect();
    // Abre hacia arriba si no cabe debajo (la lista de playlists necesita sitio).
    const below = window.innerHeight - r.bottom > 380;
    setPos({ x: Math.min(r.right, window.innerWidth - 8), y: below ? r.bottom + 6 : r.top - 6, up: !below });
  };

  const items = [
    caps.queue.add && { icon: ListPlus, label: "Añadir a la cola", run: () => addToQueue(track) },
    caps.library.playlistWrite && { icon: ListMusic, label: "Añadir a playlist", run: () => setView("playlists"), keepOpen: true, more: true },
    { icon: Disc3, label: "Ir al álbum", run: () => nav(routes.album(track.provider, track.albumId)) },
    track.artistIds[0] && { icon: MicVocal, label: "Ir al artista", run: () => nav(routes.artist(track.provider, track.artistIds[0])) },
    caps.library.write && onToggleSaved && { icon: Heart, label: saved ? "Quitar de favoritos" : "Añadir a favoritos", run: onToggleSaved },
    !isPreview && url && { icon: ExternalLink, label: `Abrir en ${providers[track.provider].name}`, run: () => openExternal(url) },
  ].filter(Boolean) as { icon: typeof Disc3; label: string; run: () => void; keepOpen?: boolean; more?: boolean }[];

  return (
    <>
      <button
        ref={btn}
        aria-label={`Más acciones para ${track.name}`}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        onClick={(e) => { e.stopPropagation(); if (pos) close(); else open(); }}
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
              className={clsx("glass z-[100] rounded-[14px] p-1.5 shadow-[var(--shadow)]", view === "main" ? "w-56" : "w-72")}
            >
              {view === "main" ? (
                items.map(({ icon: Icon, label, run, keepOpen, more }) => (
                  <button
                    key={label}
                    role="menuitem"
                    onClick={() => { if (!keepOpen) close(); run(); }}
                    className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-hover"
                  >
                    <Icon className="size-4 text-muted" /> <span className="flex-1">{label}</span>
                    {more && <ChevronRight className="size-4 text-muted" />}
                  </button>
                ))
              ) : (
                <PlaylistPicker track={track} onBack={() => setView("main")} onDone={close} />
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

/** Elegir (o crear) la playlist de destino. Solo se listan las editables. */
function PlaylistPicker({ track, onBack, onDone }: { track: Track; onBack: () => void; onDone: () => void }) {
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const playlists = useEditablePlaylists(track.provider, true);
  const add = useAddToPlaylist();
  const q = normalize(filter.trim());
  const list = (playlists.data ?? []).filter((p) => !q || normalize(p.name).includes(q));

  const run = async (args: Parameters<typeof add.mutateAsync>[0]) => {
    try { await add.mutateAsync(args); onDone(); } catch { /* el aviso ya lo muestra la mutación */ }
  };

  return (
    <div>
      <div className="flex items-center gap-1 px-1 pb-1.5">
        <button onClick={onBack} aria-label="Volver" className="grid size-7 place-items-center rounded-full text-muted hover:bg-hover hover:text-fg">
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-[13px] font-semibold">Añadir a playlist</span>
      </div>

      {creating ? (
        <form
          className="flex gap-1.5 px-1 pb-1.5"
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) void run({ tracks: [track], newName: name }); }}
        >
          <input
            autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Nombre de la playlist"
            className="min-w-0 flex-1 rounded-[10px] border border-line bg-transparent px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
          />
          <button type="submit" disabled={!name.trim() || add.isPending} className="rounded-[10px] bg-accent px-3 text-[12.5px] font-semibold text-on-accent disabled:opacity-40">
            {add.isPending ? <Loader2 className="size-4 animate-spin" /> : "Crear"}
          </button>
        </form>
      ) : (
        <button
          role="menuitem"
          onClick={() => setCreating(true)}
          className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-hover"
        >
          <span className="grid size-8 place-items-center rounded-[6px] bg-hover"><Plus className="size-4" /></span> Nueva playlist
        </button>
      )}

      <label className="mx-1 my-1.5 flex items-center gap-2 rounded-[10px] border border-line px-2.5 py-1.5 focus-within:border-accent">
        <Search className="size-3.5 text-muted" />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar en tus playlists" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none" />
      </label>

      <div className="scroll-area max-h-64">
        {playlists.isLoading && <div className="flex justify-center py-4"><Loader2 className="size-4 animate-spin text-muted" /></div>}
        {playlists.error != null && (
          <div className="px-1 py-1"><QueryError error={playlists.error} onRetry={() => void playlists.refetch()} compact /></div>
        )}
        {playlists.data && list.length === 0 && (
          <p className="px-3 py-3 text-[12.5px] text-muted">{q ? "Ninguna playlist coincide." : "No tienes playlists editables. Crea una nueva."}</p>
        )}
        {list.map((p) => (
          <button
            key={p.id}
            role="menuitem"
            disabled={add.isPending}
            onClick={() => void run({ tracks: [track], playlist: p })}
            className="flex w-full items-center gap-3 rounded-[10px] px-2 py-1.5 text-left text-[13px] hover:bg-hover disabled:opacity-50"
          >
            <Cover artwork={p.artwork} className="size-8 shrink-0 shadow-none" rounded="rounded-[6px]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{p.name}</span>
              <span className="block text-[11.5px] text-muted">{p.trackCount} canciones</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
