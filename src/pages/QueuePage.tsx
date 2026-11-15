import { ListOrdered, Lock } from "lucide-react";
import { Cover } from "@/components/Cover";
import { ProviderBadge } from "@/components/ProviderBadge";
import { TrackList } from "@/components/TrackList";
import { EmptyState, Notice, PageHeader, QueryError, RowSkeletons } from "@/components/ui";
import { Equalizer } from "@/components/Equalizer";
import { usePlayer } from "@/stores/player";
import { useQueue } from "@/features/queue/queries";
import { providers } from "@/providers/registry";

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
          <Notice>
            La API de {p.name} permite leer la cola y añadir canciones, pero no {restrictions.join(" ni ")} elementos. Cartucho Music no muestra esos controles para este servicio.
          </Notice>
        </div>
      )}
      {queue.isLoading && <RowSkeletons count={4} />}
      {queue.error != null && <QueryError error={queue.error} onRetry={() => queue.refetch()} />}
      {queue.data && (queue.data.upNext.length
        ? <TrackList tracks={queue.data.upNext} numbered />
        : <p className="py-6 text-[13px] text-muted">No hay más canciones en la cola.</p>)}
    </>
  );
}
