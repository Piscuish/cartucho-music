import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Disc3, Heart, MicVocal, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from "lucide-react";
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Cover } from "@/components/Cover";
import { ProviderBadge } from "@/components/ProviderBadge";
import { IconButton, Segmented } from "@/components/ui";
import { DynamicBackground } from "@/layouts/DynamicBackground";
import { usePlaybackPosition, usePlayer } from "@/stores/player";
import { useSavedSets } from "@/features/library/queries";
import { useUi } from "@/stores/ui";
import { useAlbum } from "@/features/catalog/queries";
import { useQueue } from "@/features/queue/queries";
import { useAppearance, type CoverShape, type NowPlayingLayout } from "@/stores/appearance";

const coverRound: Record<CoverShape, string> = {
  rounded: "rounded-[calc(var(--radius-cover)*2)]",
  square: "rounded-[2px]",
  circle: "rounded-full",
};
import { providers } from "@/providers/registry";
import type { Track } from "@/types/music";
import { albumTypeLabel, formatDuration } from "@/utils/format";
import { routes } from "@/utils/routes";
import { IS_MOBILE } from "@/utils/platform";
import { LyricsSizeControl, LyricsView } from "@/features/lyrics/LyricsView";
import { useLyricsPrefs } from "@/stores/lyrics";

export function NowPlayingPage() {
  const nav = useNavigate();
  const t = usePlayer((s) => s.state?.track ?? null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && nav(-1);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);

  if (!t) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-bg pt-[var(--titlebar-h)] text-center">
        <div>
          <p className="font-display text-[22px] font-semibold">No hay nada sonando</p>
          <button onClick={() => nav(-1)} className="mt-4 rounded-full border border-line px-4 py-2 text-[13px] hover:bg-hover">Volver</button>
        </div>
      </div>
    );
  }
  return <NowPlayingView t={t} />;
}

function NowPlayingView({ t }: { t: Track }) {
  const nav = useNavigate();
  const p = usePlayer();
  const state = p.state!;
  const position = usePlaybackPosition();
  const saved = useSavedSets([t]);
  const { nowPlayingLayout: layout, npBackground, npCoverShape, npShowQueue, set } = useAppearance();
  const queue = useQueue();
  const upNext = npShowQueue ? (queue.data?.upNext ?? []).slice(0, 3) : [];
  const album = useAlbum(t.provider, t.albumId).data;
  const caps = providers[t.provider].capabilities;
  const lyricsEnabled = useLyricsPrefs((s) => s.enabled);
  const fav = saved[t.provider]?.has(t.id) ?? false;
  const pct = (position / t.durationMs) * 100;

  const cover = (
    <motion.div
      key={t.id}
      layoutId="np-cover"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: state.isPlaying ? 1 : 0.94 }}
      transition={{ type: "spring", stiffness: 160, damping: 22 }}
      className={clsx("relative", IS_MOBILE ? "size-[min(82vw,44vh)]" : layout === "disc" ? "size-[min(52vh,460px)]" : layout === "split" ? "size-[min(56vh,520px)]" : "size-[min(46vh,440px)]")}
    >
      {layout === "disc" ? (
        <div className="relative size-full">
          <div
            className="anim-spin absolute inset-0 rounded-full shadow-[var(--shadow)]"
            style={{
              background: "repeating-radial-gradient(circle at center, #111 0 2px, #1b1b1f 2px 4px)",
              animation: "spin 6s linear infinite",
              animationPlayState: state.isPlaying ? "running" : "paused",
            }}
          >
            <div className="absolute inset-[30%]">
              <Cover artwork={t.artwork} rounded="rounded-full" className="size-full shadow-none" />
            </div>
            <div className="absolute inset-[48.5%] rounded-full bg-[var(--bg)]" />
          </div>
        </div>
      ) : (
        <Cover artwork={t.artwork} className="size-full" rounded={coverRound[npCoverShape]} />
      )}
    </motion.div>
  );

  // En el teléfono todo va en columna y centrado, sea cual sea el diseño elegido.
  const centered = layout === "stage" || IS_MOBILE;
  const meta = (
    <div className={clsx(centered && "text-center")}>
      <div className={clsx("mb-3 flex items-center gap-2", centered && "justify-center")}>
        <ProviderBadge provider={t.provider} />
        {album && <span className="eyebrow">{albumTypeLabel[album.albumType]} · {album.year}</span>}
      </div>
      <AnimatePresence mode="wait">
        <motion.h1
          key={t.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="font-display text-[clamp(30px,4.2vw,56px)] leading-[1] font-bold tracking-tight"
        >
          {t.name}
        </motion.h1>
      </AnimatePresence>
      <div className="mt-3 text-[17px] text-muted">
        <Link to={routes.artist(t.provider, t.artistIds[0])} className="font-medium text-fg/90 hover:underline">{t.artistNames.join(", ")}</Link>
        {" — "}
        <Link to={routes.album(t.provider, t.albumId)} className="hover:underline">{t.albumName}</Link>
      </div>
    </div>
  );

  const controls = (
    <div className="w-full max-w-[560px]">
      <input
        type="range" aria-label="Progreso" className="range w-full" min={0} max={t.durationMs} step={1000}
        value={position} style={{ ["--fill" as string]: `${pct}%` }} onChange={(e) => p.seek(Number(e.target.value))}
      />
      <div className="mt-2 flex justify-between text-[12px] text-muted tabular-nums">
        <span>{formatDuration(position)}</span>
        <span>−{formatDuration(t.durationMs - position)}</span>
      </div>
      <div className="mt-4 flex items-center justify-center gap-4">
        <IconButton label="Aleatorio" active={state.shuffle} disabled={!caps.playback.shuffle} onClick={p.toggleShuffle}><Shuffle className="size-5" /></IconButton>
        <IconButton label="Anterior" size="lg" onClick={p.previous}><SkipBack className="size-6 fill-current" /></IconButton>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={p.toggle}
          aria-label={state.isPlaying ? "Pausar" : "Reproducir"}
          className="grid size-16 place-items-center rounded-full bg-fg text-bg shadow-xl transition-transform hover:scale-105"
        >
          {state.isPlaying ? <Pause className="size-7 fill-current" /> : <Play className="ml-1 size-7 fill-current" />}
        </motion.button>
        <IconButton label="Siguiente" size="lg" onClick={p.next}><SkipForward className="size-6 fill-current" /></IconButton>
        <IconButton label="Repetir" active={state.repeat !== "off"} disabled={!caps.playback.repeat} onClick={p.cycleRepeat}>
          {state.repeat === "one" ? <Repeat1 className="size-5" /> : <Repeat className="size-5" />}
        </IconButton>
      </div>
    </div>
  );

  const upNextPanel = upNext.length > 0 && (
    <div className={clsx("w-full max-w-[560px]", centered && "mx-auto")}>
      <div className="eyebrow mb-2">A continuación</div>
      <div className="glass flex flex-col rounded-[var(--radius-card)] p-1.5">
        {upNext.map((n) => (
          <div key={n.id} className="flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-1.5">
            <Cover artwork={n.artwork} className="size-9 shrink-0 shadow-none" rounded="rounded-[calc(var(--radius-cover)*0.45)]" />
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-[13px] font-medium">{n.name}</div>
              <div className="truncate text-[12px] text-muted">{n.artistNames.join(", ")}</div>
            </div>
            <span className="text-[12px] text-muted tabular-nums">{formatDuration(n.durationMs)}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const details = album && (
    <div className="glass flex w-full max-w-[560px] flex-col rounded-[calc(var(--radius-card)*1.3)] p-6">
      <div className="mb-4 flex items-center gap-2">
        <Disc3 className="size-4 text-accent" />
        <span className="eyebrow">Detalles</span>
      </div>
      <div className="text-[12.5px] text-muted">
        <div className="flex justify-between"><span>Álbum</span><span className="text-fg">{album.name}</span></div>
        <div className="mt-1.5 flex justify-between"><span>Pista</span><span className="text-fg">{album.tracks.findIndex((x) => x.id === t.id) + 1} de {album.tracks.length}</span></div>
        <div className="mt-1.5 flex justify-between"><span>Reproducción</span><span className="text-accent">{state.mode === "preview" ? "Vista previa · sin audio" : state.mode === "remote" ? `En ${state.device?.name ?? "otro dispositivo"}` : "En Cartucho"}</span></div>
      </div>
    </div>
  );

  // Letra sincronizada (LRCLIB). Si está desactivada, se muestran los detalles de antes.
  const lyrics = lyricsEnabled ? (
    <div className={clsx("glass flex w-full max-w-[560px] flex-col rounded-[calc(var(--radius-card)*1.3)] p-5", IS_MOBILE ? "h-[46vh]" : "h-[min(40vh,360px)]")}>
      <div className="mb-1 flex items-center gap-2">
        <MicVocal className="size-4 text-accent" />
        <span className="eyebrow flex-1">Letra</span>
        <LyricsSizeControl compact />
        <Link to="/letra" className="rounded-full px-3 py-1 text-[12px] font-medium text-muted hover:bg-hover hover:text-fg">Ampliar</Link>
      </div>
      <LyricsView track={t} compact className="flex-1" />
    </div>
  ) : details;

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ type: "spring", stiffness: 220, damping: 30 }}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-bg pt-[var(--titlebar-h)]"
    >
      <DynamicBackground intensity={2} styleOverride={npBackground} />

      <header className={clsx("relative z-10 flex items-center justify-between py-4", IS_MOBILE ? "px-3" : "px-6")}>
        <IconButton label="Cerrar (Esc)" onClick={() => nav(-1)}><ChevronDown className="size-6" /></IconButton>
        {IS_MOBILE ? (
          <span className="eyebrow">{state.mode === "remote" && state.device ? `En ${state.device.name}` : "Reproduciendo"}</span>
        ) : (
          <Segmented<NowPlayingLayout>
            layoutId="np-layout"
            value={layout}
            onChange={(v) => set("nowPlayingLayout", v)}
            options={[{ value: "stage", label: "Escenario" }, { value: "split", label: "Dividido" }, { value: "disc", label: "Disco" }]}
          />
        )}
        <div className="flex items-center gap-2">
          {state.mode === "preview" && (
            <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-accent">{IS_MOBILE ? "Sin audio" : "Vista previa · sin audio"}</span>
          )}
          <IconButton label="Guardar en…" active={fav} disabled={!caps.library.write && !caps.library.playlistWrite} onClick={() => useUi.getState().openSaveDialog(t)}><Heart className={clsx("size-5", fav && "fill-current")} /></IconButton>
        </div>
      </header>

      {/* Centrado si cabe; con scroll si no (p. ej. Dividido + «A continuación» en ventanas bajas). */}
      <div className={clsx("scroll-area relative z-10 flex min-h-0 flex-1 flex-col", IS_MOBILE ? "px-6 pb-[calc(var(--safe-bottom)+24px)]" : "px-10 pb-10")}>
        <div className="m-auto flex w-full justify-center">
        {IS_MOBILE ? (
          <div className="flex w-full flex-col items-center gap-7">
            {cover}
            {meta}
            {controls}
            {lyrics}
            {upNextPanel}
          </div>
        ) : layout === "split" ? (
          <div className="grid w-full max-w-[1300px] grid-cols-[auto_minmax(0,1fr)] items-center gap-14">
            {cover}
            <div className="flex min-w-0 flex-col gap-8">
              {meta}
              {controls}
              {lyrics}
              {upNextPanel}
            </div>
          </div>
        ) : layout === "disc" ? (
          <div className="grid w-full max-w-[1300px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-14">
            <div className="flex justify-center">{cover}</div>
            <div className="flex flex-col gap-8">{meta}{controls}{lyrics}{upNextPanel}</div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-8">
            {cover}
            {meta}
            {controls}
            {lyrics}
            {upNextPanel}
          </div>
        )}
        </div>
      </div>
    </motion.div>
  );
}
