import { motion } from "framer-motion";
import { Play } from "lucide-react";
import { Link } from "react-router-dom";
import { Cover } from "@/components/Cover";
import { MediaCard } from "@/components/MediaCard";
import { PreviewBanner } from "@/components/PreviewBanner";
import { ProviderBadge } from "@/components/ProviderBadge";
import { CardSkeletons, Notice, QueryError, Shelf, Skeleton } from "@/components/ui";
import { useLibraryItems, type ProviderSlice } from "@/features/library/queries";
import { useRecentlyPlayed, useRecommendations, useTopArtists } from "@/features/home/queries";
import { usePlayer } from "@/stores/player";
import { greeting } from "@/utils/format";
import { routes } from "@/utils/routes";
import type { Album, Playlist, Track } from "@/types/music";
import { Fragment, type ReactNode } from "react";
import { useAppearance, type HomeSectionId } from "@/stores/appearance";

/** Intercala los trozos de cada proveedor sin fusionarlos (cada elemento conserva su procedencia). */
function interleave<T>(slices: ProviderSlice<T>[]): T[] {
  const out: T[] = [];
  const max = Math.max(0, ...slices.map((s) => s.items.length));
  for (let i = 0; i < max; i++) for (const s of slices) if (s.items[i]) out.push(s.items[i]);
  return out;
}

function SliceShelf<T>({ title, subtitle, slices, render, round }: {
  title: string; subtitle?: string; slices: ProviderSlice<T>[]; render: (item: T) => ReactNode; round?: boolean;
}) {
  const loading = slices.some((s) => s.isLoading);
  const errors = slices.filter((s) => s.error);
  const items = interleave(slices);
  if (!loading && !items.length && !errors.length) return null;
  return (
    <Shelf title={title} subtitle={subtitle}>
      {items.map(render)}
      {loading && <CardSkeletons count={items.length ? 2 : 6} round={round} />}
      {errors.map((s) => <div key={s.provider.id} className="w-72 shrink-0"><QueryError error={s.error} /></div>)}
    </Shelf>
  );
}

export function HomePage() {
  const play = usePlayer((s) => s.play);
  const homeSections = useAppearance((s) => s.homeSections);
  const recent = useRecentlyPlayed();
  const top = useTopArtists();
  const recs = useRecommendations();
  const albums = useLibraryItems("albums");
  const playlists = useLibraryItems("playlists");

  const quick: (Album | Playlist)[] = interleave([...playlists, ...albums] as ProviderSlice<Album | Playlist>[]).slice(0, 6);
  const quickLoading = albums.some((s) => s.isLoading) || playlists.some((s) => s.isLoading);

  const playTrack = (t: Track, list: Track[]) => {
    const same = list.filter((x) => x.provider === t.provider);
    void play(t.provider, { kind: "tracks", trackIds: same.map((x) => x.id), startIndex: same.indexOf(t) });
  };


  const sections: Record<HomeSectionId, () => ReactNode> = {
    quick: () => (
      <div className="mb-[calc(var(--gap)*1.4)] grid grid-cols-2 gap-3 xl:grid-cols-3">
        {quickLoading && !quick.length && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14 rounded-[var(--radius-control)]" />)}
        {quick.map((c, i) => (
          <motion.div
            key={`${c.provider}:${c.id}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="group relative flex items-center gap-3 overflow-hidden rounded-[var(--radius-control)] bg-hover pr-3 transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]"
          >
            <Link to={c.kind === "album" ? routes.album(c.provider, c.id) : routes.playlist(c.provider, c.id)} className="flex min-w-0 flex-1 items-center gap-3">
              <Cover artwork={c.artwork} className="size-14 shrink-0 shadow-none" rounded="rounded-none" />
              <span className="truncate text-[14px] font-semibold">{c.name}</span>
            </Link>
            <ProviderBadge provider={c.provider} compact />
            <button
              aria-label={`Reproducir ${c.name}`}
              onClick={() => play(c.provider, { kind: c.kind, id: c.id })}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent opacity-0 shadow transition-opacity group-hover:opacity-100"
            >
              <Play className="size-4 fill-current" />
            </button>
          </motion.div>
        ))}
      </div>
    ),
    recent: () => (
      <SliceShelf
        title="Escuchado recientemente"
        subtitle="Tu historial de reproducción, por servicio"
        slices={recent.slices}
        render={(t) => {
          const all = interleave(recent.slices);
          return (
            <motion.button key={`${t.provider}:${t.id}`} whileHover={{ y: -4 }} onClick={() => playTrack(t, all)} className="w-[var(--card-w)] shrink-0 text-left">
              <Cover artwork={t.artwork} />
              <div className="mt-3 flex items-center gap-1.5">
                <ProviderBadge provider={t.provider} compact />
                <span className="truncate text-[14px] font-semibold">{t.name}</span>
              </div>
              <div className="mt-1 truncate text-[12.5px] text-muted">{t.artistNames.join(", ")}</div>
            </motion.button>
          );
        }}
      />
    ),
    albums: () => <SliceShelf title="Tus álbumes" slices={albums} render={(a) => <MediaCard key={`${a.provider}:${a.id}`} entity={a} />} />,
    playlists: () => <SliceShelf title="Tus playlists" slices={playlists} render={(p) => <MediaCard key={`${p.provider}:${p.id}`} entity={p} />} />,
    artists: () => <SliceShelf title="Artistas más escuchados" subtitle="Últimas 4 semanas" round slices={top.slices} render={(a) => <MediaCard key={`${a.provider}:${a.id}`} entity={a} />} />,
  };

  return (
    <>
      <PreviewBanner />

      <div className="mb-[var(--gap)]">
        <div className="eyebrow mb-2">
          {new Date().toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}
        </div>
        <h1 className="font-display text-[42px] leading-[1.05] font-bold tracking-tight">{greeting()}</h1>
      </div>

      {/* Secciones en el orden y con la visibilidad elegidos en Ajustes → Apariencia → Inicio. */}
      {homeSections.filter((x) => x.visible).map(({ id }) => <Fragment key={id}>{sections[id]()}</Fragment>)}

      {/* Solo si algún servicio visible ofrece recomendaciones a terceros. */}
      {recs.slices.length > 0 && <section className="mb-10">
        <h2 className="mb-1 font-display text-[20px] font-semibold tracking-tight">Recomendado para ti</h2>
        <p className="mb-4 text-[13px] text-muted">Solo de los servicios que ofrecen recomendaciones a apps de terceros.</p>
        {recs.unsupported.map((p) => (
          <div key={p.id} className="mb-4">
            <Notice>
              <b className="text-fg">{p.displayName}</b> no ofrece recomendaciones a aplicaciones de terceros (endpoint retirado en noviembre de 2024), así que esta sección no muestra contenido de {p.displayName}.
            </Notice>
          </div>
        ))}
        <div className="-mx-2 flex gap-5 overflow-x-auto px-2 pt-1 pb-3 [scrollbar-width:none]">
          {interleave(recs.slices).map((a) => <MediaCard key={`${a.provider}:${a.id}`} entity={a} />)}
          {recs.slices.some((s) => s.isLoading) && <CardSkeletons count={4} />}
        </div>
      </section>}
    </>
  );
}
