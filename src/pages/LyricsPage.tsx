import { MicVocal } from "lucide-react";
import { Cover } from "@/components/Cover";
import { EmptyState } from "@/components/ui";
import { LyricsSizeControl, LyricsView } from "@/features/lyrics/LyricsView";
import { usePlayer } from "@/stores/player";

/** Letra a pantalla completa (botón de letra del reproductor). */
export function LyricsPage() {
  const t = usePlayer((s) => s.state?.track ?? null);
  if (!t) return <EmptyState icon={<MicVocal className="size-6" />} title="No hay nada sonando">Reproduce una canción para ver su letra.</EmptyState>;
  return (
    <div className="flex h-[calc(100vh-var(--titlebar-h)-var(--player-h)-4rem)] min-h-[360px] flex-col max-sm:h-[calc(100dvh-var(--safe-top)-220px)]">
      <header className="mb-2 flex items-center gap-3">
        <Cover artwork={t.artwork} className="size-12 shrink-0" rounded="rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Letra</div>
          <div className="truncate text-[15px] font-semibold">{t.name}</div>
          <div className="truncate text-[12.5px] text-muted">{t.artistNames.join(", ")}</div>
        </div>
        <LyricsSizeControl />
      </header>
      <LyricsView track={t} className="flex-1" />
    </div>
  );
}
