/**
 * «Guardar en»: al tocar el corazón se elige a la vez si la canción va a favoritos y a qué
 * playlists propias o colaborativas. Los cambios se aplican juntos al pulsar «Listo».
 */
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Heart, ListMusic, Loader2, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Cover } from "@/components/Cover";
import { providers } from "@/providers/registry";
import { useUi } from "@/stores/ui";
import type { Playlist, Track } from "@/types/music";
import { useSavedSets } from "./queries";
import { useEditablePlaylists, usePlaylistMembership, useSaveTo } from "./playlists";

export function SaveToDialog() {
  const track = useUi((s) => s.saveDialogTrack);
  const close = () => useUi.getState().openSaveDialog(null);
  return (
    <AnimatePresence>
      {track && (
        <motion.div
          key="save-to"
          className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4 backdrop-blur-[2px]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <SaveToPanel key={`${track.provider}:${track.id}`} track={track} onClose={close} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SaveToPanel({ track, onClose }: { track: Track; onClose: () => void }) {
  const caps = providers[track.provider].capabilities;
  const saved = useSavedSets([track])[track.provider]?.has(track.id);
  const playlists = useEditablePlaylists(track.provider, true);
  const membership = usePlaylistMembership(track, playlists.data);
  const save = useSaveTo();

  // Elecciones del usuario; lo que no ha tocado sigue el estado real.
  const [favorite, setFavorite] = useState<boolean | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const [newName, setNewName] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isIn = (p: Playlist) => picked[p.id] ?? membership.contains[p.id] ?? false;
  const favNow = favorite ?? saved ?? false;
  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (playlists.data ?? []).filter((p) => !f || p.name.toLowerCase().includes(f));
  }, [playlists.data, filter]);

  const changes = () => {
    const all = playlists.data ?? [];
    return {
      track,
      favorite: favorite !== null && favorite !== (saved ?? false) ? favorite : null,
      add: all.filter((p) => picked[p.id] === true && membership.contains[p.id] === false),
      remove: all.filter((p) => picked[p.id] === false && membership.contains[p.id] === true),
      newName: newName?.trim() || undefined,
    };
  };
  const c = changes();
  const dirty = c.favorite !== null || c.add.length > 0 || c.remove.length > 0 || !!c.newName;

  const done = async () => {
    if (dirty) await save.mutateAsync(c).catch(() => {});
    onClose();
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Guardar en"
      initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className="glass flex max-h-[min(640px,88vh)] w-full max-w-[420px] flex-col overflow-hidden rounded-[22px] shadow-[var(--shadow)]"
    >
      <div className="flex items-center gap-3 border-b border-line p-4">
        <Cover artwork={track.artwork} className="size-12 shrink-0" rounded="rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Guardar en</div>
          <div className="truncate text-[15px] font-semibold">{track.name}</div>
          <div className="truncate text-[12.5px] text-muted">{track.artistNames.join(", ")}</div>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="grid size-9 place-items-center rounded-full text-muted hover:bg-hover hover:text-fg"><X className="size-4" /></button>
      </div>

      <div className="scroll-area min-h-0 flex-1 p-2">
        {caps.library.write && (
          <Row
            icon={<span className="grid size-10 place-items-center rounded-[8px] bg-gradient-to-br from-accent to-[#ff3d7f]"><Heart className="size-4 fill-current text-white" /></span>}
            label="Tus favoritos"
            hint="Canciones que te gustan"
            checked={favNow}
            pending={saved === undefined}
            onToggle={() => setFavorite(!favNow)}
          />
        )}

        {caps.library.playlistWrite && (
          <>
            <div className="mt-3 mb-1 flex items-center gap-2 px-2">
              <span className="eyebrow flex-1">Tus playlists</span>
              {membership.loading && <Loader2 className="size-3.5 animate-spin text-muted" aria-label="Comprobando playlists" />}
            </div>
            {(playlists.data?.length ?? 0) > 6 && (
              <label className="mx-2 mb-1 flex items-center gap-2 rounded-[var(--radius-control)] border border-line px-3 py-1.5 text-[13px]">
                <Search className="size-3.5 text-muted" />
                <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar playlist" className="min-w-0 flex-1 bg-transparent outline-none" />
              </label>
            )}
            {playlists.isLoading && <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-muted" /></div>}
            {playlists.error != null && <p className="px-3 py-3 text-[12.5px] text-red-400">No se pudieron cargar tus playlists.</p>}
            {visible.map((p) => (
              <Row
                key={p.id}
                icon={<Cover artwork={p.artwork} className="size-10 shrink-0" rounded="rounded-[8px]" />}
                label={p.name}
                hint={`${p.trackCount} canciones`}
                checked={isIn(p)}
                pending={membership.contains[p.id] === undefined && picked[p.id] === undefined}
                onToggle={() => setPicked((s) => ({ ...s, [p.id]: !isIn(p) }))}
              />
            ))}
            {newName === null ? (
              <button onClick={() => setNewName("")} className="mt-1 flex w-full items-center gap-3 rounded-[var(--radius-control)] px-2 py-2 text-left text-[14px] text-muted hover:bg-hover hover:text-fg">
                <span className="grid size-10 place-items-center rounded-[8px] border border-dashed border-line"><Plus className="size-4" /></span>
                Nueva playlist
              </button>
            ) : (
              <label className="mt-1 flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-2">
                <span className="grid size-10 shrink-0 place-items-center rounded-[8px] bg-hover"><ListMusic className="size-4 text-accent" /></span>
                <input
                  autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={100}
                  placeholder="Nombre de la playlist"
                  className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-line bg-transparent px-3 py-2 text-[14px] outline-none focus:border-accent"
                />
              </label>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line p-3">
        <button onClick={onClose} className="rounded-full px-4 py-2 text-[13.5px] font-medium text-muted hover:bg-hover hover:text-fg">Cancelar</button>
        <button
          onClick={() => void done()}
          disabled={save.isPending}
          className="flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-[13.5px] font-semibold text-on-accent disabled:opacity-60"
        >
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          Listo
        </button>
      </div>
    </motion.div>
  );
}

function Row({ icon, label, hint, checked, pending, onToggle }: {
  icon: ReactNode; label: string; hint?: string; checked: boolean; pending?: boolean; onToggle: () => void;
}) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-[var(--radius-control)] px-2 py-2 text-left transition-colors hover:bg-hover"
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">{label}</span>
        {hint && <span className="block truncate text-[12px] text-muted">{hint}</span>}
      </span>
      <span
        className={clsx(
          "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
          checked ? "border-accent bg-accent text-on-accent" : "border-faint",
          pending && !checked && "opacity-40",
        )}
      >
        {checked && <Check className="size-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}
