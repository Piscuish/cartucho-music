/**
 * Cola de reproducción en panel: lateral (se despliega de derecha a izquierda) o dentro de la
 * pantalla de letra. Se puede reordenar arrastrando, quitar canciones, guardarlas y vaciarla,
 * siempre que el servicio lo permita (ver capacidades).
 */
import clsx from "clsx";
import { Reorder, useDragControls } from "framer-motion";
import { ArrowLeft, GripVertical, Heart, Loader2, Plus, Repeat, Repeat1, Shuffle, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Cover } from "@/components/Cover";
import { Equalizer } from "@/components/Equalizer";
import { TrackMenu } from "@/components/TrackMenu";
import { IconButton, QueryError, RowSkeletons } from "@/components/ui";
import { useSavedSets } from "@/features/library/queries";
import { providers } from "@/providers/registry";
import { usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";
import type { Track } from "@/types/music";
import { formatDuration } from "@/utils/format";
import { useQueue } from "./queries";

export function QueuePanel({ variant, onClose }: { variant: "drawer" | "lyrics"; onClose: () => void }) {
  const nav = useNavigate();
  const state = usePlayer((s) => s.state);
  const active = usePlayer((s) => s.activeProvider);
  const p = usePlayer();
  const queue = useQueue();
  const current = state?.track ?? null;
  const caps = active ? providers[active].capabilities : null;
  const editable = !!caps?.queue.reorder && !!caps.queue.remove && state?.mode !== undefined;
  const upNext = queue.data?.upNext ?? [];
  const totalMs = (current?.durationMs ?? 0) + upNext.reduce((a, t) => a + t.durationMs, 0);
  const [clearing, setClearing] = useState(false);

  const header = variant === "drawer" ? (
    <div className="flex items-center gap-1 px-5 pt-5 pb-3">
      <h2 className="flex-1 font-display text-[22px] font-bold tracking-tight">Cola de reproducción</h2>
      <IconButton label="Aleatorio" active={state?.shuffle} disabled={!current || !caps?.playback.shuffle} onClick={p.toggleShuffle}><Shuffle className="size-[18px]" /></IconButton>
      <IconButton label="Repetir" active={!!state && state.repeat !== "off"} disabled={!current || !caps?.playback.repeat} onClick={p.cycleRepeat}>
        {state?.repeat === "one" ? <Repeat1 className="size-[18px]" /> : <Repeat className="size-[18px]" />}
      </IconButton>
      <IconButton label="Cerrar la cola" onClick={onClose}><X className="size-5" /></IconButton>
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-3 pb-4">
      <IconButton label="Volver a la letra" onClick={onClose}><ArrowLeft className="size-5" /></IconButton>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-[28px] leading-tight font-bold tracking-tight">Cola de reproducción</h2>
        {current && (
          <div className="text-[13px] text-muted">
            {upNext.length + 1} canciones · {Math.round(totalMs / 60_000)} min
          </div>
        )}
      </div>
      <button onClick={() => nav("/buscar")} className="glass flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium hover:bg-hover">
        <Plus className="size-4" /> Añadir canciones
      </button>
      {editable && (
        <button
          disabled={clearing || upNext.length === 0}
          onClick={async () => { setClearing(true); try { await p.clearQueue(); } finally { setClearing(false); } }}
          className="glass flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium hover:bg-hover disabled:opacity-40"
        >
          {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Vaciar cola
        </button>
      )}
    </div>
  );

  return (
    <div className={clsx("flex min-h-0 flex-col", variant === "drawer" ? "h-full" : "h-full")}>
      {header}
      <div className={clsx("scroll-area min-h-0 flex-1", variant === "drawer" ? "px-3 pb-4" : "pr-2 pb-6")}>
        {!current ? (
          <p className="px-2 py-10 text-center text-[13px] text-muted">No hay nada sonando. Reproduce algo para ver lo que viene después.</p>
        ) : (
          <>
            <SectionLabel>Sonando ahora</SectionLabel>
            <div className="mb-4 flex items-center gap-3 rounded-[14px] border border-accent/50 bg-accent/15 px-2.5 py-2">
              <Equalizer paused={!state?.isPlaying} />
              <Cover artwork={current.artwork} className="size-11 shrink-0" rounded="rounded-[8px]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{current.name}</div>
                <div className="truncate text-[12.5px] text-muted">{current.artistNames.join(", ")}</div>
              </div>
              <span className="text-[12.5px] text-muted tabular-nums">{formatDuration(current.durationMs)}</span>
              <RowActions track={current} />
            </div>

            <SectionLabel>A continuación{queue.data ? ` (${upNext.length})` : ""}</SectionLabel>
            {queue.isLoading && <RowSkeletons count={5} />}
            {queue.error != null && <QueryError error={queue.error} onRetry={() => queue.refetch()} />}
            {queue.data && upNext.length === 0 && <p className="px-2 py-4 text-[13px] text-muted">No hay más canciones en la cola.</p>}
            {queue.data && upNext.length > 0 && <QueueList tracks={upNext} editable={editable} />}
            {editable && active === "spotify" && state?.mode !== "preview" && (
              <p className="mt-4 px-2 text-[11.5px] leading-relaxed text-faint">
                Spotify no deja editar su cola directamente: al quitar, reordenar o vaciar, Cartucho le reenvía la lista y la canción sigue donde iba (puede notarse un corte breve).
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="mb-2 px-2 text-[14px] font-semibold">{children}</div>;
}

function RowActions({ track }: { track: Track }) {
  const saved = useSavedSets([track])[track.provider]?.has(track.id) ?? false;
  const caps = providers[track.provider].capabilities;
  return (
    <div className="flex items-center">
      {(caps.library.write || caps.library.playlistWrite) && (
        <button
          onClick={() => useUi.getState().openSaveDialog(track)}
          aria-label="Guardar en…"
          className={clsx("grid size-8 place-items-center rounded-full hover:bg-hover", saved ? "text-accent" : "text-muted hover:text-fg")}
        >
          <Heart className={clsx("size-4", saved && "fill-current")} />
        </button>
      )}
      <TrackMenu track={track} saved={saved} />
    </div>
  );
}

interface Item { key: string; track: Track }
const toItems = (tracks: Track[]): Item[] => tracks.map((t, i) => ({ key: `${t.id}:${i}`, track: t }));

/** «A continuación»: arrastrar para reordenar y quitar con la ×, si el servicio lo permite. */
export function QueueList({ tracks, editable }: { tracks: Track[]; editable: boolean }) {
  const [items, setItems] = useState<Item[]>(() => toItems(tracks));
  const [busy, setBusy] = useState(false);
  const removeFromQueue = usePlayer((s) => s.removeFromQueue);
  const moveInQueue = usePlayer((s) => s.moveInQueue);
  const dragStart = useRef<Item[] | null>(null);

  // Se sincroniza con la cola real cuando no hay una edición en curso.
  useEffect(() => { if (!busy && !dragStart.current) setItems(toItems(tracks)); }, [tracks, busy]);

  const commit = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const onDragEnd = (moved: Item) => {
    const before = dragStart.current;
    dragStart.current = null;
    if (!before) return;
    const from = before.findIndex((x) => x.key === moved.key);
    const to = items.findIndex((x) => x.key === moved.key);
    if (from !== to && from >= 0 && to >= 0) void commit(() => moveInQueue(from, to));
  };

  if (!editable) {
    return <div className="flex flex-col">{items.map((it) => <Row key={it.key} item={it} />)}</div>;
  }
  return (
    <div className={clsx("relative", busy && "pointer-events-none opacity-60")} aria-busy={busy}>
      <Reorder.Group axis="y" values={items} onReorder={setItems} className="flex flex-col">
        {items.map((it, i) => (
          <EditableRow
            key={it.key}
            item={it}
            onDragStart={() => { dragStart.current ??= items; }}
            onDragEnd={() => onDragEnd(it)}
            onRemove={() => {
              setItems((xs) => xs.filter((x) => x.key !== it.key));
              void commit(() => removeFromQueue(i));
            }}
          />
        ))}
      </Reorder.Group>
    </div>
  );
}

function RowBody({ t, grip, onRemove }: { t: Track; grip?: ReactNode; onRemove?: () => void }) {
  return (
    <>
      {grip ?? <span className="w-6" />}
      <Cover artwork={t.artwork} className="size-11 shrink-0" rounded="rounded-[8px]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{t.name}</div>
        <div className="truncate text-[12.5px] text-muted">{t.artistNames.join(", ")}</div>
      </div>
      <span className="text-[12.5px] text-muted tabular-nums">{formatDuration(t.durationMs)}</span>
      <RowActions track={t} />
      {onRemove && (
        <button aria-label={`Quitar ${t.name} de la cola`} onClick={onRemove} className="grid size-8 place-items-center rounded-full text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-hover hover:text-red-400 focus:opacity-100">
          <X className="size-4" />
        </button>
      )}
    </>
  );
}

function Row({ item }: { item: Item }) {
  return <div className="group flex items-center gap-3 rounded-[12px] px-2 py-1.5 hover:bg-hover"><RowBody t={item.track} /></div>;
}

function EditableRow({ item, onDragStart, onDragEnd, onRemove }: { item: Item; onDragStart: () => void; onDragEnd: () => void; onRemove: () => void }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group relative flex items-center gap-3 rounded-[12px] px-2 py-1.5 hover:bg-hover"
    >
      <RowBody
        t={item.track}
        onRemove={onRemove}
        grip={(
          <button
            aria-label="Arrastrar para reordenar"
            onPointerDown={(e) => controls.start(e)}
            className="grid h-9 w-6 cursor-grab touch-none place-items-center text-faint active:cursor-grabbing group-hover:text-muted"
          >
            <GripVertical className="size-4" />
          </button>
        )}
      />
    </Reorder.Item>
  );
}
