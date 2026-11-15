import type { ReactNode } from "react";

export function SectionTitle({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="mb-7 flex items-start justify-between gap-6">
      <div>
        <h2 className="font-display text-[26px] font-bold tracking-tight">{title}</h2>
        {description && <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-4 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[14px] font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-[12.5px] text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
