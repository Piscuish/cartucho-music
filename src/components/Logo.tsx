/** Isotipo de Cartucho Music: un cartucho con dos bobinas. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="cm-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="color-mix(in srgb, var(--accent) 45%, #ff3d7f)" />
        </linearGradient>
      </defs>
      <rect x="6" y="4" width="52" height="56" rx="13" fill="url(#cm-logo)" />
      <rect x="14" y="12" width="36" height="22" rx="5" fill="#0d0b12" opacity="0.92" />
      <circle cx="24" cy="23" r="5" fill="none" stroke="var(--accent)" strokeWidth="2.6" />
      <circle cx="40" cy="23" r="5" fill="none" stroke="var(--accent)" strokeWidth="2.6" />
      <path d="M15 46h34M15 52h34" stroke="#0d0b12" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-none">
        <div className="font-display text-[17px] font-bold tracking-tight">Cartucho</div>
        <div className="mt-0.5 font-display text-[9.5px] font-semibold tracking-[0.32em] text-muted">MUSIC</div>
      </div>
    </div>
  );
}
