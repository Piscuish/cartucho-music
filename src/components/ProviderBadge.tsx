import clsx from "clsx";
import type { ProviderId } from "@/types/music";
import { providers } from "@/providers/registry";

/** Indica claramente la procedencia de cada elemento. */
export function ProviderBadge({ provider, compact, className }: { provider: ProviderId; compact?: boolean; className?: string }) {
  const p = providers[provider];
  return (
    <span
      title={`Procedencia: ${p.name}`}
      className={clsx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full text-[10.5px] font-medium leading-none",
        compact ? "p-0" : "border border-line bg-hover px-2 py-1 text-muted",
        className,
      )}
    >
      <span className="size-2 rounded-full" style={{ background: p.color, boxShadow: `0 0 8px ${p.color}66` }} />
      {!compact && p.name}
    </span>
  );
}
