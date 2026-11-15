import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * Centinela de scroll infinito: cuando entra en pantalla pide la página siguiente.
 * También ofrece un botón por accesibilidad (y por si el observador no dispara).
 */
export function LoadMore({ hasMore, loading, onLoad, label = "Cargar más" }: { hasMore: boolean; loading: boolean; onLoad: () => void; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) onLoad(); }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, onLoad]);
  if (!hasMore && !loading) return null;
  return (
    <div ref={ref} className="flex justify-center py-6">
      {loading ? (
        <Loader2 className="size-5 animate-spin text-muted" aria-label="Cargando" />
      ) : (
        <button onClick={onLoad} className="rounded-full border border-line px-4 py-1.5 text-[12.5px] font-medium text-muted hover:bg-hover hover:text-fg">
          {label}
        </button>
      )}
    </div>
  );
}
