import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { z } from "zod";
import { createKvStateStorage } from "@/database/zustandStorage";

export type Theme = "dark" | "light" | "system" | "oled";
export type SidebarStyle = "expanded" | "rail" | "floating";
export type PlayerStyle = "bar" | "island" | "minimal";
export type MotionLevel = "full" | "reduced" | "off";
export type Density = "comfortable" | "compact";
export type Glass = "off" | "subtle" | "strong";
export type NowPlayingLayout = "stage" | "split" | "disc";
export type Typeface = "grotesk" | "editorial" | "mono";
export type Corners = "round" | "soft" | "sharp";
export type BgStyle = "aurora" | "blur" | "gradient" | "off";
export type NpBackground = "aurora" | "blur" | "artwork";
export type CoverShape = "rounded" | "square" | "circle";

export const accents = {
  ambar: { name: "Ámbar", value: "#FF7A2F" },
  fucsia: { name: "Fucsia", value: "#FF3D7F" },
  menta: { name: "Menta", value: "#2BD9A5" },
  cobalto: { name: "Cobalto", value: "#4C7DFF" },
  lila: { name: "Lila", value: "#A974FF" },
  lima: { name: "Lima", value: "#C6F432" },
} as const;
export type AccentId = keyof typeof accents | "custom";

/** Secciones de Inicio, en el orden por defecto. */
export const homeSectionIds = ["quick", "recent", "albums", "playlists", "artists"] as const;
export type HomeSectionId = (typeof homeSectionIds)[number];
export const homeSectionLabels: Record<HomeSectionId, string> = {
  quick: "Accesos rápidos",
  recent: "Escuchado recientemente",
  albums: "Tus álbumes",
  playlists: "Tus playlists",
  artists: "Artistas más escuchados",
};

/** Entradas de la barra lateral que se pueden ocultar (Inicio y Configuración siempre están). */
export const navIds = ["search", "library", "albums", "artists", "songs", "playlists", "favorites", "queue"] as const;
export type NavId = (typeof navIds)[number];

export interface AppearanceState {
  theme: Theme;
  accent: AccentId;
  /** Color del acento cuando `accent` es "custom". */
  customAccent: string;
  /** Si está activo, el acento se toma de la portada en reproducción. */
  accentFromArtwork: boolean;
  typeface: Typeface;
  corners: Corners;
  bgStyle: BgStyle;
  /** 0–100; 50 es la intensidad de referencia. */
  bgIntensity: number;
  glass: Glass;
  sidebarStyle: SidebarStyle;
  hiddenNav: NavId[];
  playerStyle: PlayerStyle;
  motion: MotionLevel;
  density: Density;
  homeSections: { id: HomeSectionId; visible: boolean }[];
  nowPlayingLayout: NowPlayingLayout;
  npBackground: NpBackground;
  npCoverShape: CoverShape;
  npShowQueue: boolean;
}

export interface CustomPreset { id: string; name: string; values: AppearanceState }

export const layoutPresets: Record<string, { name: string; description: string; values: Partial<AppearanceState> }> = {
  estudio: {
    name: "Estudio",
    description: "Barra lateral completa y reproductor anclado. El equilibrio por defecto.",
    values: { sidebarStyle: "expanded", playerStyle: "bar", density: "comfortable" },
  },
  escenario: {
    name: "Escenario",
    description: "Paneles flotantes sobre el fondo dinámico, con el reproductor en una isla.",
    values: { sidebarStyle: "floating", playerStyle: "island", density: "comfortable", bgStyle: "blur", glass: "strong" },
  },
  consola: {
    name: "Consola",
    description: "Riel de iconos, reproductor mínimo y listas densas. Máximo contenido.",
    values: { sidebarStyle: "rail", playerStyle: "minimal", density: "compact" },
  },
  cassette: {
    name: "Cassette",
    description: "Tipografía mono, esquinas rectas y fondo en degradado. Un guiño analógico.",
    values: { sidebarStyle: "expanded", playerStyle: "minimal", typeface: "mono", corners: "sharp", bgStyle: "gradient", npCoverShape: "square" },
  },
};

export const defaults: AppearanceState = {
  theme: "dark",
  accent: "ambar",
  customAccent: "#FF7A2F",
  accentFromArtwork: false,
  typeface: "grotesk",
  corners: "round",
  bgStyle: "aurora",
  bgIntensity: 50,
  glass: "subtle",
  sidebarStyle: "expanded",
  hiddenNav: [],
  playerStyle: "bar",
  motion: "full",
  density: "comfortable",
  homeSections: homeSectionIds.map((id) => ({ id, visible: true })),
  nowPlayingLayout: "stage",
  npBackground: "aurora",
  npCoverShape: "rounded",
  npShowQueue: true,
};

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Garantiza que estén todas las secciones, sin duplicados, respetando el orden guardado. */
function normalizeHomeSections(xs: { id: HomeSectionId; visible: boolean }[]) {
  const seen = new Set<HomeSectionId>();
  const out = xs.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
  for (const id of homeSectionIds) if (!seen.has(id)) out.push({ id, visible: true });
  return out;
}

/**
 * Esquema de validación de lo que se lee del disco. Cada campo inválido o
 * ausente vuelve a su valor por defecto, sin descartar el resto.
 */
export const appearanceSchema = z.object({
  theme: z.enum(["dark", "light", "system", "oled"]).catch(defaults.theme),
  accent: z.enum([...(Object.keys(accents) as (keyof typeof accents)[]), "custom"]).catch(defaults.accent),
  customAccent: hexColor.catch(defaults.customAccent),
  accentFromArtwork: z.boolean().catch(defaults.accentFromArtwork),
  typeface: z.enum(["grotesk", "editorial", "mono"]).catch(defaults.typeface),
  corners: z.enum(["round", "soft", "sharp"]).catch(defaults.corners),
  bgStyle: z.enum(["aurora", "blur", "gradient", "off"]).catch(defaults.bgStyle),
  bgIntensity: z.number().int().min(0).max(100).catch(defaults.bgIntensity),
  glass: z.enum(["off", "subtle", "strong"]).catch(defaults.glass),
  sidebarStyle: z.enum(["expanded", "rail", "floating"]).catch(defaults.sidebarStyle),
  // Se ignoran entradas que ya no existen (p. ej. "explore", retirada en 1.0.1) sin perder el resto.
  hiddenNav: z.array(z.string()).catch(defaults.hiddenNav)
    .transform((xs) => [...new Set(xs.filter((x): x is NavId => (navIds as readonly string[]).includes(x)))]),
  playerStyle: z.enum(["bar", "island", "minimal"]).catch(defaults.playerStyle),
  motion: z.enum(["full", "reduced", "off"]).catch(defaults.motion),
  density: z.enum(["comfortable", "compact"]).catch(defaults.density),
  homeSections: z.array(z.object({ id: z.enum(homeSectionIds), visible: z.boolean() }))
    .catch(defaults.homeSections).transform(normalizeHomeSections),
  nowPlayingLayout: z.enum(["stage", "split", "disc"]).catch(defaults.nowPlayingLayout),
  npBackground: z.enum(["aurora", "blur", "artwork"]).catch(defaults.npBackground),
  npCoverShape: z.enum(["rounded", "square", "circle"]).catch(defaults.npCoverShape),
  npShowQueue: z.boolean().catch(defaults.npShowQueue),
});

export function parseAppearance(raw: unknown): AppearanceState {
  const obj = typeof raw === "object" && raw ? { ...(raw as Record<string, unknown>) } : {};
  // Migración v1 → v2: `dynamicBackground: false` pasa a `bgStyle: "off"`.
  if (obj.bgStyle === undefined && obj.dynamicBackground === false) obj.bgStyle = "off";
  return appearanceSchema.parse(obj);
}

export const MAX_CUSTOM_PRESETS = 12;

const presetsSchema = z.array(z.object({ id: z.string().min(1).max(64), name: z.string().min(1).max(40), values: z.unknown() }))
  .catch([])
  .transform((xs) => xs.slice(0, MAX_CUSTOM_PRESETS).map((p) => ({ ...p, values: parseAppearance(p.values) })));

interface AppearanceStore extends AppearanceState {
  customPresets: CustomPreset[];
  set: <K extends keyof AppearanceState>(key: K, value: AppearanceState[K]) => void;
  applyPreset: (id: string) => void;
  reset: () => void;
  savePreset: (name: string) => void;
  applyCustomPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  toggleNav: (id: NavId, visible: boolean) => void;
  moveHomeSection: (id: HomeSectionId, dir: -1 | 1) => void;
  toggleHomeSection: (id: HomeSectionId, visible: boolean) => void;
}

const pickState = (s: AppearanceState): AppearanceState => parseAppearance(s);

export const useAppearance = create<AppearanceStore>()(
  persist(
    (set, get) => ({
      ...defaults,
      customPresets: [],
      set: (key, value) => set({ [key]: value } as Partial<AppearanceState>),
      applyPreset: (id) => set(layoutPresets[id]?.values ?? {}),
      reset: () => set(defaults),
      savePreset: (name) => {
        const clean = name.trim().slice(0, 40);
        if (!clean) return;
        const preset: CustomPreset = { id: `p${Date.now().toString(36)}`, name: clean, values: pickState(get()) };
        set((s) => ({ customPresets: [preset, ...s.customPresets].slice(0, MAX_CUSTOM_PRESETS) }));
      },
      applyCustomPreset: (id) => {
        const p = get().customPresets.find((x) => x.id === id);
        if (p) set(p.values);
      },
      deletePreset: (id) => set((s) => ({ customPresets: s.customPresets.filter((p) => p.id !== id) })),
      toggleNav: (id, visible) => set((s) => ({ hiddenNav: visible ? s.hiddenNav.filter((x) => x !== id) : [...new Set([...s.hiddenNav, id])] })),
      moveHomeSection: (id, dir) => set((s) => {
        const xs = [...s.homeSections];
        const i = xs.findIndex((x) => x.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= xs.length) return {};
        [xs[i], xs[j]] = [xs[j], xs[i]];
        return { homeSections: xs };
      }),
      toggleHomeSection: (id, visible) => set((s) => ({ homeSections: s.homeSections.map((x) => (x.id === id ? { ...x, visible } : x)) })),
    }),
    {
      name: "appearance",
      version: 2,
      storage: createJSONStorage(() => createKvStateStorage()),
      partialize: (s) => ({ ...parseAppearance(s), customPresets: s.customPresets }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { customPresets?: unknown };
        return { ...current, ...parseAppearance(persisted), customPresets: presetsSchema.parse(p.customPresets ?? []) };
      },
      // La validación de `merge` ya tolera versiones anteriores.
      migrate: (persisted) => persisted as never,
      skipHydration: true,
    },
  ),
);

/** Tema efectivo (resuelve "system" y "oled"). */
export function resolveTheme(theme: Theme, prefersDark: boolean): { scheme: "dark" | "light"; oled: boolean } {
  if (theme === "system") return { scheme: prefersDark ? "dark" : "light", oled: false };
  if (theme === "oled") return { scheme: "dark", oled: true };
  return { scheme: theme, oled: false };
}
