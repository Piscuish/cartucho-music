import { FlaskConical } from "lucide-react";
import { Link } from "react-router-dom";
import { useProviders } from "@/hooks/useProviders";

/** Declara de forma visible que hay contenido de ejemplo. Desaparece cuando ningún proveedor es de vista previa. */
export function PreviewBanner() {
  const providers = useProviders();
  const preview = providers.filter((p) => p.isPreview);
  if (!preview.length) return null;
  const all = preview.length === providers.length;
  const names = preview.map((p) => p.displayName).join(" y ");
  return (
    <div className="mb-[var(--gap)] flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-accent/25 bg-accent/[0.08] px-4 py-3 text-[13px]">
      <span className="grid size-8 place-items-center rounded-xl bg-accent/15 text-accent">
        <FlaskConical className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="font-semibold">Modo vista previa.</span>{" "}
        <span className="text-muted">
          {all
            ? "Artistas, álbumes y portadas son ficticios. Ningún contenido proviene todavía de Spotify, y el reproductor no emite audio."
            : `El contenido marcado como ${names} es ficticio (vista previa) y no emite audio. El resto procede de tus servicios conectados.`}
        </span>
      </div>
      <Link to="/ajustes/servicios" className="rounded-full border border-line px-3 py-1.5 text-[12.5px] font-medium hover:bg-hover">
        Ver servicios
      </Link>
    </div>
  );
}
