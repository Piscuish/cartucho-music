import { Check, Copy, ExternalLink, Loader2, LogOut, Speaker } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isTauri } from "@/database/runtime";
import { useConnectionStatus, useRegistryVersion } from "@/hooks/useProviders";
import { providers, registry } from "@/providers/registry";
import type { InAppPlayerStatus } from "@/providers/types";
import {
  connectSpotify, disconnectSpotify, getClientId, setClientId, SPOTIFY_REDIRECT_URI, useSpotifyConnector,
} from "@/providers/spotify/connector";
import { describeError } from "@/providers/errors";
import { openExternal } from "@/utils/external";

const meta = providers.spotify;

function useInAppStatus(): InAppPlayerStatus | null {
  useRegistryVersion();
  const devices = registry.tryGet("spotify")?.devices;
  return useSyncExternalStore(
    (cb) => devices?.subscribeInApp(cb) ?? (() => {}),
    () => devices?.getInAppStatus() ?? null,
  );
}

const inAppLabel = (s: InAppPlayerStatus): string =>
  s.state === "ready" ? "Listo: «Cartucho Music» aparece como dispositivo de Spotify."
  : s.state === "loading" ? s.message ?? "Cargando…"
  : s.state === "idle" ? "Inactivo."
  : s.message;

export function SpotifyCard() {
  const status = useConnectionStatus("spotify");
  const flow = useSpotifyConnector((s) => s.status);
  const inApp = useInAppStatus();
  const [clientId, setClientIdInput] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const desktop = isTauri();
  const connected = status.state === "connected";

  useEffect(() => { getClientId().then((id) => { setSavedId(id); setClientIdInput(id ?? ""); }); }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message.replace(/^spotify_\w+: /, "") : describeError(e)); } finally { setBusy(false); }
  };

  const onConnect = () => run(async () => {
    if (clientId.trim() !== savedId) { await setClientId(clientId); setSavedId(clientId.trim()); }
    await connectSpotify();
  });

  const copy = async () => {
    await navigator.clipboard.writeText(SPOTIFY_REDIRECT_URI).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const label = connected ? `Conectado como ${status.displayName}`
    : flow.state === "connecting" ? "Esperando a que autorices en el navegador…"
    : status.state === "preview" ? "Vista previa con datos de ejemplo"
    : "Sin conectar";

  return (
    <div className="rounded-[var(--radius-card)] border border-line p-5 md:col-span-2">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl" style={{ background: `${meta.color}1f` }}>
          <span className="size-3.5 rounded-full" style={{ background: meta.color }} />
        </span>
        <div className="flex-1">
          <div className="font-semibold">Spotify</div>
          <div className="text-[12.5px] text-muted">{label}</div>
        </div>
        {connected && (
          <button disabled={busy} onClick={() => run(disconnectSpotify)} className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-[12.5px] font-medium hover:bg-hover disabled:opacity-50">
            <LogOut className="size-3.5" /> Desconectar
          </button>
        )}
      </div>

      {!desktop && (
        <p className="mt-4 rounded-[var(--radius-control)] bg-hover px-3.5 py-2.5 text-[12.5px] text-muted">
          La conexión con Spotify solo funciona en la app de escritorio (<code>npm run tauri dev</code>): el login y los tokens los gestiona el núcleo nativo.
        </p>
      )}

      {desktop && !connected && (
        <div className="mt-5 space-y-4">
          <ol className="list-decimal space-y-1.5 pl-5 text-[12.5px] leading-relaxed text-muted">
            <li>
              En el{" "}
              <button onClick={() => openExternal("https://developer.spotify.com/dashboard")} className="inline-flex items-center gap-1 text-fg underline-offset-2 hover:underline">
                dashboard de Spotify <ExternalLink className="size-3" />
              </button>
              , abre tu app y añade esta Redirect URI (sin puerto):
            </li>
          </ol>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-[var(--radius-control)] border border-line bg-hover px-3 py-2 text-[12.5px]">{SPOTIFY_REDIRECT_URI}</code>
            <button onClick={copy} className="grid size-9 place-items-center rounded-full border border-line hover:bg-hover" aria-label="Copiar Redirect URI">
              {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
            </button>
          </div>
          <ol start={2} className="list-decimal pl-5 text-[12.5px] text-muted"><li>Pega aquí el Client ID de la app (no es secreto; no hace falta el Client Secret):</li></ol>
          <input
            value={clientId}
            onChange={(e) => setClientIdInput(e.target.value)}
            placeholder="Client ID"
            spellCheck={false}
            className="w-full rounded-[var(--radius-control)] border border-line bg-transparent px-3 py-2 font-mono text-[13px] outline-none focus:border-accent"
          />
          <button
            disabled={busy || clientId.trim().length < 16}
            onClick={onConnect}
            className="flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-[13.5px] font-semibold text-black transition-opacity disabled:opacity-40"
            style={{ background: meta.color }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? "Esperando autorización…" : "Conectar con Spotify"}
          </button>
          <p className="text-[11.5px] leading-relaxed text-faint">
            Se abrirá el navegador en accounts.spotify.com. Cartucho Music nunca ve tu contraseña; los tokens se guardan en el almacén seguro de Windows.
            En Development Mode, el propietario de la app debe tener Premium y cada usuario debe estar en la lista de la app (máx. 5).
          </p>
        </div>
      )}

      {connected && inApp && (
        <div className="mt-4 flex items-start gap-2.5 rounded-[var(--radius-control)] bg-hover px-3.5 py-2.5 text-[12.5px]">
          <Speaker className="mt-0.5 size-4 shrink-0 text-muted" />
          <div>
            <div className="font-medium">Reproductor integrado</div>
            <div className="text-muted">{inAppLabel(inApp)}</div>
          </div>
        </div>
      )}

      {(error || flow.state === "error") && (
        <p role="alert" className="mt-4 rounded-[var(--radius-control)] border border-red-500/25 bg-red-500/[0.07] px-3.5 py-2.5 text-[12.5px]">
          {error ?? (flow.state === "error" ? flow.message : "")}
        </p>
      )}
    </div>
  );
}
