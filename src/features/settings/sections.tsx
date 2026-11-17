import { Check, Minus, X } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Notice, PhasePill, Toggle } from "@/components/ui";
import { useEffect, useState } from "react";
import { invokeNative, isTauri } from "@/database/runtime";
import { useDesktop } from "@/stores/desktop";
import { isDesktopApp } from "@/utils/platform";
import { isAutostartEnabled, setAutostart } from "@/features/desktop/autostart";
import { sendTrackNotification } from "@/features/desktop/useDesktopIntegration";
import { useQueryClient } from "@tanstack/react-query";
import { providerList, type ProviderMeta } from "@/providers/registry";
import type { ProviderCapabilities } from "@/providers/types";
import { useConnectionStatus, useVisibleServices } from "@/hooks/useProviders";
import { useServicesPrefs } from "@/stores/services";
import { setServiceVisible } from "@/providers/bootstrap";
import { shortcuts } from "@/hooks/useShortcuts";
import { cache, history, kv, storageBackend } from "@/database/stores";
import { secureStore } from "@/services/secure-store";
import { useAppearance } from "@/stores/appearance";
import { Row, SectionTitle } from "./common";
import { SpotifyCard } from "./SpotifyCard";

function DesktopOnly() {
  return <span className="text-[12.5px] text-faint">Solo en la app de escritorio</span>;
}

export function GeneralSection() {
  const d = useDesktop();
  const desktop = isDesktopApp();
  const [autostart, setAutostartState] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { isAutostartEnabled().then(setAutostartState).catch(() => setAutostartState(false)); }, []);

  return (
    <>
      <SectionTitle title="General" />
      <Row label="Idioma"><span className="text-[13px] text-muted">Español</span></Row>
      <Row label="Iniciar con Windows" hint="Cartucho Music se abre al iniciar sesión.">
        {desktop ? (
          <Toggle
            label="Iniciar con Windows"
            checked={!!autostart}
            disabled={autostart === null || busy}
            onChange={async (v) => {
              setBusy(true);
              try { setAutostartState(await setAutostart(v)); } catch (e) { console.warn(e); } finally { setBusy(false); }
            }}
          />
        ) : <DesktopOnly />}
      </Row>
      <Row label="Arrancar minimizada" hint="Al iniciarse con Windows, queda en la bandeja sin abrir la ventana.">
        {desktop ? <Toggle label="Arrancar minimizada" checked={d.startMinimized} disabled={!autostart} onChange={(v) => d.set("startMinimized", v)} /> : <DesktopOnly />}
      </Row>
      <Row label="Cerrar a la bandeja" hint="Al cerrar la ventana, la música sigue y Cartucho queda en la bandeja. Para salir, usa «Salir» en su menú.">
        {desktop ? <Toggle label="Cerrar a la bandeja" checked={d.closeToTray} onChange={(v) => d.set("closeToTray", v)} /> : <DesktopOnly />}
      </Row>
      <Row label="Tamaño y posición de la ventana" hint="Se recuerdan automáticamente al cerrar.">
        <span className="text-[12.5px] text-muted">{desktop ? "Activado" : "—"}</span>
      </Row>
    </>
  );
}

const capabilityRows: { label: string; get: (c: ProviderCapabilities) => boolean | string }[] = [
  { label: "Búsqueda en catálogo", get: (c) => c.catalog.search },
  { label: "Biblioteca personal", get: (c) => c.library.savedTracks },
  { label: "Reproducciones recientes", get: (c) => c.personalization.recentlyPlayed },
  { label: "Artistas más escuchados", get: (c) => c.personalization.topArtists },
  { label: "Recomendaciones", get: (c) => c.personalization.recommendations },
  { label: "Reproducción dentro de la app", get: (c) => c.playback.inApp },
  { label: "Control remoto de dispositivos", get: (c) => c.playback.remoteControl },
  { label: "Reordenar la cola", get: (c) => c.queue.reorder },
  { label: "Letras", get: (c) => c.lyrics.synced || c.lyrics.plain },
];

function CapCell({ v }: { v: boolean | string }) {
  if (v === true || v === "available") return <Check className="mx-auto size-4 text-emerald-400" />;
  if (v === "unverified") return <span className="flex justify-center"><Minus className="size-4 text-amber-400" aria-label="Por verificar" /></span>;
  return <X className="mx-auto size-4 text-faint" />;
}

function ServiceCard({ p }: { p: ProviderMeta }) {
  const status = useConnectionStatus(p.id);
  const label = status.state === "connected" ? `Conectado como ${status.displayName}`
    : status.state === "preview" ? "Vista previa con datos de ejemplo"
    : "Sin conectar";
  return (
    <div className="rounded-[var(--radius-card)] border border-line p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl" style={{ background: `${p.color}1f` }}>
          <span className="size-3.5 rounded-full" style={{ background: p.color }} />
        </span>
        <div className="flex-1">
          <div className="font-semibold">{p.name}</div>
          <div className="text-[12.5px] text-muted">{label}</div>
        </div>
        <PhasePill phase={p.phase} />
      </div>
      <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
        {p.id === "spotify"
          ? "OAuth 2.0 con PKCE a través del navegador del sistema. No hace falta client secret. Requiere Premium para controlar la reproducción."
          : "MusicKit con Developer Token firmado en un servidor propio. Requiere Apple Developer Program y suscripción a Apple Music."}
      </p>
      <button disabled className="mt-4 w-full cursor-not-allowed rounded-full border border-line py-2 text-[13px] font-medium text-faint">
        Conectar · disponible en la Fase {p.phase}
      </button>
    </div>
  );
}

const visibilityHint: Record<string, string> = {
  spotify: "Tu biblioteca y reproducción de Spotify.",
  "apple-music": "Requiere Apple Developer Program para vincular una cuenta. Mientras tanto solo hay datos de ejemplo.",
};

export function ServicesSection() {
  const visible = useVisibleServices();
  const hidden = useServicesPrefs((s) => s.hidden);
  return (
    <>
      <SectionTitle title="Servicios conectados" description="Cada servicio se conecta de forma independiente y funciona aislado. Cartucho Music nunca combina contenido de distintos proveedores en una misma cola o playlist." />
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        {visible.some((p) => p.id === "spotify") && <SpotifyCard />}
        {visible.filter((p) => p.id !== "spotify").map((p) => <ServiceCard key={p.id} p={p} />)}
      </div>

      <h3 className="eyebrow mb-1">Mostrar servicios</h3>
      <div className="mb-8">
        {providerList.map((p) => (
          <Row key={p.id} label={p.name} hint={hidden.includes(p.id) ? `Oculto. ${visibilityHint[p.id] ?? ""}` : visibilityHint[p.id]}>
            <Toggle label={`Mostrar ${p.name}`} checked={!hidden.includes(p.id)} onChange={(v) => setServiceVisible(p.id, v)} />
          </Row>
        ))}
      </div>

      <h3 className="eyebrow mb-3">Capacidades declaradas</h3>
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line bg-hover text-left text-muted">
              <th className="px-4 py-2.5 font-medium">Función</th>
              {visible.map((p) => <th key={p.id} className="w-32 px-4 py-2.5 text-center font-medium">{p.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {capabilityRows.map((r) => (
              <tr key={r.label} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5">{r.label}</td>
                {visible.map((p) => <td key={p.id} className="px-4 py-2.5"><CapCell v={r.get(p.capabilities)} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted">
        <Minus className="size-3.5 text-amber-400" /> Por verificar: depende del DRM del WebView del sistema (ver docs/VIABILIDAD.md).
      </p>
    </>
  );
}

export function PlaybackSection() {
  return (
    <>
      <SectionTitle title="Reproducción" description="La reproducción siempre usa el mecanismo oficial del servicio activo." />
      <Notice>
        Con Spotify, Cartucho puede sonar en este equipo (reproductor integrado «Cartucho Music») o controlar la app oficial en cualquiera de tus dispositivos.
        Elige dónde suena con el botón de dispositivos del reproductor.
      </Notice>
    </>
  );
}

export function ShortcutsSection() {
  return (
    <>
      <SectionTitle title="Atajos de teclado" description="Estos atajos funcionan con la ventana de Cartucho en primer plano." />
      <div className="rounded-[var(--radius-card)] border border-line">
        {shortcuts.map((s) => (
          <div key={s.action} className="flex items-center justify-between border-b border-line px-4 py-3 text-[13.5px] last:border-0">
            <span>{s.action}</span>
            <span className="flex gap-1">
              {s.keys.map((k) => <kbd key={k} className="min-w-7 rounded-md border border-line bg-hover px-2 py-0.5 text-center font-sans text-[12px]">{k}</kbd>)}
            </span>
          </div>
        ))}
      </div>
      <h3 className="eyebrow mt-8 mb-1">Globales</h3>
      <MediaKeysRow />
    </>
  );
}

function MediaKeysRow() {
  const d = useDesktop();
  const status = d.mediaKeysStatus;
  const hint = status.state === "error" ? status.message
    : status.state === "active" ? "Activas: ⏯ ⏭ ⏮ controlan Cartucho aunque la ventana esté en segundo plano."
    : "Si tienes abierta la app oficial de Spotify, ambas reaccionarían a la vez: actívalo solo si usas Cartucho como reproductor principal.";
  return (
    <Row label="Teclas multimedia del teclado" hint={<span className={status.state === "error" ? "text-red-400" : undefined}>{hint}</span>}>
      {isDesktopApp() ? <Toggle label="Teclas multimedia" checked={d.mediaKeys} onChange={(v) => d.set("mediaKeys", v)} /> : <DesktopOnly />}
    </Row>
  );
}

export function NotificationsSection() {
  return (
    <>
      <SectionTitle title="Notificaciones" description="Avisos nativos de Windows al empezar una canción nueva." />
      <NotificationsRows />
    </>
  );
}

function NotificationsRows() {
  const d = useDesktop();
  const [test, setTest] = useState<"idle" | "sent" | "denied">("idle");
  if (!isDesktopApp()) return <Row label="Avisar al cambiar de canción"><DesktopOnly /></Row>;
  return (
    <>
      <Row label="Avisar al cambiar de canción">
        <Toggle label="Avisar al cambiar de canción" checked={d.notifyTrackChange} onChange={(v) => d.set("notifyTrackChange", v)} />
      </Row>
      <Row label="Solo cuando la ventana no está visible" hint="Evita avisos mientras estás mirando Cartucho.">
        <Toggle label="Solo en segundo plano" checked={d.notifyOnlyWhenHidden} disabled={!d.notifyTrackChange} onChange={(v) => d.set("notifyOnlyWhenHidden", v)} />
      </Row>
      <Row label="Probar" hint={test === "denied" ? "Windows ha bloqueado las notificaciones de Cartucho. Revísalo en Configuración de Windows → Notificaciones." : undefined}>
        <button
          onClick={async () => setTest((await sendTrackNotification("Cartucho Music", "Así se verán los avisos de canción.")) ? "sent" : "denied")}
          className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] font-medium hover:bg-hover"
        >
          {test === "sent" ? "Enviada" : "Enviar notificación de prueba"}
        </button>
      </Row>
    </>
  );
}

function ClearButton({ label, action }: { label: string; action: () => Promise<void> }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  return (
    <button
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        try { await action(); setState("done"); } catch (e) { console.warn(e); setState("error"); }
      }}
      className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] font-medium hover:bg-hover disabled:opacity-50"
    >
      {state === "done" ? "Borrado" : state === "error" ? "Error, reintentar" : state === "busy" ? "Borrando…" : label}
    </button>
  );
}

export function PrivacySection() {
  const qc = useQueryClient();
  const reset = useAppearance((s) => s.reset);
  return (
    <>
      <SectionTitle title="Privacidad" description="Cartucho Music no tiene servidores propios de analítica. Tus datos se quedan en este equipo." />
      <Row
        label="Credenciales"
        hint={secureStore.available()
          ? "Los tokens se guardan en el almacén seguro del sistema operativo, nunca en texto plano ni en la base de datos."
          : "Estás en el navegador de desarrollo: aquí no hay almacén seguro y nunca se guardan tokens."}
      >
        <span className="text-[12.5px] text-muted">{secureStore.available() ? "Keychain del sistema" : "No disponible"}</span>
      </Row>
      <Row label="Almacenamiento local" hint={storageBackend === "sqlite" ? "Base de datos SQLite en la carpeta de datos de la app." : "Navegador (solo desarrollo)."}>
        <span className="text-[12.5px] text-muted">{storageBackend === "sqlite" ? "SQLite" : "localStorage"}</span>
      </Row>
      <Row label="Historial de escucha" hint="Se guarda solo en este equipo y alimenta “Escuchado recientemente”.">
        <ClearButton label="Borrar historial" action={async () => { await history.clear(); await qc.invalidateQueries(); }} />
      </Row>
      <Row label="Caché de metadatos" hint="Portadas, álbumes y búsquedas guardadas temporalmente para evitar solicitudes repetidas.">
        <ClearButton label="Vaciar caché" action={async () => { await cache.clear(); qc.clear(); }} />
      </Row>
      <Row label="Preferencias" hint="Apariencia y favoritos de la vista previa.">
        <ClearButton label="Restablecer" action={async () => {
          reset();
          for (const id of providerList.map((p) => p.id)) await kv.delete(`preview.saved.${id}`);
          await qc.invalidateQueries();
        }} />
      </Row>
    </>
  );
}

export function AboutSection() {
  const [version, setVersion] = useState(__APP_VERSION__);
  // En la app de escritorio, la versión real del binario.
  useEffect(() => { if (isTauri()) invokeNative<string>("app_version").then(setVersion).catch(() => {}); }, []);
  return (
    <>
      <SectionTitle title="Acerca de" />
      <div className="flex items-center gap-5 rounded-[var(--radius-card)] border border-line p-6">
        <LogoMark size={64} />
        <div>
          <div className="font-display text-[24px] font-bold">Cartucho Music</div>
          <div className="text-[13px] text-muted">Versión {version}</div>
        </div>
      </div>
      <p className="mt-6 max-w-xl text-[13px] leading-relaxed text-muted">
        Cartucho Music es un cliente independiente. No está afiliado a Spotify ni a Apple, ni respaldado por ellos. Spotify y Apple Music son marcas de sus respectivos propietarios.
      </p>
    </>
  );
}
