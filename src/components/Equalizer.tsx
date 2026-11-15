import clsx from "clsx";

export function Equalizer({ className, paused }: { className?: string; paused?: boolean }) {
  return (
    <span className={clsx("flex h-3.5 items-end gap-[2px]", className)} aria-label="Reproduciendo">
      {[0.9, 0.6, 1.1].map((d, i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom rounded-full bg-accent"
          style={{ height: "100%", animation: paused ? "none" : `eq ${d}s ease-in-out ${i * 0.15}s infinite`, transform: paused ? "scaleY(0.3)" : undefined }}
        />
      ))}
    </span>
  );
}
