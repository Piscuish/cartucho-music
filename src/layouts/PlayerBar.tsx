import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  Heart, ListOrdered, Maximize2, MicVocal, Music2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX, X,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Cover } from "@/components/Cover";
import { IconButton } from "@/components/ui";
import { ProviderBadge } from "@/components/ProviderBadge";
import { usePlaybackPosition, usePlayer } from "@/stores/player";
import { useSavedSets } from "@/features/library/queries";
import { useAppearance } from "@/stores/appearance";
import { providers } from "@/providers/registry";
import { formatDuration } from "@/utils/format";
import { routes } from "@/utils/routes";
import { DevicePicker } from "@/features/player/DevicePicker";
import { useLyricsPrefs } from "@/stores/lyrics";
import { endTrackDrag, startTrackDrag } from "@/features/library/dragTrack";
import { useUi } from "@/stores/ui";
import { connectSpotify } from "@/providers/spotify/connector";

export function PlayerBar() {
  const style = useAppearance((s) => s.playerStyle);
  const { state, toggle, next, previous, setVolume, toggleMute, toggleShuffle, cycleRepeat } = usePlayer();
  const nav = useNavigate();
  const loc = useLocation();
  const t = state?.track ?? null;
  const saved = useSavedSets(t ? [t] : []);
  const openSaveDialog = useUi((s) => s.openSaveDialog);

  const caps = t ? providers[t.provider].capabilities : null;
  const fav = t ? saved[t.provider]?.has(t.id) ?? false : false;
  // Las letras vienen de LRCLIB, no del servicio (ver features/lyrics/lrclib.ts).
  const lyricsEnabled = useLyricsPrefs((s) => s.enabled);
  const volume = state?.volume ?? 0;
  const disabled = !t;

  const transport = (
    <div className="flex items-center gap-1.5">
      <IconButton label="Aleatorio" size="sm" active={state?.shuffle} disabled={disabled || !caps?.playback.shuffle} onClick={toggleShuffle}>
        <Shuffle className="size-4" />
      </IconButton>
      <IconButton label="Anterior" disabled={disabled} onClick={previous}><SkipBack className="size-[18px] fill-current" /></IconButton>
      <motion.button
        whileTap={{ scale: 0.92 }}
        disabled={disabled}
        aria-label={state?.isPlaying ? "Pausar" : "Reproducir"}
        onClick={toggle}
        className={clsx("grid place-items-center rounded-full bg-fg text-bg transition-transform hover:scale-105 disabled:opacity-30 disabled:hover:scale-100", style === "minimal" ? "size-9" : "size-10")}
      >
        {state?.isPlaying ? <Pause className="size-[18px] fill-current" /> : <Play className="ml-0.5 size-[18px] fill-current" />}
      </motion.button>
      <IconButton label="Siguiente" disabled={disabled} onClick={next}><SkipForward className="size-[18px] fill-current" /></IconButton>
      <IconButton
        label={state?.repeat === "one" ? "Repetir una" : state?.repeat === "all" ? "Repetir todo" : "Repetir"}
        size="sm" active={!!state && state.repeat !== "off"} disabled={disabled || !caps?.playback.repeat} onClick={cycleRepeat}
      >
        {state?.repeat === "one" ? <Repeat1 className="size-4" /> : <Repeat className="size-4" />}
      </IconButton>
    </div>
  );

  // Componente aparte: solo él se vuelve a dibujar 4 veces por segundo, no toda la barra.
  const progress = <ProgressRow />;

  const VolIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const extras = (
    <div className="flex items-center justify-end gap-1">
      {state?.mode === "preview" && (
        <span title="El proveedor de vista previa no emite audio" className="mr-2 hidden rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10.5px] font-medium whitespace-nowrap text-accent xl:inline">
          Vista previa · sin audio
        </span>
      )}
      {state?.mode === "remote" && state.device && (
        <span className="mr-2 hidden text-[11.5px] text-accent xl:inline">En {state.device.name}</span>
      )}
      {lyricsEnabled && (
        <IconButton label="Letra" size="sm" active={loc.pathname === "/letra"} disabled={disabled} onClick={() => (loc.pathname === "/letra" ? nav(-1) : nav("/letra"))}>
          <MicVocal className="size-4" />
        </IconButton>
      )}
      <IconButton label="Cola" size="sm" active={loc.pathname === "/cola"} onClick={() => (loc.pathname === "/cola" ? nav(-1) : nav("/cola"))}>
        <ListOrdered className="size-4" />
      </IconButton>
      <DevicePicker />
      <IconButton label={volume === 0 ? "Activar sonido" : "Silenciar"} size="sm" disabled={disabled || !caps?.playback.volume} onClick={toggleMute}>
        <VolIcon className="size-4" />
      </IconButton>
      {style !== "minimal" && (
        <input
          type="range" aria-label="Volumen" className="range w-24" min={0} max={1} step={0.01} disabled={disabled || !caps?.playback.volume}
          value={volume} style={{ ["--fill" as string]: `${volume * 100}%` }}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      )}
      <IconButton label="Pantalla Reproduciendo" size="sm" onClick={() => nav("/reproduciendo")}>
        <Maximize2 className="size-4" />
      </IconButton>
    </div>
  );

  const info = t ? (
    <div
      className="flex min-w-0 items-center gap-3"
      draggable
      onDragStart={(e) => startTrackDrag(e, t)}
      onDragEnd={endTrackDrag}
      title="Arrastra la canción a una playlist de la barra lateral"
    >
      <Link to="/reproduciendo" className="shrink-0" aria-label="Abrir Reproduciendo">
        <motion.div layoutId="np-cover" transition={{ type: "spring", stiffness: 260, damping: 30 }}>
          <Cover artwork={t.artwork} className={style === "minimal" ? "size-10" : "size-14"} rounded="rounded-[calc(var(--radius-cover)*0.7)]" />
        </motion.div>
      </Link>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Link to={routes.album(t.provider, t.albumId)} className="truncate text-[14px] font-semibold hover:underline">{t.name}</Link>
          {(caps?.library.write || caps?.library.playlistWrite) && (
            <button onClick={() => openSaveDialog(t)} aria-label="Guardar en favoritos o playlists" title="Guardar en…" className={fav ? "text-accent" : "text-muted hover:text-fg"}>
              <Heart className={clsx("size-3.5", fav && "fill-current")} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-[12.5px] text-muted">
          <Link to={routes.artist(t.provider, t.artistIds[0])} className="truncate hover:text-fg hover:underline">{t.artistNames.join(", ")}</Link>
          <ProviderBadge provider={t.provider} compact />
        </div>
      </div>
    </div>
  ) : (
    <div className="flex min-w-0 items-center gap-3 text-muted">
      <div className={clsx("grid shrink-0 place-items-center rounded-[calc(var(--radius-cover)*0.7)] bg-hover", style === "minimal" ? "size-10" : "size-14")}><Music2 className="size-5" /></div>
      <div className="text-[13px]">Nada sonando</div>
    </div>
  );

  const toast: ReactNode = <PlayerToast />;

  if (style === "minimal") {
    return (
      <div className="glass relative z-30 shrink-0 border-x-0 border-b-0">
        {toast}
        <div className="absolute -top-px right-0 left-0 h-[2px] bg-line">
          <ThinProgress />
        </div>
        <div className="grid h-[64px] grid-cols-[1fr_auto_1fr] items-center gap-6 px-4">
          {info}
          {transport}
          {extras}
        </div>
      </div>
    );
  }

  if (style === "island") {
    return (
      <div className="pointer-events-none absolute right-0 bottom-4 left-0 z-30 flex justify-center px-6">
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="glass pointer-events-auto relative grid w-full max-w-[1040px] grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] items-center gap-6 rounded-[26px] px-4 py-3 shadow-[var(--shadow)]"
        >
          {toast}
          {info}
          <div className="flex flex-col items-center gap-1">{transport}{progress}</div>
          {extras}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="glass relative z-30 grid h-[var(--player-h)] shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-6 border-x-0 border-b-0 px-4">
      {toast}
      {info}
      <div className="flex flex-col items-center gap-1">{transport}{progress}</div>
      {extras}
    </div>
  );
}

/** Avisos del reproductor (errores, reconectar, elegir dispositivo). Se coloca dentro de un
 * contenedor `relative`: aparece justo encima. */
export function PlayerToast() {
  const notice = usePlayer((s) => s.toast);
  const clearToast = usePlayer((s) => s.clearToast);
  const openDevices = useUi((s) => s.setDevicePickerOpen);
  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          key={notice.message}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
          role={notice.kind === "error" ? "alert" : "status"}
          className={clsx(
            "glass absolute -top-14 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full px-4 py-2 text-[12.5px] whitespace-nowrap shadow-[var(--shadow)]",
            notice.kind === "error" && "border-red-500/30",
          )}
        >
          {notice.message}
          {notice.action === "reconnect" && (
            <button onClick={() => { clearToast(); void connectSpotify().catch((e) => console.warn("[spotify]", e)); }} className="rounded-full bg-accent px-3 py-1 font-semibold text-on-accent">
              Reconectar
            </button>
          )}
          {notice.action === "devices" && (
            <button data-devices-trigger onClick={() => { clearToast(); openDevices(true); }} className="rounded-full bg-accent px-3 py-1 font-semibold text-on-accent">
              Elegir dispositivo
            </button>
          )}
          <button onClick={clearToast} aria-label="Cerrar"><X className="size-3.5 text-muted" /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ProgressRow() {
  const t = usePlayer((s) => s.state?.track ?? null);
  const seek = usePlayer((s) => s.seek);
  const position = usePlaybackPosition();
  const caps = t ? providers[t.provider].capabilities : null;
  const pct = t ? (position / t.durationMs) * 100 : 0;
  return (
    <div className="flex w-full items-center gap-2.5 text-[11px] text-muted tabular-nums">
      <span className="w-9 text-right">{formatDuration(position)}</span>
      <input
        type="range" aria-label="Progreso" className="range flex-1" min={0} max={t?.durationMs ?? 1} step={1000}
        value={position} disabled={!t || !caps?.playback.seek}
        style={{ ["--fill" as string]: `${pct}%` }}
        onChange={(e) => seek(Number(e.target.value))}
      />
      <span className="w-9">{t ? formatDuration(t.durationMs) : "0:00"}</span>
    </div>
  );
}

/** Línea de progreso fina (reproductor mínimo y del teléfono). */
export function ThinProgress() {
  const t = usePlayer((s) => s.state?.track ?? null);
  const position = usePlaybackPosition(500);
  const pct = t ? Math.min(100, (position / t.durationMs) * 100) : 0;
  return <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />;
}
