import clsx from "clsx";
import { Reorder, useDragControls } from "framer-motion";
import { ArrowDown, ArrowUp, GripVertical, ListOrdered, Loader2, Lock, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Cover } from "@/components/Cover";
import { ProviderBadge } from "@/components/ProviderBadge";
import { TrackList } from "@/components/TrackList";
import { EmptyState, Notice, PageHeader, QueryError, RowSkeletons } from "@/components/ui";
import { Equalizer } from "@/components/Equalizer";
import { usePlayer } from "@/stores/player";
import { useQueue } from "@/features/queue/queries";
import { providers } from "@/providers/registry";
import { formatDuration } from "@/utils/format";
import type { Track } from "@/types/music";

export function QueuePage() {
  const state = usePlayer((s) => s.state);
  const active = usePlayer((s) => s.activeProvider);
  const queue = useQueue();
  const current = state?.track;

  if (!active || !current) {
    return (
      <>
        <PageHeader title="Cola de reproducción" />
        <EmptyState icon={<ListOrdered className="size-6" />} title="No hay nada sonando">
          Reproduce un álbum, una playlist o una canción para ver aquí lo que viene después.
        </EmptyState>
      </>
    );
  }
  const p = providers[active];
  const caps = p.capabilities.queue;
  const editable = caps.reorder && caps.remove;
  const restrictions = [!caps.reorder && "reordenar", !caps.remove && "quitar"].filter(Boolean);

  return (
    <>
      <PageHeader eyebrow={`Servicio activo · ${p.name}`} title="Cola de reproducción" />

      <div className="eyebrow mb-3">Sonando ahora</div>
      <div className="mb-8 flex items-center gap-4 rounded-[var(--radius-card)] border border-line bg-hover p-3">
        <Cover artwork={current.artwork} className="size-16" rounded="rounded-[calc(var(--radius-cover)*0.7)]" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-accent">{current.name}</div>
          <div className="truncate text-[13px] text-muted">{current.artistNames.join(", ")} · {current.albumName}</div>
        </div>
        <Equalizer paused={!state?.isPlaying} />
        <ProviderBadge provider={current.provider} />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <div className="eyebrow">A continuación</div>
        {restrictions.length > 0 && <span className="flex items-center gap-1.5 text-[12px] text-muted"><Lock className="size-3" /> Solo lectura</span>}
      </div>
      {restrictions.length > 0 && (
        <div className="mb-4">
          <Notice>La API de {p.name} no permite {restrictions.join(" ni ")} elementos de la cola.</Notice>
        </div>
      )}
      {editable && active === "spotify" && state?.mode !== "preview" && (
        <div className="mb-4">
          <Notice>
            Spotify no deja editar su cola directamente: al quitar o reordenar, Cartucho le reenvía la lista y la canción actual continúa donde iba
            (puede notarse un corte breve). Las canciones añadidas a la cola desde otras apps de Spotify se mantienen aparte.
          </Notice>
        </div>
      )}
      {queue.isLoading && <RowSkeletons count={4} />}
      {queue.error != null && <QueryError error={queue.error} onRetry={() => queue.refetch()} />}
      {queue.data && (queue.data.upNext.length === 0
        ? <p className="py-6 text-[13px] text-muted">No hay más canciones en la cola.</p>
        : editable ? <EditableQueue tracks={queue.data.upNext} />
        : <TrackList tracks={queue.data.upNext} numbered />)}
    </>
  );
}

interface Item { key: string; track: Track }
const toItems = (tracks: Track[]): Item[] => tracks.map((t, i) => ({ key: `${t.id}:${i}`, track: t }));

/** «A continuación» editable: arrastrar para reordenar, botones para subir/bajar/quitar. */
function EditableQueue({ tracks }: { tracks: Track[] }) {
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

  return (
    <div className={clsx("relative", busy && "pointer-events-none opacity-60")} aria-busy={busy}>
      {busy && <Loader2 className="absolute -top-8 right-0 size-4 animate-spin text-muted" aria-label="Aplicando cambios" />}
      <Reorder.Group axis="y" values={items} onReorder={setItems} className="flex flex-col">
        {items.map((it, i) => (
          <QueueRow
            key={it.key}
            item={it}
            index={i}
            last={i === items.length - 1}
            onDragStart={() => { dragStart.current ??= items; }}
            onDragEnd={() => onDragEnd(it)}
            onUp={() => void commit(() => moveInQueue(i, i - 1))}
            onDown={() => void commit(() => moveInQueue(i, i + 1))}
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

function QueueRow({ item, index, last, onDragStart, onDragEnd, onUp, onDown, onRemove }: {
  item: Item; index: number; last: boolean;
  onDragStart: () => void; onDragEnd: () => void; onUp: () => void; onDown: () => void; onRemove: () => void;
}) {
  const controls = useDragControls();
  const t = item.track;
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group relative flex items-center gap-3 rounded-[var(--radius-control)] bg-[var(--bg)] px-2 py-[var(--row-py)] hover:bg-hover"
    >
      <button
        aria-label="Arrastrar para reordenar"
        onPointerDown={(e) => controls.start(e)}
        className="grid h-8 w-6 cursor-grab touch-none place-items-center text-faint active:cursor-grabbing group-hover:text-muted"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="w-5 text-right text-[12.5px] text-muted tabular-nums">{index + 1}</span>
      <Cover artwork={t.artwork} className="size-10 shrink-0" rounded="rounded-[calc(var(--radius-cover)*0.45)]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{t.name}</div>
        <div className="truncate text-[12.5px] text-muted">{t.artistNames.join(", ")}</div>
      </div>
      <span className="text-[12.5px] text-muted tabular-nums">{formatDuration(t.durationMs)}</span>
      <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button aria-label={`Subir ${t.name}`} disabled={index === 0} onClick={onUp} className="grid size-7 place-items-center rounded-full text-muted hover:bg-hover hover:text-fg disabled:opacity-25">
          <ArrowUp className="size-4" />
        </button>
        <button aria-label={`Bajar ${t.name}`} disabled={last} onClick={onDown} className="grid size-7 place-items-center rounded-full text-muted hover:bg-hover hover:text-fg disabled:opacity-25">
          <ArrowDown className="size-4" />
        </button>
        <button aria-label={`Quitar ${t.name} de la cola`} onClick={onRemove} className="grid size-7 place-items-center rounded-full text-muted hover:bg-hover hover:text-red-400">
          <X className="size-4" />
        </button>
      </div>
    </Reorder.Item>
  );
}
