import { CheckCircle2, Download, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Toggle } from "@/components/ui";
import { invokeNative, isTauri } from "@/database/runtime";
import { Row, SectionTitle } from "@/features/settings/common";
import { useUpdates } from "./updater";

const formatBytes = (n: number) => (n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export function UpdatesSection() {
  const { status, autoCheck, lastChecked, setAutoCheck, check, install } = useUpdates();
  const [version, setVersion] = useState(__APP_VERSION__);
  const desktop = isTauri();
  useEffect(() => { if (desktop) invokeNative<string>("app_version").then(setVersion).catch(() => {}); }, [desktop]);
  const busy = status.state === "checking" || status.state === "downloading" || status.state === "installing";

  return (
    <>
      <SectionTitle title="Actualizaciones" description="Las versiones nuevas se publican en GitHub. Cartucho solo instala actualizaciones firmadas por el proyecto." />

      <Row label="Versión instalada" hint={lastChecked ? `Última comprobación: ${new Date(lastChecked).toLocaleString("es")}` : "Aún no se ha comprobado."}>
        <span className="font-mono text-[13px]">{version}</span>
      </Row>
      <Row label="Buscar actualizaciones automáticamente" hint="Al abrir Cartucho y cada 6 horas. Si hay una versión nueva, aparece un aviso en la barra lateral.">
        <Toggle label="Buscar actualizaciones automáticamente" checked={autoCheck} disabled={!desktop} onChange={setAutoCheck} />
      </Row>
      <Row label="Comprobar ahora">
        <button
          disabled={busy || !desktop}
          onClick={() => void check({ manual: true })}
          className="flex items-center gap-2 rounded-full border border-line px-4 py-1.5 text-[13px] font-medium hover:bg-hover disabled:opacity-50"
        >
          {status.state === "checking" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {status.state === "checking" ? "Comprobando…" : "Buscar actualizaciones"}
        </button>
      </Row>
      {!desktop && <p className="mt-2 text-[12.5px] text-faint">Las actualizaciones solo funcionan en la app de escritorio.</p>}

      <div className="mt-6" aria-live="polite">
        {status.state === "uptodate" && (
          <p className="flex items-center gap-2 text-[13.5px]"><CheckCircle2 className="size-4 text-emerald-400" /> Tienes la última versión.</p>
        )}
        {status.state === "error" && (
          <p className="flex items-start gap-2 text-[13px] text-muted"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" /> {status.message}</p>
        )}
        {(status.state === "available" || status.state === "downloading" || status.state === "installing") && (
          <div className="rounded-[var(--radius-card)] border border-accent/40 bg-accent/[0.06] p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Download className="size-5 text-accent" />
              <div className="flex-1">
                <div className="font-semibold">Cartucho Music {status.version}</div>
                {status.state === "available" && status.date && <div className="text-[12px] text-muted">Publicada el {new Date(status.date).toLocaleDateString("es")}</div>}
              </div>
              {status.state === "available" && (
                <button onClick={() => void install()} className="rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent">
                  Descargar e instalar
                </button>
              )}
            </div>
            {status.state === "available" && status.notes && (
              <div className="mt-4 max-h-56 overflow-y-auto border-t border-line pt-3 text-[13px] leading-relaxed whitespace-pre-wrap text-muted">{status.notes}</div>
            )}
            {status.state === "downloading" && (
              <div className="mt-4">
                <div className="h-1.5 overflow-hidden rounded-full bg-hover">
                  <div className="h-full bg-accent transition-[width]" style={{ width: status.total ? `${(status.downloaded / status.total) * 100}%` : "30%" }} />
                </div>
                <p className="mt-2 text-[12px] text-muted">
                  Descargando… {formatBytes(status.downloaded)}{status.total ? ` de ${formatBytes(status.total)}` : ""}
                </p>
              </div>
            )}
            {status.state === "installing" && (
              <p className="mt-4 flex items-center gap-2 text-[13px]"><Loader2 className="size-4 animate-spin" /> Instalando: Cartucho se cerrará y volverá a abrirse.</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
