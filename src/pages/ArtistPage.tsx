import { Play, UserRound } from "lucide-react";
import { useParams } from "react-router-dom";
import { Cover } from "@/components/Cover";
import { MediaCard } from "@/components/MediaCard";
import { LoadMore } from "@/components/LoadMore";
import { ProviderBadge } from "@/components/ProviderBadge";
import { TrackList } from "@/components/TrackList";
import { CardSkeletons, EmptyState, QueryError, RowSkeletons, Skeleton } from "@/components/ui";
import { useArtist, useArtistAlbums, useArtistTopTracks } from "@/features/catalog/queries";
import { usePlayer } from "@/stores/player";
import { providerIds, providers } from "@/providers/registry";
import { NotFoundError } from "@/providers/errors";
import type { ProviderId } from "@/types/music";
import { usePalette } from "@/utils/palette";

export function ArtistPage() {
  const { provider = "", id = "" } = useParams();
  if (!providerIds.includes(provider as ProviderId)) return <EmptyState icon={<UserRound className="size-6" />} title="Servicio desconocido" />;
  return <ArtistView provider={provider as ProviderId} id={id} />;
}

function ArtistView({ provider, id }: { provider: ProviderId; id: string }) {
  const play = usePlayer((s) => s.play);
  const artist = useArtist(provider, id);
  const albums = useArtistAlbums(provider, id);
  const top = useArtistTopTracks(provider, id);
  const caps = providers[provider].capabilities;
  const [c1, c2] = usePalette(artist.data?.artwork);

  if (artist.isLoading) return <div className="pt-6"><Skeleton className="h-[280px] w-full rounded-[24px]" /></div>;
  if (artist.error instanceof NotFoundError) return <EmptyState icon={<UserRound className="size-6" />} title="Artista no encontrado" />;
  if (artist.error || !artist.data) return <QueryError error={artist.error} onRetry={() => artist.refetch()} />;

  const a = artist.data;

  return (
    <>
      <div className="relative -mx-[var(--page-px)] -mt-8 mb-8 flex h-[320px] items-end overflow-hidden px-[var(--page-px)] pb-8">
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 70% 0%, ${c1}, transparent 60%), linear-gradient(160deg, ${c2}, var(--bg) 85%)` }} />
        <div className="relative flex items-end gap-7">
          <Cover artwork={a.artwork} className="size-[170px]" rounded="rounded-full" />
          <div className="pb-2">
            <ProviderBadge provider={a.provider} />
            <h1 className="mt-3 font-display text-[clamp(40px,6vw,76px)] leading-[0.9] font-bold tracking-tight text-white">{a.name}</h1>
            <p className="mt-3 text-[13.5px] text-white/75">{a.genres.join(" · ")}</p>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <button
          onClick={() => play(provider, { kind: "artist", id })}
          className="flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-[14px] font-semibold text-on-accent shadow-lg transition-transform hover:scale-[1.03]"
        >
          <Play className="size-4 fill-current" /> Reproducir
        </button>
      </div>

      {caps.catalog.artistTopTracks && (
        <section className="mb-10">
          <h2 className="mb-4 font-display text-[20px] font-semibold">Populares</h2>
          {top.isLoading ? <RowSkeletons count={5} />
            : top.error ? <QueryError error={top.error} onRetry={() => top.refetch()} />
            : <TrackList tracks={top.data ?? []} numbered showAlbum={false} />}
        </section>
      )}

      <section>
        <h2 className="mb-4 font-display text-[20px] font-semibold">Discografía</h2>
        {albums.error ? <QueryError error={albums.error} onRetry={() => albums.refetch()} /> : (
          <>
            <div className="flex flex-wrap gap-5">
              {albums.isLoading && <CardSkeletons count={4} />}
              {albums.data?.pages.flatMap((p) => p.items).map((al) => <MediaCard key={al.id} entity={al} />)}
            </div>
            <LoadMore hasMore={!!albums.hasNextPage} loading={albums.isFetchingNextPage} onLoad={() => albums.fetchNextPage()} label="Ver más lanzamientos" />
          </>
        )}
      </section>
    </>
  );
}
