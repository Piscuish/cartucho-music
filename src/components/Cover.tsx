import clsx from "clsx";
import type { Artwork, GeneratedArt } from "@/types/music";

/** Portada: imagen real si existe; si no, arte generado (vista previa). */
export function Cover({ artwork, className, rounded = "rounded-[var(--radius-cover)]", alt = "" }: {
  artwork: Artwork;
  className?: string;
  rounded?: string;
  alt?: string;
}) {
  return (
    <div className={clsx("relative aspect-square overflow-hidden bg-hover shadow-[var(--shadow)]", rounded, className)}>
      {artwork.url ? (
        <img src={artwork.url} alt={alt} className="h-full w-full object-cover" draggable={false} />
      ) : artwork.generated ? (
        <GeneratedCover art={artwork.generated} />
      ) : null}
    </div>
  );
}

function GeneratedCover({ art }: { art: GeneratedArt }) {
  const { from, to, shape } = art;
  const id = `g-${from.slice(1)}-${to.slice(1)}-${shape}`;
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${id})`} />
      {shape === "orbit" && (
        <g fill="none" stroke="#fff" strokeOpacity="0.35">
          <circle cx="62" cy="40" r="14" fill="#fff" fillOpacity="0.85" stroke="none" />
          <ellipse cx="62" cy="40" rx="34" ry="9" transform="rotate(-18 62 40)" strokeWidth="1.2" />
          <ellipse cx="62" cy="40" rx="46" ry="14" transform="rotate(-18 62 40)" strokeWidth="0.6" />
        </g>
      )}
      {shape === "stripes" && (
        <g fill="#fff">
          {Array.from({ length: 9 }, (_, i) => (
            <rect key={i} x="0" y={18 + i * 8} width="100" height={0.6 + i * 0.35} opacity={0.12 + i * 0.07} />
          ))}
        </g>
      )}
      {shape === "grid" && (
        <g stroke="#fff" strokeOpacity="0.28" strokeWidth="0.5">
          {Array.from({ length: 11 }, (_, i) => (
            <line key={`v${i}`} x1={50 + (i - 5) * 4} y1="55" x2={50 + (i - 5) * 18} y2="100" />
          ))}
          {Array.from({ length: 7 }, (_, i) => {
            const y = 55 + Math.pow(i, 1.6) * 3.2;
            return <line key={`h${i}`} x1="0" y1={y} x2="100" y2={y} />;
          })}
          <circle cx="50" cy="38" r="16" fill="#fff" fillOpacity="0.2" stroke="none" />
        </g>
      )}
      {shape === "wave" && (
        <g fill="none" stroke="#fff" strokeLinecap="round">
          {Array.from({ length: 6 }, (_, i) => (
            <path key={i} d={`M-5 ${40 + i * 9} Q 25 ${30 + i * 9}, 50 ${40 + i * 9} T 105 ${40 + i * 9}`}
              strokeOpacity={0.15 + i * 0.1} strokeWidth={0.8 + i * 0.3} />
          ))}
        </g>
      )}
      {shape === "sun" && (
        <g>
          <circle cx="50" cy="62" r="26" fill="#fff" fillOpacity="0.82" />
          {Array.from({ length: 5 }, (_, i) => (
            <rect key={i} x="0" y={62 + i * 6} width="100" height={2 + i * 0.6} fill={to} />
          ))}
        </g>
      )}
    </svg>
  );
}
