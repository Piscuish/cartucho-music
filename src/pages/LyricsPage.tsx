/**
 * Pantalla de letra a pantalla completa: portada y canción a la izquierda, letra karaoke a la
 * derecha y controles abajo. En el teléfono, la portada pasa a una cabecera pequeña.
 */
import clsx from "clsx";
import {
  Captions, ChevronDown, Heart, ListOrdered, Maximize2, Minimize2, Pause, Play, Repeat, Repeat1, Shuffle,
  SkipBack, SkipForward, Volume1, Volume2, VolumeX,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Cover } from "@/components/Cover";
import { IconButton } from "@/components/ui";
import { useSavedSets } from "@/features/library/queries";
import { LyricsView } from "@/features/lyrics/LyricsView";
import { DevicePicker } from "@/features/player/DevicePicker";
import { QueuePanel } from "@/features/queue/QueuePanel";
import { TrackMenu } from "@/components/TrackMenu";
import { DynamicBackground } from "@/layouts/DynamicBackground";
import { NpProgress } from "@/pages/NowPlayingPage";
import { providers } from "@/providers/registry";
import { usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";
import { isDesktopApp, IS_MOBILE } from "@/utils/platform";

export function LyricsPage() {
  const nav = useNavigate();
  const t = usePlayer((s) => s.state?.track ?? null);
  const [showQueue, setShowQueue] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && nav(-1);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-bg pt-[var(--titlebar-h)]">
      <DynamicBackground intensity={1.6} />
      <header className={clsx("relative z-10 flex items-center gap-3 py-3", IS_MOBILE ? "px-3" : "px-6")}>
        <IconButton label="Cerrar (Esc)" onClick={() => nav(-1)}><ChevronDown className="size-6" /></IconButton>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[15px] font-semibold">Cartucho Music</div>
          <div className="flex items-center gap-1.5 text-[12.5px] text-muted"><Captions className="size-3.5" /> Letras</div>
        </div>
        <IconButton label={showQueue ? "Ver la letra" : "Letra"} active={!showQueue} onClick={() => setShowQueue(false)}><Captions className="size-5" /></IconButton>
        <IconButton label="Cola" active={showQueue} onClick={() => setShowQueue(!showQueue)}><ListOrdered className="size-5" /></IconButton>
        {!IS_MOBILE && <FullscreenButton />}
      </header>

      {t ? (
        <div className={clsx("relative z-10 grid min-h-0 flex-1", IS_MOBILE ? "grid-rows-[auto_minmax(0,1fr)] gap-2 px-6" : "grid-cols-[minmax(240px,30%)_minmax(0,1fr)] items-center gap-14 px-14")}>
          <SongCard compact={IS_MOBILE} />
          {showQueue ? (
            <div className={clsx("h-full min-h-0 py-4", !IS_MOBILE && "pl-6")}>
              <QueuePanel variant="lyrics" onClose={() => setShowQueue(false)} />
            </div>
          ) : (
            <LyricsView track={t} className={clsx("h-full", !IS_MOBILE && "pl-6")} />
          )}
        </div>
      ) : (
        <div className="relative z-10 grid flex-1 place-items-center text-muted">No hay nada sonando.</div>
      )}

      <BottomBar />
    </div>
  );
}

function SongCard({ compact }: { compact: boolean }) {
  const t = usePlayer((s) => s.state?.track)!;
  const fav = useSavedSets([t])[t.provider]?.has(t.id) ?? false;
  const caps = providers[t.provider].capabilities;
  const canSave = caps.library.write || caps.library.playlistWrite;
  const heart = canSave && (
    <button onClick={() => useUi.getState().openSaveDialog(t)} aria-label="Guardar en…" title="Guardar en…" className={clsx("shrink-0 transition-transform hover:scale-110", fav ? "text-accent" : "text-muted hover:text-fg")}>
      <Heart className={clsx(compact ? "size-5" : "size-7", fav && "fill-current")} />
    </button>
  );
  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <Cover artwork={t.artwork} className="size-14 shrink-0" rounded="rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-bold uppercase">{t.name}</div>
          <div className="truncate text-[13px] text-muted">{t.artistNames.join(", ")}</div>
        </div>
        {heart}
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      <div className="relative">
        <div className="absolute -inset-3 rounded-[26px] bg-accent/25 blur-2xl" aria-hidden />
        <Cover artwork={t.artwork} className="relative aspect-square w-full ring-2 ring-accent/70" rounded="rounded-[18px]" />
      </div>
      <div className="mt-6 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-display text-[clamp(20px,2.2vw,30px)] leading-tight font-bold uppercase">{t.name}</div>
          <div className="mt-1 truncate text-[15px] text-muted">{t.artistNames.join(", ")}</div>
        </div>
        {heart}
      </div>
    </div>
  );
}

function BottomBar() {
  const p = usePlayer();
  const state = p.state;
  const t = state?.track ?? null;
  const caps = t ? providers[t.provider].capabilities : null;
  const nav = useNavigate();
  const volume = state?.volume ?? 0;
  const VolIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const fav = useSavedSets(t ? [t] : [])[t?.provider ?? "spotify"]?.has(t?.id ?? "") ?? false;

  return (
    <div className={clsx("relative z-10 flex items-center gap-4 border-t border-line/60 py-3", IS_MOBILE ? "flex-wrap px-4 pb-[calc(var(--safe-bottom)+12px)]" : "px-6")}>
      <div className={clsx("flex items-center gap-1.5", IS_MOBILE && "order-2 w-full justify-center")}>
        <IconButton label="Aleatorio" active={state?.shuffle} disabled={!t || !caps?.playback.shuffle} onClick={p.toggleShuffle}><Shuffle className="size-5" /></IconButton>
        <IconButton label="Anterior" disabled={!t} onClick={p.previous}><SkipBack className="size-5 fill-current" /></IconButton>
        <button
          onClick={p.toggle} disabled={!t} aria-label={state?.isPlaying ? "Pausar" : "Reproducir"}
          className="mx-1 grid size-12 place-items-center rounded-full bg-fg text-bg transition-transform hover:scale-105 disabled:opacity-30"
        >
          {state?.isPlaying ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
        </button>
        <IconButton label="Siguiente" disabled={!t} onClick={p.next}><SkipForward className="size-5 fill-current" /></IconButton>
        <IconButton label="Repetir" active={!!state && state.repeat !== "off"} disabled={!t || !caps?.playback.repeat} onClick={p.cycleRepeat}>
          {state?.repeat === "one" ? <Repeat1 className="size-5" /> : <Repeat className="size-5" />}
        </IconButton>
        {IS_MOBILE && <DevicePicker />}
      </div>

      <div className={clsx("flex min-w-0 flex-1 flex-col", IS_MOBILE && "order-1 w-full")}>
        {t && <NpProgress durationMs={t.durationMs} />}
      </div>

      {!IS_MOBILE && (
        <div className="flex items-center gap-1">
          <DevicePicker />
          <IconButton label="Volver a Reproduciendo" active onClick={() => nav("/reproduciendo", { replace: true })}><Captions className="size-5" /></IconButton>
          <IconButton label={volume === 0 ? "Activar sonido" : "Silenciar"} disabled={!t || !caps?.playback.volume} onClick={p.toggleMute}><VolIcon className="size-5" /></IconButton>
          <input
            type="range" aria-label="Volumen" className="range w-28" min={0} max={1} step={0.01} disabled={!t || !caps?.playback.volume}
            value={volume} style={{ ["--fill" as string]: `${volume * 100}%` }} onChange={(e) => p.setVolume(Number(e.target.value))}
          />
          {t && <TrackMenu track={t} saved={fav} />}
        </div>
      )}
    </div>
  );
}

function FullscreenButton() {
  const [full, setFull] = useState(false);
  const toggle = async () => {
    if (isDesktopApp()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const w = getCurrentWindow();
      const next = !(await w.isFullscreen());
      await w.setFullscreen(next);
      setFull(next);
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
      setFull(false);
    } else {
      await document.documentElement.requestFullscreen();
      setFull(true);
    }
  };
  return (
    <IconButton label={full ? "Salir de pantalla completa" : "Pantalla completa"} onClick={() => void toggle().catch(() => {})}>
      {full ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
    </IconButton>
  );
}
