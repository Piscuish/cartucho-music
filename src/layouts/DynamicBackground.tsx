import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useCurrentTrack } from "@/stores/player";
import { useAppearance, type BgStyle, type NpBackground } from "@/stores/appearance";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useLightMode } from "@/hooks/usePerformance";
import { toneForBackground, usePalette } from "@/utils/palette";

/**
 * Fondo ambiental a partir de la portada en reproducción.
 * - aurora: manchas de color animadas.
 * - blur: la propia portada, muy difuminada, a pantalla completa.
 * - gradient: degradado estático con los dos colores dominantes.
 * - artwork (solo Reproduciendo): la portada nítida tras un velo.
 * Los colores se atenúan para no competir con el texto.
 */
export function DynamicBackground({ intensity = 1, styleOverride }: { intensity?: number; styleOverride?: NpBackground }) {
  const globalStyle = useAppearance((s) => s.bgStyle);
  const level = useAppearance((s) => s.bgIntensity) / 50; // 50 → 1×
  const { scheme } = useColorScheme();
  const current = useCurrentTrack();
  const [rawA, rawB] = usePalette(current?.artwork);
  const light = useLightMode();
  const chosen: BgStyle | NpBackground = styleOverride ?? globalStyle;
  // En modo ligero, un degradado fijo: los desenfoques de 80–140 px son lo que más GPU gasta.
  const style: BgStyle | NpBackground = light && chosen !== "off" ? "gradient" : chosen;
  if (style === "off" || !current || level === 0) return null;

  const a = toneForBackground(rawA, scheme);
  const b = toneForBackground(rawB, scheme);
  const opacity = `calc(var(--dyn-opacity) * ${intensity * level})`;
  const url = current.artwork.url;

  let layer: ReactNode;
  if ((style === "blur" || style === "artwork") && url) {
    const sharp = style === "artwork";
    layer = (
      <>
        <img
          src={url}
          alt=""
          className="absolute inset-0 h-full w-full scale-125 object-cover"
          style={{ filter: sharp ? "saturate(1.1)" : "blur(80px) saturate(1.4)", opacity: sharp ? Math.min(1, 0.55 * level) : undefined }}
        />
        {sharp && <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--bg)_78%,transparent)] backdrop-blur-[2px]" />}
      </>
    );
  } else if (style === "gradient") {
    layer = <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${a} 0%, ${b} 55%, transparent 100%)` }} />;
  } else {
    layer = (
      <>
        <div className="anim-drift absolute -top-[30%] -left-[10%] h-[80%] w-[70%] rounded-full blur-[120px]"
          style={{ background: a, animation: "drift 22s ease-in-out infinite" }} />
        <div className="anim-drift absolute -right-[15%] -bottom-[30%] h-[85%] w-[70%] rounded-full blur-[140px]"
          style={{ background: b, animation: "drift 28s ease-in-out -8s infinite reverse" }} />
      </>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <AnimatePresence>
        <motion.div
          key={`${current.albumId}:${style}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2 }}
          className="absolute inset-0"
          style={{ opacity: style === "artwork" ? 1 : opacity }}
        >
          {layer}
        </motion.div>
      </AnimatePresence>
      {/* Viñeta para mantener la legibilidad */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--bg)_95%)] opacity-60" />
    </div>
  );
}
