/**
 * Letra sincronizada, estilo karaoke:
 * - El verso que suena se ve grande, con una barra de acento y un brillo detrás.
 * - Su texto se va rellenando de izquierda a derecha mientras se canta. El relleno es una
 *   animación CSS (no se redibuja React en cada fotograma), así que apenas consume.
 * - Los demás versos se atenúan; la letra se desplaza sola para centrar el verso actual.
 * - Tocar un verso salta a ese momento.
 */
import clsx from "clsx";
import { Loader2, MicVocal } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLightMode } from "@/hooks/usePerformance";
import { IS_MOBILE } from "@/utils/platform";
import { usePlayer } from "@/stores/player";
import { LYRICS_SIZES, useLyricsPrefs } from "@/stores/lyrics";
import type { Track } from "@/types/music";
import { currentPositionMs, lineDurationMs, useActiveLine } from "./useActiveLine";
import { useLyrics } from "./useLyrics";

export function LyricsView({ track, compact = false, className }: { track: Track; compact?: boolean; className?: string }) {
  const enabled = useLyricsPrefs((s) => s.enabled);
  const size = useLyricsPrefs((s) => s.size);
  const lyrics = useLyrics(track);
  const playback = usePlayer((s) => s.state);
  const seek = usePlayer((s) => s.seek);
  const light = useLightMode();
  const isCurrent = playback?.track?.id === track.id;

  const lines = lyrics.data?.kind === "synced" ? lyrics.data.lines : null;
  const active = useActiveLine(isCurrent ? lines : null);

  const viewport = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLElement | null)[]>([]);
  const [offset, setOffset] = useState(0);
  const basePx = LYRICS_SIZES[size].px;
  // Pantalla de letra: tamaño elegido (algo menor en el teléfono); panel compacto: ~40 %.
  const px = compact ? Math.round(basePx * 0.42) : IS_MOBILE ? Math.round(basePx * 0.62) : basePx;

  // Centra el verso actual desplazando la lista (transform: barato y suave).
  useLayoutEffect(() => {
    const box = viewport.current;
    const el = lineRefs.current[Math.max(active, 0)];
    if (!box || !el) return;
    setOffset(Math.max(0, el.offsetTop + el.offsetHeight / 2 - box.clientHeight * (compact ? 0.4 : 0.45)));
  }, [active, px, lines, compact]);

  if (!enabled) return <Message compact={compact}>Las letras están desactivadas en Ajustes → Reproducción.</Message>;
  if (lyrics.isLoading) return <Message compact={compact}><Loader2 className="size-5 animate-spin" /></Message>;
  if (lyrics.error) return <Message compact={compact}>No se pudo cargar la letra. Revisa la conexión.</Message>;
  const data = lyrics.data;
  if (!data || data.kind === "none") return <Message compact={compact}>No hay letra para esta canción en LRCLIB.</Message>;
  if (data.kind === "instrumental") return <Message compact={compact}>♪ Instrumental ♪</Message>;

  if (data.kind === "plain") {
    return (
      <div className={clsx("scroll-area min-h-0", className)}>
        <p className="font-display font-bold whitespace-pre-line text-fg/80" style={{ fontSize: px * 0.8, lineHeight: 1.35 }}>{data.text}</p>
        <p className="mt-6 text-[11px] text-faint">Letra: LRCLIB · sin sincronizar</p>
      </div>
    );
  }

  const elapsedInLine = active >= 0 ? currentPositionMs() - data.lines[active].timeMs : 0;

  return (
    <div ref={viewport} className={clsx("relative min-h-0 overflow-hidden [mask-image:linear-gradient(transparent,black_14%,black_84%,transparent)]", className)}>
      <div
        className="transition-transform duration-700 ease-[cubic-bezier(.2,.8,.2,1)] will-change-transform"
        style={{ transform: `translateY(${-offset}px)`, paddingTop: compact ? "35%" : "40vh", paddingBottom: compact ? "35%" : "40vh" }}
      >
        {data.lines.map((l, i) => {
          const isActive = i === active;
          const distance = Math.abs(i - active);
          return (
            <div
              key={i}
              ref={(el) => { lineRefs.current[i] = el; }}
              className={clsx("relative", compact ? "py-1" : "py-2.5")}
            >
              {isActive && !compact && <ActiveGlow light={light} />}
              {isActive && <span className={clsx("absolute top-1/2 -translate-y-1/2 rounded-full bg-accent", compact ? "-left-2.5 h-[60%] w-[3px]" : "-left-5 h-[70%] w-1 shadow-[0_0_14px_var(--accent)]")} />}
              <button
                onClick={() => isCurrent && void seek(l.timeMs)}
                disabled={!isCurrent}
                className={clsx(
                  "relative block max-w-full text-left font-display font-bold tracking-tight transition-[font-size,opacity,color] duration-500 ease-out",
                  !isActive && (i < active ? "text-fg/45" : "text-fg/35"),
                  !isActive && "hover:text-fg/70",
                  !isActive && distance > 3 && "opacity-70",
                )}
                style={{ fontSize: isActive ? px : px * 0.74, lineHeight: 1.2 }}
              >
                {isActive && l.text ? (
                  <span
                    key={`${i}:${playback?.timestamp}:${playback?.isPlaying}`}
                    className={clsx("karaoke", !light && !compact && "karaoke-glow")}
                    style={{
                      "--karaoke-dur": `${lineDurationMs(data.lines, i)}ms`,
                      "--karaoke-delay": `${-Math.max(0, elapsedInLine)}ms`,
                      animationPlayState: playback?.isPlaying ? "running" : "paused",
                    } as CSSProperties}
                  >
                    {l.text}
                  </span>
                ) : (
                  l.text || "♪"
                )}
              </button>
            </div>
          );
        })}
      </div>
      <p className={clsx("absolute text-faint", compact ? "right-1 bottom-0 text-[10.5px]" : "right-2 bottom-2 text-[11px]")}>Letra: LRCLIB</p>
    </div>
  );
}

/** Ondas de luz detrás del verso actual. En modo ligero, un halo simple. */
function ActiveGlow({ light }: { light: boolean }) {
  if (light) {
    return (
      <span
        className="pointer-events-none absolute inset-y-[-20%] -left-8 right-0"
        style={{ background: "radial-gradient(ellipse 60% 50% at 40% 50%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%)" }}
        aria-hidden
      />
    );
  }
  return (
    <svg className="karaoke-wave pointer-events-none absolute -top-[40%] -left-10 h-[180%] w-[calc(100%+5rem)]" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="kw" x1="0" x2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0" />
          <stop offset="0.35" stopColor="var(--accent)" stopOpacity="0.9" />
          <stop offset="0.75" stopColor="var(--accent)" stopOpacity="0.7" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <filter id="kwb" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      <ellipse cx="320" cy="60" rx="260" ry="34" fill="var(--accent)" opacity="0.10" filter="url(#kwb)" />
      <path d="M20 78 C140 30 220 98 330 64 S520 40 590 70" fill="none" stroke="url(#kw)" strokeWidth="6" filter="url(#kwb)" opacity="0.8" />
      <path d="M20 78 C140 30 220 98 330 64 S520 40 590 70" fill="none" stroke="url(#kw)" strokeWidth="1.6" />
      <path d="M60 92 C170 60 260 104 360 82 S520 66 580 86" fill="none" stroke="url(#kw)" strokeWidth="1" opacity="0.6" />
    </svg>
  );
}

function Message({ children, compact }: { children: ReactNode; compact: boolean }) {
  return (
    <div className={clsx("grid place-items-center text-center text-muted", compact ? "py-8 text-[13px]" : "h-full py-24 text-[15px]")}>
      <div className="flex flex-col items-center gap-3">{!compact && <MicVocal className="size-6 text-faint" />}{children}</div>
    </div>
  );
}
