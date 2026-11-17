import clsx from "clsx";
import { motion } from "framer-motion";
import {
  Disc3, Download, Heart, House, Library, ListMusic, ListOrdered, MicVocal, Music2, Pin, Search, Settings, type LucideIcon,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { LogoMark, Wordmark } from "@/components/Logo";
import { useVisibleServices } from "@/hooks/useProviders";
import { useAppearance, type NavId } from "@/stores/appearance";
import { useUpdates } from "@/features/updates/updater";
import { useMemo, useState, type DragEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Cover } from "@/components/Cover";
import { routes } from "@/utils/routes";
import { registry } from "@/providers/registry";
import { useRegistryVersion } from "@/hooks/useProviders";
import { useAddToPlaylist, useLibraryPlaylists } from "@/features/library/playlists";
import { playlistKey, sortPlaylists, usePlaylistOrder } from "@/stores/playlistOrder";
import { useToggleSaved } from "@/features/library/queries";
import { isTrackDrag } from "@/features/library/dragTrack";
import { usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";
import type { Playlist } from "@/types/music";

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean; id?: NavId }

export const navGroups: { title?: string; items: NavItem[] }[] = [
  { items: [
    { to: "/", label: "Inicio", icon: House, end: true },
    { to: "/buscar", label: "Buscar", icon: Search, id: "search" },
  ] },
  { title: "Tu música", items: [
    { to: "/biblioteca", label: "Mi biblioteca", icon: Library, id: "library" },
    { to: "/albumes", label: "Álbumes", icon: Disc3, id: "albums" },
    { to: "/artistas", label: "Artistas", icon: MicVocal, id: "artists" },
    { to: "/canciones", label: "Canciones", icon: Music2, id: "songs" },
    { to: "/playlists", label: "Playlists", icon: ListMusic, id: "playlists" },
    { to: "/favoritos", label: "Favoritos", icon: Heart, id: "favorites" },
  ] },
  { items: [
    { to: "/cola", label: "Cola de reproducción", icon: ListOrdered, id: "queue" },
  ] },
];

export function Sidebar() {
  const style = useAppearance((s) => s.sidebarStyle);
  const rail = style === "rail";
  const hiddenNav = useAppearance((s) => s.hiddenNav);

  return (
    <motion.aside
      layout
      transition={{ type: "spring", stiffness: 300, damping: 34 }}
      className={clsx(
        "relative z-20 flex shrink-0 flex-col",
        rail ? "w-[76px] items-center" : "w-[var(--sidebar-w)]",
        style === "floating" ? "glass m-3 mr-0 rounded-[22px] shadow-[var(--shadow)]" : "glass border-y-0 border-l-0",
      )}
    >
      <div className={clsx("flex h-[72px] shrink-0 items-center", rail ? "justify-center" : "px-5")}>
        {rail ? <LogoMark size={32} /> : <Wordmark />}
      </div>

      <nav className={clsx("scroll-area flex-1", rail ? "w-full px-3" : "px-3")} aria-label="Principal">
        {navGroups.map((g, gi) => {
          const items = g.items.filter((it) => !it.id || !hiddenNav.includes(it.id));
          if (!items.length) return null;
          return (
            <div key={gi} className="mb-4">
              {g.title && !rail && <div className="eyebrow px-3 pt-2 pb-2">{g.title}</div>}
              {g.title && rail && <div className="mx-auto mb-3 h-px w-6 bg-line" />}
              {items.map((item) => <SidebarLink key={item.to} item={item} rail={rail} />)}
            </div>
          );
        })}
        <SidebarPlaylists rail={rail} />
      </nav>

      <div className={clsx("shrink-0 border-t border-line", rail ? "w-full px-3 py-3" : "p-3")}>
        <UpdateNotice rail={rail} />
        <SidebarLink item={{ to: "/ajustes", label: "Configuración", icon: Settings }} rail={rail} />
      </div>
    </motion.aside>
  );
}

/** Aparece solo cuando hay una versión nueva disponible. */
function UpdateNotice({ rail }: { rail: boolean }) {
  const status = useUpdates((s) => s.status);
  if (status.state !== "available" && status.state !== "downloading" && status.state !== "installing") return null;
  return (
    <NavLink
      to="/ajustes/actualizaciones"
      title={`Actualización disponible: ${status.version}`}
      className={clsx(
        "mb-1 flex items-center gap-3 rounded-[var(--radius-control)] bg-accent/15 py-2 text-[13px] font-medium text-accent transition-colors hover:bg-accent/25",
        rail ? "justify-center" : "px-3",
      )}
    >
      <Download className="size-[18px] shrink-0" />
      {!rail && <span className="min-w-0 flex-1 truncate">Actualizar a {status.version}</span>}
    </NavLink>
  );
}

function SidebarLink({ item, rail }: { item: NavItem; rail: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={rail ? item.label : undefined}
      className={({ isActive }) => clsx(
        "group relative flex items-center gap-3 rounded-[var(--radius-control)] py-[calc(var(--row-py)+1px)] text-[13.5px] font-medium transition-colors",
        rail ? "justify-center" : "px-3",
        isActive ? "text-fg" : "text-muted hover:bg-hover hover:text-fg",
      )}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="sidebar-active"
              className="absolute inset-0 rounded-[var(--radius-control)] bg-hover"
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            >
              <span className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-full bg-accent" />
            </motion.span>
          )}
          <Icon className={clsx("relative size-[18px] shrink-0", isActive && "text-accent")} strokeWidth={isActive ? 2.2 : 1.8} />
          {!rail && <span className="relative truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
}

/* ───── Tus playlists: también son destino al arrastrar una canción ───── */

function useDropTarget(accept: boolean, onDrop: () => void) {
  const [over, setOver] = useState(false);
  const dragging = useUi((s) => s.draggingTrack);
  const handlers = {
    onDragEnter: (e: DragEvent) => { if (accept && isTrackDrag(e)) { e.preventDefault(); setOver(true); } },
    onDragOver: (e: DragEvent) => { if (accept && isTrackDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => { setOver(false); if (accept && isTrackDrag(e)) { e.preventDefault(); onDrop(); } },
  };
  return { over, armed: !!dragging && accept, dimmed: !!dragging && !accept, handlers };
}

const PLAYLIST_MIME = "application/x-cartucho-playlist";

function SidebarPlaylists({ rail }: { rail: boolean }) {
  const provider = useVisibleServices().find((p) => registry.tryGet(p.id)?.capabilities.library.playlists)?.id;
  useRegistryVersion();
  const playlists = useLibraryPlaylists(provider ?? "spotify", !!provider);
  const { pinned, order } = usePlaylistOrder();
  const sorted = useMemo(() => sortPlaylists(playlists.data ?? [], pinned, order), [playlists.data, pinned, order]);
  const visibleKeys = sorted.map(playlistKey);
  const dragging = useUi((s) => s.draggingTrack);
  const toggleSaved = useToggleSaved();
  const fav = useDropTarget(!!dragging && registry.tryGet(dragging.provider)?.capabilities.library.write === true, () => {
    if (dragging) toggleSaved.mutate({ track: dragging, saved: false }, {
      onSuccess: () => usePlayer.getState().showToast({ kind: "info", message: `«${dragging.name}» añadida a Tus favoritos` }),
    });
  });
  if (!provider || !sorted.length) return null;
  return (
    <div className="mb-4">
      {!rail && (
        <div className="eyebrow px-3 pt-2 pb-2" title="Arrastra una playlist para cambiar su orden; el alfiler la fija arriba. Suelta una canción encima para añadirla.">Tus playlists</div>
      )}
      {rail && <div className="mx-auto mb-3 h-px w-6 bg-line" />}
      {/* Siempre visible (no aparece de golpe al arrastrar, que movería las demás). */}
      <NavLink
        to="/favoritos"
        title="Tus favoritos"
        {...fav.handlers}
        className={({ isActive }) => clsx(
          "flex items-center gap-3 rounded-[var(--radius-control)] py-1.5 text-[13px] transition-all",
          rail ? "justify-center" : "px-2",
          fav.over ? "bg-accent/20 text-fg ring-2 ring-accent" : isActive ? "bg-hover text-fg" : "text-muted hover:bg-hover hover:text-fg",
          fav.armed && !fav.over && "ring-1 ring-accent/40",
        )}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-[6px] bg-gradient-to-br from-accent to-[#ff3d7f]"><Heart className="size-3.5 fill-current text-white" /></span>
        {!rail && <span className="min-w-0 flex-1 truncate font-medium">Tus favoritos</span>}
      </NavLink>
      {sorted.slice(0, 60).map((p) => (
        <SidebarPlaylist key={p.id} playlist={p} rail={rail} pinned={pinned.includes(playlistKey(p))} visibleKeys={visibleKeys} />
      ))}
    </div>
  );
}

function SidebarPlaylist({ playlist, rail, pinned, visibleKeys }: { playlist: Playlist; rail: boolean; pinned: boolean; visibleKeys: string[] }) {
  const dragging = useUi((s) => s.draggingTrack);
  const add = useAddToPlaylist();
  const qc = useQueryClient();
  const v = useRegistryVersion();
  const key = playlistKey(playlist);
  const [reorderOver, setReorderOver] = useState(false);
  const accept = !!dragging && dragging.provider === playlist.provider && playlist.canEdit === true;
  const drop = useDropTarget(accept, async () => {
    const track = dragging!;
    // Como Spotify: avisar si ya está, en vez de duplicarla.
    const ids = await qc.fetchQuery({
      queryKey: [playlist.provider, v, "playlist", playlist.id, "ids"],
      queryFn: ({ signal }) => registry.get(playlist.provider).library.getPlaylistTrackIds(playlist.id, signal),
      staleTime: 60_000,
    }).catch(() => [] as string[]);
    if (ids.includes(track.id)) {
      usePlayer.getState().showToast({ kind: "info", message: `«${track.name}» ya está en «${playlist.name}»` });
      return;
    }
    add.mutate({ tracks: [track], playlist });
  });
  const isPlaylistDrag = (e: DragEvent) => e.dataTransfer.types.includes(PLAYLIST_MIME);

  return (
    <NavLink
      to={routes.playlist(playlist.provider, playlist.id)}
      title={playlist.name}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(PLAYLIST_MIME, key);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnter={(e) => { if (isPlaylistDrag(e)) { e.preventDefault(); setReorderOver(true); } else drop.handlers.onDragEnter(e); }}
      onDragOver={(e) => { if (isPlaylistDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } else drop.handlers.onDragOver(e); }}
      onDragLeave={() => { setReorderOver(false); drop.handlers.onDragLeave(); }}
      onDrop={(e) => {
        if (isPlaylistDrag(e)) {
          e.preventDefault();
          setReorderOver(false);
          usePlaylistOrder.getState().move(e.dataTransfer.getData(PLAYLIST_MIME), key, visibleKeys);
        } else drop.handlers.onDrop(e);
      }}
      className={({ isActive }) => clsx(
        "group/pl relative flex items-center gap-3 rounded-[var(--radius-control)] py-1.5 text-[13px] transition-all",
        rail ? "justify-center" : "px-2",
        drop.over ? "bg-accent/20 text-fg ring-2 ring-accent" : isActive ? "bg-hover text-fg" : "text-muted hover:bg-hover hover:text-fg",
        drop.armed && !drop.over && "ring-1 ring-accent/40",
        drop.dimmed && "opacity-40",
      )}
    >
      {reorderOver && <span className="absolute -top-px right-2 left-2 h-0.5 rounded-full bg-accent" aria-hidden />}
      <Cover artwork={playlist.artwork} className="size-8 shrink-0" rounded="rounded-[6px]" />
      {!rail && <span className="min-w-0 flex-1 truncate font-medium">{playlist.name}</span>}
      {!rail && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); usePlaylistOrder.getState().togglePin(key); }}
          aria-label={pinned ? `Desfijar «${playlist.name}»` : `Fijar «${playlist.name}» arriba`}
          title={pinned ? "Desfijar" : "Fijar arriba"}
          className={clsx("grid size-6 shrink-0 place-items-center rounded-full transition-opacity hover:bg-hover", pinned ? "text-accent" : "text-muted opacity-0 group-hover/pl:opacity-100")}
        >
          <Pin className={clsx("size-3.5", pinned && "fill-current")} />
        </button>
      )}
    </NavLink>
  );
}
