/**
 * Integración con el escritorio (Fase 7). Se monta una vez en <App>.
 * - Bandeja: acciones del menú → reproductor; tooltip con la canción actual.
 * - Cerrar a la bandeja: sincroniza la preferencia con Rust.
 * - Teclas multimedia globales (opcionales).
 * - Notificación al cambiar de canción.
 * - Media Session: controles multimedia de Windows (y del navegador en desarrollo).
 */
import { useEffect, useRef } from "react";
import { invokeNative, isTauri } from "@/database/runtime";
import { usePlayer } from "@/stores/player";
import { useDesktop } from "@/stores/desktop";
import { MEDIA_KEYS, shouldNotify, trackKey, trayTooltip, type PlayerAction } from "./logic";

function runAction(action: PlayerAction | string) {
  const p = usePlayer.getState();
  if (action === "toggle") void p.toggle();
  else if (action === "next") void p.next();
  else if (action === "previous") void p.previous();
}

export function useDesktopIntegration() {
  const native = isTauri();
  const closeToTray = useDesktop((s) => s.closeToTray);
  const mediaKeys = useDesktop((s) => s.mediaKeys);
  const track = usePlayer((s) => s.state?.track ?? null);
  const isPlaying = usePlayer((s) => s.state?.isPlaying ?? false);
  const previousKey = useRef<string | null | undefined>(undefined);

  // Cerrar → bandeja
  useEffect(() => {
    if (native) invokeNative("set_close_to_tray", { enabled: closeToTray }).catch((e) => console.warn("[desktop]", e));
  }, [native, closeToTray]);

  // Menú de la bandeja
  useEffect(() => {
    if (!native) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    import("@tauri-apps/api/event").then(({ listen }) =>
      listen<string>("tray-action", (e) => runAction(e.payload)).then((fn) => { if (cancelled) fn(); else unlisten = fn; }),
    );
    return () => { cancelled = true; unlisten?.(); };
  }, [native]);

  // Tooltip de la bandeja
  useEffect(() => {
    if (native) invokeNative("set_tray_tooltip", { text: trayTooltip(track, isPlaying) }).catch(() => {});
  }, [native, track, isPlaying]);

  // Teclas multimedia globales
  useEffect(() => {
    const setStatus = (s: ReturnType<typeof useDesktop.getState>["mediaKeysStatus"]) => useDesktop.setState({ mediaKeysStatus: s });
    if (!native || !mediaKeys) { setStatus({ state: "off" }); return; }
    const keys = Object.keys(MEDIA_KEYS) as (keyof typeof MEDIA_KEYS)[];
    let registered = false;
    let cancelled = false;
    (async () => {
      const gs = await import("@tauri-apps/plugin-global-shortcut");
      try {
        await gs.register(keys, (e) => { if (e.state === "Pressed") runAction(MEDIA_KEYS[e.shortcut as keyof typeof MEDIA_KEYS] ?? ""); });
        registered = true;
        if (cancelled) await gs.unregister(keys);
        else setStatus({ state: "active" });
      } catch (e) {
        setStatus({ state: "error", message: "Otra aplicación (quizá Spotify) ya usa las teclas multimedia." });
        console.warn("[desktop] teclas multimedia", e);
      }
    })();
    return () => {
      cancelled = true;
      if (registered) import("@tauri-apps/plugin-global-shortcut").then((gs) => gs.unregister(keys)).catch(() => {});
    };
  }, [native, mediaKeys]);

  // Notificación al cambiar de canción
  useEffect(() => {
    const prefs = useDesktop.getState();
    const visible = document.visibilityState === "visible" && document.hasFocus();
    const notify = shouldNotify({ previousKey: previousKey.current, track, isPlaying, windowVisible: visible, prefs });
    if (track && isPlaying) previousKey.current = trackKey(track);
    else if (previousKey.current === undefined && track) previousKey.current = trackKey(track);
    if (!notify || !track) return;
    void sendTrackNotification(track.name, `${track.artistNames.join(", ")} · ${track.albumName}`);
  }, [track, isPlaying]);

  // Media Session (controles multimedia del sistema)
  useEffect(() => {
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
    if (!ms) return;
    if (!track) { ms.metadata = null; ms.playbackState = "none"; return; }
    ms.metadata = new MediaMetadata({
      title: track.name,
      artist: track.artistNames.join(", "),
      album: track.albumName,
      artwork: track.artwork.url ? [{ src: track.artwork.url, sizes: "640x640" }] : [],
    });
    ms.playbackState = isPlaying ? "playing" : "paused";
  }, [track, isPlaying]);

  useEffect(() => {
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
    if (!ms) return;
    const p = () => usePlayer.getState();
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => void p().toggle()],
      ["pause", () => void p().toggle()],
      ["nexttrack", () => void p().next()],
      ["previoustrack", () => void p().previous()],
      ["seekto", (d) => { if (d.seekTime != null) void p().seek(d.seekTime * 1000); }],
    ];
    for (const [a, h] of handlers) { try { ms.setActionHandler(a, h); } catch { /* acción no soportada */ } }
    return () => { for (const [a] of handlers) { try { ms.setActionHandler(a, null); } catch { /* */ } } };
  }, []);
}

let permission: Promise<boolean> | null = null;

/** Envía una notificación nativa (pide permiso una sola vez). */
export async function sendTrackNotification(title: string, body: string): Promise<boolean> {
  if (!isTauri()) return false;
  const n = await import("@tauri-apps/plugin-notification");
  permission ??= (async () => (await n.isPermissionGranted()) || (await n.requestPermission()) === "granted")();
  if (!(await permission)) return false;
  n.sendNotification({ title, body });
  return true;
}
