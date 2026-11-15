import { Heart, Play } from "lucide-react";
import { TrackList } from "@/components/TrackList";
import { LoadMore } from "@/components/LoadMore";
import { EmptyState, QueryError, RowSkeletons } from "@/components/ui";
import { useLibraryInfinite } from "@/features/library/queries";
import { usePlayer } from "@/stores/player";
import { providers } from "@/providers/registry";

/** Canciones guardadas en cada servicio, en secciones separadas y con scroll infinito. */
export function FavoritesPage() {
  const slices = useLibraryInfinite("tracks");
  const play = usePlayer((s) => s.play);
  const totalCount = slices.reduce((a, s) => a + (s.total ?? s.items.length), 0);
  const loading = slices.some((s) => s.isLoading);
  const empty = !loading && slices.every((s) => !s.items.length) && !slices.some((s) => s.error);

  return (
    <>
      <header className="mb-[var(--gap)] flex items-end gap-6">
        <div className="grid size-40 shrink-0 place-items-center rounded-[calc(var(--radius-cover)*1.4)] bg-[linear-gradient(135deg,var(--accent),color-mix(in_srgb,var(--accent)_30%,#2b1055))] shadow-[var(--shadow)]">
          <Heart className="size-16 fill-white text-white" />
        </div>
        <div>
          <div className="eyebrow mb-2">Colección</div>
          <h1 className="font-display text-[42px] leading-none font-bold tracking-tight">Favoritos</h1>
          <p className="mt-3 text-[13px] text-muted">{loading ? "Cargando…" : `${totalCount.toLocaleString("es")} canciones`}</p>
        </div>
      </header>

      {loading && <RowSkeletons count={6} />}
      {empty && (
        <EmptyState icon={<Heart className="size-6" />} title="Aún no tienes favoritos">
          Pulsa el corazón en cualquier canción para guardarla aquí.
        </EmptyState>
      )}

      {slices.map((s) => {
        const meta = providers[s.provider.id];
        if (s.error) return <div key={s.provider.id} className="mb-6"><QueryError error={s.error} /></div>;
        if (!s.items.length) return null;
        return (
          <section key={s.provider.id} className="mb-8">
            <div className="mb-3 flex items-center gap-3">
              <span className="size-2.5 rounded-full" style={{ background: meta.color }} />
              <h2 className="font-display text-[17px] font-semibold">Guardadas en {meta.name}</h2>
              <span className="text-[12.5px] text-muted">{(s.total ?? s.items.length).toLocaleString("es")}</span>
              <button
                onClick={() => play(s.provider.id, { kind: "tracks", trackIds: s.items.map((t) => t.id) })}
                className="ml-auto flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent transition-transform hover:scale-[1.03]"
              >
                <Play className="size-3.5 fill-current" /> Reproducir
              </button>
            </div>
            <TrackList tracks={s.items} allSaved />
            <LoadMore hasMore={s.hasMore} loading={s.fetchingMore} onLoad={s.fetchMore} />
          </section>
        );
      })}
    </>
  );
}
