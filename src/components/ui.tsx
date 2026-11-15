import clsx from "clsx";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { describeError } from "@/providers/errors";

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-[var(--gap)] flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="font-display text-[34px] leading-none font-bold tracking-tight">{title}</h1>
      </div>
      {children}
    </header>
  );
}

/** Estante horizontal con desplazamiento por botones. */
export function Shelf({ title, subtitle, children, action }: { title: string; subtitle?: string; children: ReactNode; action?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <section className="mb-[calc(var(--gap)*1.4)]">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-[20px] font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1">
          {action}
          <IconButton label="Anterior" onClick={() => scroll(-1)}><ChevronLeft className="size-4" /></IconButton>
          <IconButton label="Siguiente" onClick={() => scroll(1)}><ChevronRight className="size-4" /></IconButton>
        </div>
      </div>
      <div ref={ref} className="-mx-2 flex gap-5 overflow-x-auto px-2 pt-1 pb-3 [scrollbar-width:none]">
        {children}
      </div>
    </section>
  );
}

export function IconButton({ label, onClick, children, active, disabled, className, size = "md" }: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "relative grid shrink-0 place-items-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-30",
        size === "sm" ? "size-7" : size === "lg" ? "size-11" : "size-9",
        active ? "text-accent" : "text-muted hover:bg-hover hover:text-fg",
        className,
      )}
    >
      {children}
      {active && <span className="absolute bottom-0.5 size-1 rounded-full bg-accent" />}
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options, layoutId }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  layoutId: string;
}) {
  return (
    <div className="inline-flex rounded-full border border-line bg-hover p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx("relative rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors", value === o.value ? "text-on-accent" : "text-muted hover:text-fg")}
        >
          {value === o.value && (
            <motion.span layoutId={layoutId} className="absolute inset-0 rounded-full bg-accent" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
        active ? "border-transparent bg-fg text-bg" : "border-line text-muted hover:border-faint hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

/** Aviso de restricción de una API: explica por qué algo no está disponible. */
export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "preview" }) {
  return (
    <div className={clsx(
      "flex items-start gap-2.5 rounded-[var(--radius-control)] border px-3.5 py-2.5 text-[12.5px] leading-relaxed",
      tone === "preview" ? "border-accent/30 bg-accent/10 text-fg" : "border-line bg-hover text-muted",
    )}>
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-[var(--radius-card)] border border-dashed border-line px-6 py-16 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-hover text-muted">{icon}</div>
      <h3 className="font-display text-[17px] font-semibold">{title}</h3>
      {children && <div className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx("relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40", checked ? "bg-accent" : "bg-faint/50")}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 34 }}
        className={clsx("absolute top-1 size-4 rounded-full bg-white shadow", checked ? "right-1" : "left-1")}
      />
    </button>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-[var(--radius-cover)] bg-hover", className)} aria-hidden />;
}

/** Fila de tarjetas de carga para estantes y rejillas. */
export function CardSkeletons({ count = 6, round }: { count?: number; round?: boolean }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="w-[var(--card-w)] shrink-0" aria-busy>
          <Skeleton className={clsx("aspect-square", round && "rounded-full")} />
          <Skeleton className="mt-3 h-3.5 w-3/4 rounded-md" />
          <Skeleton className="mt-2 h-3 w-1/2 rounded-md" />
        </div>
      ))}
    </>
  );
}

export function RowSkeletons({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-1.5">
          <Skeleton className="size-10 rounded-md" />
          <div className="flex-1"><Skeleton className="h-3.5 w-1/3 rounded-md" /><Skeleton className="mt-2 h-3 w-1/5 rounded-md" /></div>
        </div>
      ))}
    </div>
  );
}

/** Error de una consulta, con mensaje legible y reintento. */
export function QueryError({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  return (
    <div className={clsx("flex items-center gap-3 rounded-[var(--radius-control)] border border-red-500/25 bg-red-500/[0.07] text-[12.5px]", compact ? "px-3 py-2" : "px-4 py-3")}>
      <Info className="size-4 shrink-0 text-red-400" />
      <span className="flex-1">{describeError(error)}</span>
      {onRetry && <button onClick={onRetry} className="rounded-full border border-line px-3 py-1 font-medium hover:bg-hover">Reintentar</button>}
    </div>
  );
}

export function PhasePill({ phase }: { phase: number }) {
  return (
    <span className="rounded-full border border-line px-2 py-0.5 text-[10.5px] font-medium whitespace-nowrap text-muted">
      Fase {phase}
    </span>
  );
}
