/**
 * Letra sincronizada: el verso que suena se agranda y se ilumina, los demás se atenúan, la
 * letra avanza sola y tocar un verso salta a ese momento. Si el usuario se desplaza a mano,
 * el seguimiento se pausa unos segundos.
 */
import clsx from "clsx";
import { Loader2, MicVocal, Minus, Plus, Type } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IconButton } from "@/components/ui";
import { usePlaybackPosition, usePlayer } from "@/stores/player";
import { LYRICS_SIZES, useLyricsPrefs } from "@/stores/lyrics";
import type { Track } from "@/types/music";
import { activeLineIndex } from "./lrc";
import { useLyrics } from "./useLyrics";

/** Pequeño adelanto: la letra aparece un instante antes, como en Spotify. */
const LEAD_MS = 250;

export function LyricsView({ track, compact = false, className }: { track: Track; compact?: boolean; className?: string }) {
  const enabled = useLyricsPrefs((s) => s.enabled);
  const size = useLyricsPrefs((s) => s.size);
  const lyrics = useLyrics(track);
  const position = usePlaybackPosition();
  const seek = usePlayer((s) => s.seek);
  const canSeek = usePlayer((s) => s.state?.track?.id === track.id);
  const scroller = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [manualUntil, setManualUntil] = useState(0);

  const lines = lyrics.data?.kind === "synced" ? lyrics.data.lines : null;
  const active = useMemo(() => (lines ? activeLineIndex(lines, position + LEAD_MS) : -1), [lines, position]);
  const px = compact ? Math.round(LYRICS_SIZES[size].px * 0.62) : LYRICS_SIZES[size].px;

  useEffect(() => {
    if (!lines || Date.now() < manualUntil) return;
    const el = lineRefs.current[Math.max(active, 0)];
    const box = scroller.current;
    if (!el || !box) return;
    const top = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
    box.scrollTo({ top, behavior: "smooth" });
  }, [active, lines, manualUntil, px]);

  if (!enabled) return <Message compact={compact}>Las letras están desactivadas en Ajustes → Reproducción.</Message>;
  if (lyrics.isLoading) return <Message compact={compact}><Loader2 className="size-5 animate-spin" /></Message>;
  if (lyrics.error) return <Message compact={compact}>No se pudo cargar la letra. Revisa la conexión.</Message>;
  const data = lyrics.data;
  if (!data || data.kind === "none") return <Message compact={compact}>No hay letra para esta canción en LRCLIB.</Message>;
  if (data.kind === "instrumental") return <Message compact={compact}>♪ Instrumental ♪</Message>;

  const userScrolled = () => setManualUntil(Date.now() + 3500);

  return (
    <div className={clsx("relative min-h-0", className)}>
      <div
        ref={scroller}
        onWheel={userScrolled}
        onTouchMove={userScrolled}
        className={clsx("scroll-area h-full [mask-image:linear-gradient(transparent,black_12%,black_88%,transparent)]", compact ? "px-1 py-[30%]" : "px-2 py-[38vh]")}
        style={{ scrollbarWidth: "none" }}
      >
        {data.kind === "plain" ? (
          <p className="font-display font-bold whitespace-pre-line text-fg/85" style={{ fontSize: px, lineHeight: 1.3 }}>{data.text}</p>
        ) : (
          data.lines.map((l, i) => {
            const state = i === active ? "active" : i < active ? "past" : "future";
            return (
              <button
                key={i}
                ref={(el) => { lineRefs.current[i] = el; }}
                onClick={() => canSeek && void seek(l.timeMs)}
                disabled={!canSeek}
                className={clsx(
                  "block w-full origin-left text-left font-display font-bold tracking-tight transition-all duration-500 ease-out",
                  compact ? "py-1" : "py-2",
                  state === "active" && "scale-[1.06] text-fg [text-shadow:0_0_28px_color-mix(in_srgb,var(--accent)_45%,transparent)]",
                  state === "past" && "text-fg/45",
                  state === "future" && "text-fg/25 hover:text-fg/60",
                  !l.text && "min-h-[0.6em]",
                )}
                style={{ fontSize: px, lineHeight: 1.22 }}
              >
                {l.text || "♪"}
              </button>
            );
          })
        )}
      </div>
      {Date.now() < manualUntil && !compact && (
        <button
          onClick={() => setManualUntil(0)}
          className="glass absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-[12.5px] font-medium shadow-[var(--shadow)]"
        >
          Volver al verso actual
        </button>
      )}
      <p className={clsx("text-faint", compact ? "mt-1 text-[10.5px]" : "absolute right-2 bottom-1 text-[11px]")}>
        Letra: LRCLIB{data.kind === "plain" ? " · sin sincronizar" : ""}
      </p>
    </div>
  );
}

function Message({ children, compact }: { children: ReactNode; compact: boolean }) {
  return (
    <div className={clsx("grid place-items-center text-center text-muted", compact ? "py-8 text-[13px]" : "h-full py-24 text-[15px]")}>
      <div className="flex flex-col items-center gap-3">{!compact && <MicVocal className="size-6 text-faint" />}{children}</div>
    </div>
  );
}

/** Botones A− / A+ para el tamaño de la letra (junto al volumen y en la vista de letra). */
export function LyricsSizeControl({ compact = false }: { compact?: boolean }) {
  const { size, bigger, smaller } = useLyricsPrefs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const controls = (
    <div className="flex items-center gap-1">
      <IconButton label="Letra más pequeña" size="sm" disabled={size === 0} onClick={smaller}><Minus className="size-4" /></IconButton>
      <span className="w-24 text-center text-[12.5px] font-medium tabular-nums">{LYRICS_SIZES[size].label}</span>
      <IconButton label="Letra más grande" size="sm" disabled={size === LYRICS_SIZES.length - 1} onClick={bigger}><Plus className="size-4" /></IconButton>
    </div>
  );
  if (!compact) return <div className="glass rounded-full px-1.5 py-1">{controls}</div>;
  return (
    <div ref={ref} className="relative">
      <IconButton label="Tamaño de la letra" size="sm" active={open} onClick={() => setOpen(!open)}><Type className="size-4" /></IconButton>
      {open && (
        <div className="glass absolute right-0 bottom-11 z-50 rounded-[16px] p-2 shadow-[var(--shadow)]">
          <div className="eyebrow px-2 pb-1.5">Tamaño de la letra</div>
          {controls}
        </div>
      )}
    </div>
  );
}
