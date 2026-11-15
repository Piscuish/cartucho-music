import { motion } from "framer-motion";
import { Play } from "lucide-react";
import { Link } from "react-router-dom";
import type { Album, Artist, Playlist } from "@/types/music";
import { Cover } from "./Cover";
import { ProviderBadge } from "./ProviderBadge";
import { albumTypeLabel } from "@/utils/format";
import { routes } from "@/utils/routes";
import { usePlayer } from "@/stores/player";

type Entity = Album | Artist | Playlist;

const hrefOf = (e: Entity) => (e.kind === "artist" ? routes.artist(e.provider, e.id) : e.kind === "album" ? routes.album(e.provider, e.id) : routes.playlist(e.provider, e.id));

const subtitleOf = (e: Entity) =>
  e.kind === "album" ? `${albumTypeLabel[e.albumType]} · ${e.artistNames.join(", ")}`
  : e.kind === "playlist" ? `${e.trackCount} canciones · ${e.ownerName}`
  : e.genres.join(" · ");

/** Tarjeta de álbum, playlist o artista. Reproduce en el contexto de su propio proveedor. */
export function MediaCard({ entity, playable = true }: { entity: Entity; playable?: boolean }) {
  const play = usePlayer((s) => s.play);
  const round = entity.kind === "artist" ? "rounded-full" : "rounded-[var(--radius-cover)]";
  const canPlay = playable && entity.kind !== "artist";
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      className="group relative w-[var(--card-w)] shrink-0"
    >
      <Link to={hrefOf(entity)} className="-m-2 block rounded-[var(--radius-card)] p-2 transition-colors hover:bg-hover">
        <div className="relative">
          <Cover artwork={entity.artwork} rounded={round} />
          {canPlay && (
            <button
              aria-label={`Reproducir ${entity.name}`}
              onClick={(e) => { e.preventDefault(); void play(entity.provider, { kind: entity.kind, id: entity.id }); }}
              className="absolute right-2.5 bottom-2.5 grid size-11 translate-y-2 place-items-center rounded-full bg-accent text-on-accent opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 hover:scale-105"
            >
              <Play className="size-5 fill-current" />
            </button>
          )}
        </div>
        <div className={entity.kind === "artist" ? "mt-3 text-center" : "mt-3"}>
          <div className="flex items-center gap-1.5">
            {entity.kind !== "artist" && <ProviderBadge provider={entity.provider} compact />}
            <div className="truncate text-[14px] font-semibold">{entity.name}</div>
          </div>
          <div className="mt-1 truncate text-[12.5px] text-muted">{subtitleOf(entity)}</div>
          {entity.kind === "artist" && <ProviderBadge provider={entity.provider} className="mt-2" />}
        </div>
      </Link>
    </motion.div>
  );
}
