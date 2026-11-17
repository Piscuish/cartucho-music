import clsx from "clsx";
import { IS_MOBILE } from "@/utils/platform";
import { endTrackDrag, startTrackDrag } from "@/features/library/dragTrack";
import { Heart, Play } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Track } from "@/types/music";
import type { PlayContext } from "@/providers/types";
import { usePlayer } from "@/stores/player";
import { providers } from "@/providers/registry";
import { useSavedSets, useToggleSaved } from "@/features/library/queries";
import { useScrollContainer } from "@/layouts/scrollContainer";
import { formatDuration } from "@/utils/format";
import { routes } from "@/utils/routes";
import { Cover } from "./Cover";
import { ProviderBadge } from "./ProviderBadge";
import { Equalizer } from "./Equalizer";
import { TrackMenu } from "./TrackMenu";

/** Contexto de reproducción opcional (p. ej. el álbum), para que el servicio continúe con él. */
export type ListContext = { kind: "album" | "playlist"; id: string };

/** A partir de este número de filas se virtualiza. */
const VIRTUALIZE_FROM = 80;
/** Tamaño de bloque para consultar "guardada" solo de lo visible (máx. de Spotify: 40). */
const SAVED_BLOCK = 40;

interface Props {
  tracks: Track[];
  context?: ListContext;
  showCover?: boolean;
  showAlbum?: boolean;
  numbered?: boolean;
  /** Todas las canciones están guardadas (p. ej. Favoritos): evita consultarlo. */
  allSaved?: boolean;
}

/**
 * Lista de canciones. Al reproducir una fila, la cola contiene solo canciones
 * del MISMO proveedor que la fila (nunca se mezclan servicios).
 * Las listas largas se virtualizan: solo existen en el DOM las filas visibles.
 */
export function TrackList(props: Props) {
  const { tracks } = props;
  const scroller = useScrollContainer();
  const listRef = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(0);
  const virtual = tracks.length >= VIRTUALIZE_FROM && !!scroller;

  // Distancia entre el inicio del contenedor de scroll y la lista.
  useLayoutEffect(() => {
    if (!virtual) return;
    const measure = () => {
      const s = scroller?.current, l = listRef.current;
      if (!s || !l) return;
      setMargin(l.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop);
    };
    measure();
    const t = setTimeout(measure, 350); // tras la animación de entrada de la página
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); };
  }, [virtual, scroller]);

  const rowHeight = props.showCover === false ? 46 : 58;
  const virtualizer = useVirtualizer({
    count: virtual ? tracks.length : 0,
    getScrollElement: () => scroller?.current ?? null,
    estimateSize: () => rowHeight,
    overscan: 12,
    scrollMargin: margin,
  });
  const items = virtualizer.getVirtualItems();

  // Solo los bloques visibles consultan su estado de "guardada".
  const visibleForSaved = useMemo(() => {
    if (props.allSaved) return [];
    if (!virtual) return tracks;
    if (!items.length) return tracks.slice(0, SAVED_BLOCK);
    const from = Math.floor(items[0].index / SAVED_BLOCK) * SAVED_BLOCK;
    const to = (Math.floor(items[items.length - 1].index / SAVED_BLOCK) + 1) * SAVED_BLOCK;
    return tracks.slice(from, to);
  }, [props.allSaved, virtual, tracks, items[0]?.index, items[items.length - 1]?.index]); // eslint-disable-line react-hooks/exhaustive-deps
  const saved = useSavedSets(visibleForSaved);

  const row = (t: Track, i: number) => (
    <TrackRow key={`${t.provider}:${t.id}:${i}`} {...props} track={t} index={i} saved={props.allSaved || (saved[t.provider]?.has(t.id) ?? false)} />
  );

  if (!virtual) return <div role="list" className="flex flex-col">{tracks.map(row)}</div>;

  return (
    <div role="list" ref={listRef} className="relative" style={{ height: virtualizer.getTotalSize() }}>
      {items.map((vi) => (
        <div
          key={vi.key}
          data-index={vi.index}
          ref={virtualizer.measureElement}
          className="absolute top-0 left-0 w-full"
          style={{ transform: `translateY(${vi.start - margin}px)` }}
        >
          {row(tracks[vi.index], vi.index)}
        </div>
      ))}
    </div>
  );
}

function TrackRow({ track: t, index: i, tracks, context, showCover = true, showAlbum = true, numbered = false, saved }: Props & { track: Track; index: number; saved: boolean }) {
  const active = usePlayer((s) => s.state?.track?.id === t.id && s.state.track.provider === t.provider);
  const isPlaying = usePlayer((s) => s.state?.isPlaying ?? false);
  const play = usePlayer((s) => s.play);
  const toggleSaved = useToggleSaved();
  const canSave = providers[t.provider].capabilities.library.write;

  const playAt = () => {
    let ctx: PlayContext;
    if (context) ctx = { ...context, startTrackId: t.id };
    else {
      const same = tracks.filter((x) => x.provider === t.provider);
      ctx = { kind: "tracks", trackIds: same.map((x) => x.id), startIndex: same.indexOf(t) };
    }
    void play(t.provider, ctx);
  };
  const onToggleSaved = () => toggleSaved.mutate({ track: t, saved });

  return (
    <div
      role="listitem"
      onDoubleClick={playAt}
      // Arrastrar la fila a una playlist o a Favoritos de la barra lateral (en el teléfono no).
      draggable={!IS_MOBILE}
      onDragStart={IS_MOBILE ? undefined : (e) => startTrackDrag(e, t)}
      onDragEnd={IS_MOBILE ? undefined : endTrackDrag}
      // En el teléfono no hay doble clic: basta un toque en la fila (salvo en enlaces y botones).
      onClick={IS_MOBILE ? (e) => { if (!(e.target as Element).closest("a,button")) playAt(); } : undefined}
      className={clsx(
        "group grid items-center gap-4 rounded-[var(--radius-control)] px-3 py-[var(--row-py)] transition-colors hover:bg-hover max-sm:gap-3 max-sm:px-1.5",
        showAlbum ? "grid-cols-[28px_minmax(0,1.4fr)_minmax(0,1fr)_auto] max-sm:grid-cols-[22px_minmax(0,1fr)_auto]" : "grid-cols-[28px_minmax(0,1fr)_auto] max-sm:grid-cols-[22px_minmax(0,1fr)_auto]",
        active && "bg-hover",
      )}
    >
      <button onClick={playAt} aria-label={`Reproducir ${t.name}`} className="grid h-8 place-items-center text-[13px] text-muted tabular-nums">
        {active && isPlaying ? (
          <Equalizer className="group-hover:hidden" />
        ) : (
          <span className="group-hover:hidden">{numbered ? i + 1 : <ProviderBadge provider={t.provider} compact />}</span>
        )}
        <Play className="hidden size-4 fill-current text-fg group-hover:block" />
      </button>

      <div className="flex min-w-0 items-center gap-3">
        {showCover && <Cover artwork={t.artwork} className="size-10 shrink-0" rounded="rounded-[calc(var(--radius-cover)*0.45)]" />}
        <div className="min-w-0">
          <div className={clsx("truncate text-[14px] font-medium", active && "text-accent")}>
            {t.name}
            {t.explicit && <span title="Explícito" className="ml-2 rounded-[3px] bg-faint/40 px-1 align-middle text-[9px] font-bold text-muted">E</span>}
          </div>
          <div className="truncate text-[12.5px] text-muted">
            {t.artistIds.map((id, k) => (
              <span key={id}>
                {k > 0 && ", "}
                <Link to={routes.artist(t.provider, id)} className="hover:text-fg hover:underline">{t.artistNames[k]}</Link>
              </span>
            ))}
          </div>
        </div>
      </div>

      {showAlbum && (
        <Link to={routes.album(t.provider, t.albumId)} className="truncate text-[13px] text-muted hover:text-fg hover:underline max-sm:hidden">
          {t.albumName}
        </Link>
      )}

      <div className="flex items-center gap-2">
        {canSave && (
          <button
            aria-label={saved ? "Quitar de favoritos" : "Añadir a favoritos"}
            onClick={onToggleSaved}
            className={clsx("transition-opacity", saved ? "text-accent" : "text-muted opacity-0 group-hover:opacity-100 hover:text-fg")}
          >
            <Heart className={clsx("size-4", saved && "fill-current")} />
          </button>
        )}
        <span className="w-10 text-right text-[12.5px] text-muted tabular-nums">{formatDuration(t.durationMs)}</span>
        <TrackMenu track={t} saved={saved} onToggleSaved={onToggleSaved} />
      </div>
    </div>
  );
}
