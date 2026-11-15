import { motion } from "framer-motion";
import { MediaCard } from "@/components/MediaCard";
import { CardSkeletons, Notice, PageHeader, QueryError, Shelf } from "@/components/ui";
import { useNewReleases } from "@/features/home/queries";

/** Accesos de ánimo y género. En la Fase 4 abrirán búsquedas por categoría en cada servicio. */
const moods = [
  { name: "Energía", from: "#FF7A2F", to: "#FF3D7F" },
  { name: "Concentración", from: "#4C7DFF", to: "#14102A" },
  { name: "Noche", from: "#7A1FFF", to: "#0B0A0F" },
  { name: "Relax", from: "#2BD9A5", to: "#1A2A6C" },
  { name: "Fiesta", from: "#C6F432", to: "#FF3D7F" },
  { name: "Acústico", from: "#E07A5F", to: "#3D405B" },
  { name: "Electrónica", from: "#3BC9DB", to: "#2B1055" },
  { name: "Soul & R&B", from: "#F2C14E", to: "#B23A48" },
];

export function ExplorePage() {
  const { slices, unsupported } = useNewReleases();
  const items = slices.flatMap((s) => s.items);
  const loading = slices.some((s) => s.isLoading);

  return (
    <>
      <PageHeader eyebrow="Descubre" title="Explorar" />

      <section className="mb-[calc(var(--gap)*1.4)]">
        <h2 className="mb-4 font-display text-[20px] font-semibold tracking-tight">Estados de ánimo y géneros</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {moods.map((m, i) => (
            <motion.div
              key={m.name}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03 }}
              className="relative h-28 overflow-hidden rounded-[var(--radius-card)] p-4 text-left text-white"
              style={{ background: `linear-gradient(135deg, ${m.from}, ${m.to})` }}
            >
              <span className="relative font-display text-[19px] font-bold">{m.name}</span>
              <span className="absolute -right-6 -bottom-6 size-24 rotate-12 rounded-2xl bg-white/15" />
            </motion.div>
          ))}
        </div>
      </section>

      <Shelf title="Novedades" subtitle="Lanzamientos recientes de los servicios que los publican">
        {items.map((a) => <MediaCard key={`${a.provider}:${a.id}`} entity={a} />)}
        {loading && <CardSkeletons count={5} />}
        {slices.filter((s) => s.error).map((s) => <div key={s.provider.id} className="w-72 shrink-0"><QueryError error={s.error} /></div>)}
      </Shelf>
      {unsupported.map((p) => (
        <Notice key={p.id}>
          <b className="text-fg">{p.displayName}</b> restringe el endpoint de novedades para apps en Development Mode (cambios de febrero de 2026), así que no se muestran lanzamientos de {p.displayName}.
        </Notice>
      ))}
    </>
  );
}
