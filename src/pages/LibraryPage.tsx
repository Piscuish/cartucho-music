import { ArrowDownAZ, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MediaCard } from "@/components/MediaCard";
import { TrackList } from "@/components/TrackList";
import { CardSkeletons, Chip, EmptyState, PageHeader, QueryError, RowSkeletons, Segmented } from "@/components/ui";
import { useLibraryInfinite, useLoadAll, type LibraryKind } from "@/features/library/queries";
import { LoadMore } from "@/components/LoadMore";
import { useVisibleServices } from "@/hooks/useProviders";
import { normalize } from "@/utils/format";
import type { Album, Artist, Playlist, ProviderId, Track } from "@/types/music";

const tabs: { value: LibraryKind; label: string; path: string }[] = [
  { value: "playlists", label: "Playlists", path: "/playlists" },
  { value: "albums", label: "Álbumes", path: "/albumes" },
  { value: "artists", label: "Artistas", path: "/artistas" },
  { value: "tracks", label: "Canciones", path: "/canciones" },
];

type Sort = "recent" | "name" | "artist";
type Item = Track | Album | Artist | Playlist;

const artistOf = (x: Item) => ("artistNames" in x ? x.artistNames[0] ?? "" : "");
const searchText = (x: Item) =>
  [x.name, "artistNames" in x ? x.artistNames.join(" ") : "", x.kind === "playlist" ? x.description : "", x.kind === "artist" ? x.genres.join(" ") : ""].join(" ");

/** Biblioteca combinada para VER (filtrar y ordenar en local). Cada elemento conserva su proveedor. */
export function LibraryPage({ tab, title = "Mi biblioteca" }: { tab: LibraryKind; title?: string }) {
  const nav = useNavigate();
  const [filter, setFilter] = useState("");
  const [provider, setProvider] = useState<ProviderId | "all">("all");
  const services = useVisibleServices();
  const [sort, setSort] = useState<Sort>("recent");
  const all = useLibraryInfinite(tab);
  const slices = all.filter((s) => provider === "all" || s.provider.id === provider);
  const loading = slices.some((s) => s.isLoading);
  const q = normalize(filter.trim());
  // Filtrar u ordenar sobre una biblioteca a medio cargar daría resultados engañosos:
  // en esos casos se completa la carga en segundo plano.
  const needsAll = q.length > 0 || sort !== "recent";
  const progress = useLoadAll(slices, needsAll);
  const hasMore = slices.some((s) => s.hasMore);
  const fetchingMore = slices.some((s) => s.fetchingMore);
  const fetchMore = () => slices.forEach((s) => s.fetchMore());

  const items = useMemo(() => {
    let xs: Item[] = slices.flatMap((s) => s.items as Item[]);
    if (q) xs = xs.filter((x) => normalize(searchText(x)).includes(q));
    if (sort === "name") xs = [...xs].sort((a, b) => a.name.localeCompare(b.name, "es"));
    if (sort === "artist") xs = [...xs].sort((a, b) => artistOf(a).localeCompare(artistOf(b), "es"));
    return xs;
  }, [slices, q, sort]);

  return (
    <>
      <PageHeader eyebrow="Tu música" title={title}>
        <Segmented
          layoutId="library-tabs"
          value={tab}
          onChange={(v) => nav(tabs.find((t) => t.value === v)!.path)}
          options={tabs.map(({ value, label }) => ({ value, label }))}
        />
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <label className="mr-2 flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 focus-within:border-accent">
          <Search className="size-3.5 text-muted" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar en la biblioteca" className="w-48 bg-transparent text-[13px] outline-none placeholder:text-faint" />
        </label>
        {services.length > 1 && <Chip active={provider === "all"} onClick={() => setProvider("all")}>Todos</Chip>}
        {services.length > 1 && services.map((p) => (
          <Chip key={p.id} active={provider === p.id} onClick={() => setProvider(p.id)}>
            <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: p.color }} />{p.name}
          </Chip>
        ))}
        <div className="ml-auto flex items-center gap-2 text-[13px] text-muted">
          <ArrowDownAZ className="size-4" />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-lg bg-transparent py-1 font-medium text-fg outline-none">
            <option value="recent">Añadidos recientemente</option>
            <option value="name">Nombre</option>
            {(tab === "tracks" || tab === "albums") && <option value="artist">Artista</option>}
          </select>
        </div>
      </div>

      {slices.filter((s) => s.error).map((s) => <div key={s.provider.id} className="mb-4"><QueryError error={s.error} /></div>)}
      {needsAll && !progress.complete && (
        <div className="mb-4 flex items-center gap-3 text-[12.5px] text-muted" role="status">
          <div className="h-1 w-40 overflow-hidden rounded-full bg-hover">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${progress.total ? (progress.loaded / progress.total) * 100 : 0}%` }} />
          </div>
          Cargando toda tu biblioteca para {q ? "filtrar" : "ordenar"}: {progress.loaded} de {progress.total}
        </div>
      )}
      {!needsAll && slices.some((s) => !s.isLoading && s.total) && (
        <p className="mb-3 text-[12.5px] text-muted">
          {slices.filter((s) => !s.isLoading).map((s) => `${(s.total ?? s.items.length).toLocaleString("es")} en ${s.provider.displayName}`).join(" · ")}
        </p>
      )}

      {loading && !items.length ? (
        tab === "tracks" ? <RowSkeletons count={8} /> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(var(--card-w),1fr))] gap-x-5 gap-y-7"><CardSkeletons count={8} round={tab === "artists"} /></div>
        )
      ) : items.length === 0 ? (
        <EmptyState icon={<Search className="size-6" />} title={q ? "Nada coincide con el filtro" : "Aún no hay nada aquí"} />
      ) : tab === "tracks" ? (
        <TrackList tracks={items as Track[]} allSaved />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(var(--card-w),1fr))] gap-x-5 gap-y-7">
          {(items as (Album | Artist | Playlist)[]).map((e) => <MediaCard key={`${e.provider}:${e.id}`} entity={e} />)}
        </div>
      )}
      {!needsAll && items.length > 0 && <LoadMore hasMore={hasMore} loading={fetchingMore} onLoad={fetchMore} />}
    </>
  );
}
