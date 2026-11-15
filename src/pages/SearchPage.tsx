import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { MediaCard } from "@/components/MediaCard";
import { TrackList } from "@/components/TrackList";
import { Chip, EmptyState, PageHeader, QueryError, RowSkeletons } from "@/components/ui";
import { PreviewBanner } from "@/components/PreviewBanner";
import { useSearch, useSearchPaged } from "@/features/search/queries";
import { LoadMore } from "@/components/LoadMore";
import type { SearchType } from "@/providers/types";
import type { Album, Artist, Playlist, Track } from "@/types/music";
import { providers } from "@/providers/registry";
import { useVisibleServices } from "@/hooks/useProviders";
import type { ProviderId } from "@/types/music";

type Kind = "all" | "tracks" | "albums" | "artists" | "playlists";
const kinds: { value: Kind; label: string }[] = [
  { value: "all", label: "Todo" },
  { value: "tracks", label: "Canciones" },
  { value: "albums", label: "Álbumes" },
  { value: "artists", label: "Artistas" },
  { value: "playlists", label: "Playlists" },
];

/** Espera a que el usuario deje de escribir para no lanzar una solicitud por tecla. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/**
 * Los resultados se agrupan POR SERVICIO y nunca se fusionan en una misma
 * colección reproducible. Cada grupo procede de una búsqueda independiente.
 */
export function SearchPage() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [only, setOnly] = useState<ProviderId | "all">("all");
  const services = useVisibleServices();
  const q = useDebounced(useDeferredValue(query).trim(), 300);
  const pagedType: SearchType | null = kind === "all" ? null : ({ tracks: "track", albums: "album", artists: "artist", playlists: "playlist" } as const)[kind];
  // "Todo": una petición por servicio con todos los tipos. Un tipo concreto: resultados paginados.
  const groups = useSearch(pagedType ? "" : q, only);
  const paged = useSearchPaged(q, pagedType, only);
  const fetching = groups.some((g) => g.isLoading) || paged.some((g) => g.isLoading);
  const withResults = groups.filter((g) => g.data && g.data.tracks.length + g.data.albums.length + g.data.artists.length + g.data.playlists.length > 0);
  const settled = q && !fetching && !pagedType;

  return (
    <>
      <PageHeader eyebrow="Catálogos" title="Buscar" />
      <PreviewBanner />

      <div className="glass sticky top-0 z-10 -mx-2 mb-6 flex flex-col gap-3 rounded-[var(--radius-card)] p-3">
        <label className="flex items-center gap-3 rounded-[var(--radius-control)] bg-hover px-4 py-3 focus-within:ring-2 focus-within:ring-accent">
          {fetching ? <Loader2 className="size-5 animate-spin text-muted" /> : <Search className="size-5 text-muted" />}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Canciones, álbumes, artistas o playlists"
            className="flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
          />
          {query && <button aria-label="Limpiar" onClick={() => setQuery("")}><X className="size-4 text-muted" /></button>}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {kinds.map((k) => <Chip key={k.value} active={kind === k.value} onClick={() => setKind(k.value)}>{k.label}</Chip>)}
          {services.length > 1 && <span className="mx-2 h-5 w-px bg-line" />}
          {services.length > 1 && <Chip active={only === "all"} onClick={() => setOnly("all")}>Todos los servicios</Chip>}
          {services.length > 1 && services.map((p) => (
            <Chip key={p.id} active={only === p.id} onClick={() => setOnly(p.id)}>
              <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: p.color }} />{p.name}
            </Chip>
          ))}
        </div>
      </div>

      {!q && (
        <EmptyState icon={<Search className="size-6" />} title="Busca en tus servicios">
          Los resultados se muestran agrupados por servicio. Cartucho Music no combina catálogos de distintos proveedores en una misma cola o playlist.
        </EmptyState>
      )}
      {q && fetching && !withResults.length && <RowSkeletons count={6} />}
      {settled && withResults.length === 0 && !groups.some((g) => g.error) && (
        <EmptyState icon={<Search className="size-6" />} title={`Sin resultados para “${q}”`}>
          Prueba con otro término. En la vista previa puedes buscar, por ejemplo, “neón”, “noche” o “Voltio”.
        </EmptyState>
      )}
      {groups.filter((g) => g.error).map((g) => (
        <div key={g.provider.id} className="mb-4"><QueryError error={g.error} /></div>
      ))}

      {pagedType && q && paged.map((g) => {
        const meta = providers[g.provider.id];
        return (
          <section key={g.provider.id} className="mb-10 rounded-[var(--radius-card)] border border-line p-5">
            <header className="mb-5 flex items-center gap-3">
              <span className="size-3 rounded-full" style={{ background: meta.color, boxShadow: `0 0 12px ${meta.color}` }} />
              <h2 className="font-display text-[20px] font-semibold">{kinds.find((k) => k.value === kind)!.label} en {meta.name}</h2>
            </header>
            {g.error != null && <QueryError error={g.error} />}
            {g.isLoading && <RowSkeletons count={4} />}
            {!g.isLoading && !g.error && !g.items.length && <p className="text-[13px] text-muted">Sin resultados.</p>}
            {pagedType === "track" ? (
              <TrackList tracks={g.items as Track[]} />
            ) : (
              <div className="flex flex-wrap gap-5">
                {(g.items as (Album | Artist | Playlist)[]).map((e) => <MediaCard key={e.id} entity={e} />)}
              </div>
            )}
            <LoadMore hasMore={g.hasMore} loading={g.fetchingMore} onLoad={g.fetchMore} />
          </section>
        );
      })}

      <AnimatePresence>
        {withResults.map(({ provider, data }) => {
          const meta = providers[provider.id];
          const d = data!;
          return (
            <motion.section
              key={provider.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-10 rounded-[var(--radius-card)] border border-line p-5"
            >
              <header className="mb-5 flex items-center gap-3">
                <span className="size-3 rounded-full" style={{ background: meta.color, boxShadow: `0 0 12px ${meta.color}` }} />
                <h2 className="font-display text-[20px] font-semibold">Resultados de {meta.name}</h2>
              </header>

              {d.tracks.length > 0 && (
                <div className="mb-6">
                  <SectionHead label="Canciones" onMore={() => setKind("tracks")} />
                  <TrackList tracks={d.tracks.slice(0, 5)} />
                </div>
              )}
              {(["albums", "artists", "playlists"] as const).map((k) =>
                d[k].length > 0 ? (
                  <div key={k} className="mb-6">
                    <SectionHead label={kinds.find((x) => x.value === k)!.label} onMore={() => setKind(k)} />
                    <div className="flex flex-wrap gap-5">
                      {d[k].map((e) => <MediaCard key={e.id} entity={e} />)}
                    </div>
                  </div>
                ) : null,
              )}
            </motion.section>
          );
        })}
      </AnimatePresence>
    </>
  );
}

function SectionHead({ label, onMore }: { label: string; onMore: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="eyebrow">{label}</div>
      <button onClick={onMore} className="text-[12.5px] font-medium text-muted hover:text-fg">Ver todo</button>
    </div>
  );
}
