import { motion } from "framer-motion";
import { Disc3, ExternalLink, Play, Shuffle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Cover } from "@/components/Cover";
import { ProviderBadge } from "@/components/ProviderBadge";
import { TrackList } from "@/components/TrackList";
import { EmptyState, Notice, QueryError, RowSkeletons, Skeleton } from "@/components/ui";
import { serviceUrl, openExternal } from "@/utils/external";
import { useAlbum, usePlaylist, usePlaylistTracks } from "@/features/catalog/queries";
import { LoadMore } from "@/components/LoadMore";
import type { ReactNode } from "react";
import { usePlayer } from "@/stores/player";
import { providers, providerIds, registry } from "@/providers/registry";
import { NotFoundError } from "@/providers/errors";
import { albumTypeLabel, formatTotalDuration } from "@/utils/format";
import { routes } from "@/utils/routes";
import type { ProviderId, Track } from "@/types/music";
import { usePalette } from "@/utils/palette";

export function CollectionPage({ kind }: { kind: "album" | "playlist" }) {
  const { provider = "", id = "" } = useParams();
  if (!providerIds.includes(provider as ProviderId)) return <EmptyState icon={<Disc3 className="size-6" />} title="Servicio desconocido" />;
  return kind === "album" ? <AlbumView provider={provider as ProviderId} id={id} /> : <PlaylistView provider={provider as ProviderId} id={id} />;
}

function AlbumView({ provider, id }: { provider: ProviderId; id: string }) {
  const q = useAlbum(provider, id);
  return <CollectionView query={q} kind="album" />;
}

function PlaylistView({ provider, id }: { provider: ProviderId; id: string }) {
  const q = usePlaylist(provider, id);
  const tracks = usePlaylistTracks(provider, q.data);
  return (
    <CollectionView
      query={q}
      kind="playlist"
      tracks={tracks.data?.pages.flatMap((p) => p.items)}
      more={<LoadMore hasMore={!!tracks.hasNextPage} loading={tracks.isFetchingNextPage} onLoad={() => tracks.fetchNextPage()} />}
    />
  );
}

type Query = ReturnType<typeof useAlbum> | ReturnType<typeof usePlaylist>;

function CollectionView({ query, kind, tracks: pagedTracks, more }: { query: Query; kind: "album" | "playlist"; tracks?: Track[]; more?: ReactNode }) {
  const play = usePlayer((s) => s.play);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const shuffle = usePlayer((s) => s.state?.shuffle ?? false);
  const [c1, c2] = usePalette(query.data?.artwork);

  if (query.isLoading) {
    return (
      <div className="pt-4">
        <div className="mb-8 flex items-end gap-8"><Skeleton className="size-[232px] rounded-[calc(var(--radius-cover)*1.4)]" /><div className="flex-1"><Skeleton className="h-12 w-2/3" /><Skeleton className="mt-4 h-4 w-1/3" /></div></div>
        <RowSkeletons count={6} />
      </div>
    );
  }
  if (query.error instanceof NotFoundError) return <EmptyState icon={<Disc3 className="size-6" />} title="No encontrado" />;
  if (query.error || !query.data) return <QueryError error={query.error} onRetry={() => query.refetch()} />;

  const entity = query.data;
  const tracks = pagedTracks ?? entity.tracks;
  const total = tracks.reduce((a, t) => a + t.durationMs, 0);

  return (
    <>
      <div className="relative -mx-[var(--page-px)] -mt-8 mb-6 overflow-hidden px-[var(--page-px)] pt-12 pb-8">
        <div className="absolute inset-0 opacity-50" style={{ background: `linear-gradient(180deg, ${c1}66, ${c2}22 70%, transparent)` }} />
        <div className="relative flex flex-wrap items-end gap-8">
          <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 22 }}>
            <Cover artwork={entity.artwork} className="size-[232px]" rounded="rounded-[calc(var(--radius-cover)*1.4)]" />
          </motion.div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="mb-3 flex items-center gap-2">
              <span className="eyebrow !text-fg/80">{entity.kind === "album" ? albumTypeLabel[entity.albumType] : "Playlist"}</span>
              <ProviderBadge provider={entity.provider} />
            </div>
            <h1 className="font-display text-[clamp(34px,5vw,64px)] leading-[0.95] font-bold tracking-tight">{entity.name}</h1>
            {entity.kind === "playlist" && <p className="mt-3 text-[14px] text-muted">{entity.description}</p>}
            <p className="mt-4 text-[13.5px] text-muted">
              {entity.kind === "album" ? (
                <>
                  <Link to={routes.artist(entity.provider, entity.artistIds[0])} className="font-semibold text-fg hover:underline">{entity.artistNames[0]}</Link>
                  {" · "}{entity.year}
                </>
              ) : (
                <span className="font-semibold text-fg">{entity.ownerName}</span>
              )}
              {" · "}{entity.kind === "playlist" ? entity.trackCount : tracks.length} canciones{total > 0 && ` · ${formatTotalDuration(total)}`}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => play(entity.provider, { kind, id: entity.id })}
          className="flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-[14px] font-semibold text-on-accent shadow-lg transition-transform hover:scale-[1.03]"
        >
          <Play className="size-4 fill-current" /> Reproducir
        </motion.button>
        {providers[entity.provider].capabilities.playback.shuffle && (
          <button
            onClick={toggleShuffle}
            className={`grid size-11 place-items-center rounded-full border border-line transition-colors hover:bg-hover ${shuffle ? "text-accent" : "text-muted"}`}
            aria-label="Aleatorio"
          >
            <Shuffle className="size-4" />
          </button>
        )}
        <OpenInService provider={entity.provider} kind={kind} id={entity.id} preview={registry.tryGet(entity.provider)?.isPreview ?? true} />
      </div>

      {entity.kind === "playlist" && "tracksRestricted" in entity && entity.tracksRestricted && (
        <Notice>
          {providers[entity.provider].name} solo permite a las apps de terceros listar el contenido de playlists tuyas o colaborativas.
          Puedes reproducirla igualmente: sonará en tu dispositivo con su orden original.
        </Notice>
      )}
      <TrackList
        tracks={tracks}
        context={{ kind, id: entity.id }}
        numbered={kind === "album"}
        showCover={kind === "playlist"}
        showAlbum={kind === "playlist"}
      />
      {more}
    </>
  );
}

/** Atribución y enlace al contenido en el servicio original (Design Guidelines). */
function OpenInService({ provider, kind, id, preview }: { provider: ProviderId; kind: "album" | "playlist"; id: string; preview: boolean }) {
  const url = serviceUrl(provider, kind, id);
  const name = providers[provider].name;
  if (preview || !url) {
    return (
      <span title="Disponible al conectar el servicio" className="ml-auto flex cursor-not-allowed items-center gap-1.5 text-[12.5px] text-faint">
        <ExternalLink className="size-3.5" /> Abrir en {name}
      </span>
    );
  }
  return (
    <button onClick={() => openExternal(url)} className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-fg">
      <ExternalLink className="size-3.5" /> Abrir en {name}
    </button>
  );
}
