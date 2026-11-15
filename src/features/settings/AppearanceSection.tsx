import clsx from "clsx";
import { ArrowDown, ArrowUp, Check, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Chip, Segmented, Toggle } from "@/components/ui";
import {
  accents, homeSectionLabels, layoutPresets, MAX_CUSTOM_PRESETS, useAppearance,
  type AccentId, type AppearanceState, type BgStyle, type CoverShape, type Corners, type Density, type Glass,
  type MotionLevel, type NavId, type NowPlayingLayout, type NpBackground, type PlayerStyle, type SidebarStyle, type Theme, type Typeface,
} from "@/stores/appearance";
import { navGroups } from "@/layouts/Sidebar";
import { Row, SectionTitle } from "./common";

type Tab = "layout" | "color" | "type" | "background" | "home" | "sidebar" | "nowplaying" | "motion";
const tabs: { id: Tab; label: string }[] = [
  { id: "layout", label: "Diseño" },
  { id: "color", label: "Color" },
  { id: "type", label: "Texto y forma" },
  { id: "background", label: "Fondo" },
  { id: "home", label: "Inicio" },
  { id: "sidebar", label: "Barra lateral" },
  { id: "nowplaying", label: "Reproduciendo" },
  { id: "motion", label: "Movimiento" },
];

/* ───────────── Piezas visuales ───────────── */

/** Miniatura esquemática para elegir diseños estructurales. */
function LayoutThumb({ sidebar, player }: { sidebar: SidebarStyle; player: PlayerStyle }) {
  return (
    <div className="relative h-[84px] w-full overflow-hidden rounded-[var(--radius-control)] bg-[var(--bg)] ring-1 ring-line">
      <div className={clsx(
        "absolute bg-[color-mix(in_srgb,var(--fg)_14%,transparent)]",
        sidebar === "expanded" && "top-0 bottom-0 left-0 w-[28%]",
        sidebar === "rail" && "top-0 bottom-0 left-0 w-[9%]",
        sidebar === "floating" && "top-1.5 bottom-1.5 left-1.5 w-[26%] rounded-md",
      )} />
      <div className={clsx("absolute top-3 right-3 grid grid-cols-3 gap-1.5", sidebar === "rail" ? "left-[15%]" : "left-[36%]")}>
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-square rounded-[3px] bg-[color-mix(in_srgb,var(--fg)_9%,transparent)]" />)}
      </div>
      <div className={clsx(
        "absolute bg-accent/70",
        player === "bar" && "right-0 bottom-0 left-0 h-[16%]",
        player === "minimal" && "right-0 bottom-0 left-0 h-[9%]",
        player === "island" && "right-[18%] bottom-1.5 left-[18%] h-[14%] rounded-full",
      )} />
    </div>
  );
}

function Choice({ selected, onClick, children, label }: { selected: boolean; onClick: () => void; children: ReactNode; label: string }) {
  return (
    <button onClick={onClick} aria-pressed={selected} className={clsx(
      "group relative flex flex-col gap-2 rounded-[var(--radius-card)] border p-2.5 text-left transition-colors",
      selected ? "border-accent bg-accent/[0.07]" : "border-line hover:border-faint",
    )}>
      {children}
      <span className="px-1 text-[12.5px] font-medium">{label}</span>
      {selected && <span className="absolute top-3.5 right-3.5 grid size-5 place-items-center rounded-full bg-accent text-on-accent"><Check className="size-3" /></span>}
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h3 className="eyebrow mb-3">{title}</h3>
      {children}
    </section>
  );
}

/* ───────────── Pestañas ───────────── */

function LayoutTab() {
  const a = useAppearance();
  const [name, setName] = useState("");
  const matches = (values: Partial<AppearanceState>) =>
    Object.entries(values).every(([k, v]) => JSON.stringify(a[k as keyof AppearanceState]) === JSON.stringify(v));

  return (
    <>
      <Group title="Diseños de interfaz">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Object.entries(layoutPresets).map(([id, preset]) => (
            <Choice key={id} selected={matches(preset.values)} onClick={() => a.applyPreset(id)} label={preset.name}>
              <LayoutThumb sidebar={preset.values.sidebarStyle ?? "expanded"} player={preset.values.playerStyle ?? "bar"} />
              <span className="px-1 text-[11.5px] leading-snug text-muted">{preset.description}</span>
            </Choice>
          ))}
        </div>
      </Group>

      <Group title="Tus diseños">
        <p className="mb-3 text-[12.5px] text-muted">Guarda la combinación actual (colores, forma, fondo, estructura…) para volver a ella con un clic.</p>
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => { e.preventDefault(); a.savePreset(name); setName(""); }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Nombre del diseño"
            className="flex-1 rounded-full border border-line bg-transparent px-4 py-2 text-[13px] outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!name.trim() || a.customPresets.length >= MAX_CUSTOM_PRESETS}
            className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent disabled:opacity-40"
          >
            <Plus className="size-4" /> Guardar actual
          </button>
        </form>
        {a.customPresets.length === 0 ? (
          <p className="text-[12.5px] text-faint">Aún no has guardado ningún diseño.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {a.customPresets.map((p) => (
              <span key={p.id} className={clsx("flex items-center rounded-full border pl-1", matches(p.values) ? "border-accent" : "border-line")}>
                <button onClick={() => a.applyCustomPreset(p.id)} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium hover:bg-hover">
                  <span className="size-3 rounded-full" style={{ background: p.values.accent === "custom" ? p.values.customAccent : accents[p.values.accent].value }} />
                  {p.name}
                </button>
                <button onClick={() => a.deletePreset(p.id)} aria-label={`Borrar ${p.name}`} className="grid size-7 place-items-center rounded-full text-muted hover:text-red-400">
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </Group>

      <Group title="Barra lateral">
        <div className="grid grid-cols-3 gap-3">
          {([["expanded", "Completa"], ["rail", "Riel de iconos"], ["floating", "Flotante"]] as [SidebarStyle, string][]).map(([v, l]) => (
            <Choice key={v} selected={a.sidebarStyle === v} onClick={() => a.set("sidebarStyle", v)} label={l}>
              <LayoutThumb sidebar={v} player={a.playerStyle} />
            </Choice>
          ))}
        </div>
      </Group>

      <Group title="Reproductor">
        <div className="grid grid-cols-3 gap-3">
          {([["bar", "Barra anclada"], ["island", "Isla flotante"], ["minimal", "Mínimo"]] as [PlayerStyle, string][]).map(([v, l]) => (
            <Choice key={v} selected={a.playerStyle === v} onClick={() => a.set("playerStyle", v)} label={l}>
              <LayoutThumb sidebar={a.sidebarStyle} player={v} />
            </Choice>
          ))}
        </div>
      </Group>
    </>
  );
}

function ColorTab() {
  const a = useAppearance();
  return (
    <>
      <Row label="Tema" hint={a.theme === "system" ? "Sigue el modo claro u oscuro de Windows." : a.theme === "oled" ? "Negro puro: ideal para pantallas OLED." : undefined}>
        <Segmented<Theme> layoutId="seg-theme" value={a.theme} onChange={(v) => a.set("theme", v)}
          options={[{ value: "dark", label: "Oscuro" }, { value: "light", label: "Claro" }, { value: "oled", label: "OLED" }, { value: "system", label: "Sistema" }]} />
      </Row>
      <Row label="Color de acento" hint={a.accentFromArtwork ? "Ahora se toma de la portada en reproducción." : undefined}>
        <div className="flex items-center gap-2">
          {(Object.keys(accents) as Exclude<AccentId, "custom">[]).map((id) => (
            <button
              key={id}
              title={accents[id].name}
              aria-label={accents[id].name}
              disabled={a.accentFromArtwork}
              onClick={() => a.set("accent", id)}
              className={clsx("size-7 rounded-full ring-offset-2 ring-offset-[var(--bg)] transition-transform hover:scale-110 disabled:opacity-30",
                a.accent === id && !a.accentFromArtwork && "ring-2 ring-fg")}
              style={{ background: accents[id].value }}
            />
          ))}
          <label
            title="Color personalizado"
            className={clsx("relative size-7 cursor-pointer overflow-hidden rounded-full ring-offset-2 ring-offset-[var(--bg)]",
              a.accent === "custom" && !a.accentFromArtwork && "ring-2 ring-fg", a.accentFromArtwork && "pointer-events-none opacity-30")}
            style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}
          >
            <input
              type="color"
              aria-label="Color personalizado"
              value={a.customAccent}
              onChange={(e) => { a.set("customAccent", e.target.value.toUpperCase()); a.set("accent", "custom"); }}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          {a.accent === "custom" && <code className="ml-1 text-[12px] text-muted">{a.customAccent}</code>}
        </div>
      </Row>
      <Row label="Acento desde la portada" hint="El color de acento sigue a la canción actual.">
        <Toggle label="Acento desde la portada" checked={a.accentFromArtwork} onChange={(v) => a.set("accentFromArtwork", v)} />
      </Row>
      <Row label="Transparencias">
        <Segmented<Glass> layoutId="seg-glass" value={a.glass} onChange={(v) => a.set("glass", v)}
          options={[{ value: "off", label: "Opaco" }, { value: "subtle", label: "Sutil" }, { value: "strong", label: "Cristal" }]} />
      </Row>
    </>
  );
}

const typefaces: { id: Typeface; name: string; family: string }[] = [
  { id: "grotesk", name: "Grotesca", family: '"Space Grotesk", sans-serif' },
  { id: "editorial", name: "Editorial", family: '"Fraunces", Georgia, serif' },
  { id: "mono", name: "Mono", family: '"JetBrains Mono", monospace' },
];
const cornerOpts: { id: Corners; name: string; r: number }[] = [
  { id: "round", name: "Redondeadas", r: 14 },
  { id: "soft", name: "Suaves", r: 7 },
  { id: "sharp", name: "Rectas", r: 2 },
];

function TypeTab() {
  const a = useAppearance();
  return (
    <>
      <Group title="Tipografía de titulares">
        <div className="grid grid-cols-3 gap-3">
          {typefaces.map((t) => (
            <Choice key={t.id} selected={a.typeface === t.id} onClick={() => a.set("typeface", t.id)} label={t.name}>
              <div className="grid h-[84px] place-items-center rounded-[var(--radius-control)] bg-hover">
                <span className="text-[30px] font-bold tracking-tight" style={{ fontFamily: t.family }}>Aa</span>
              </div>
            </Choice>
          ))}
        </div>
      </Group>
      <Group title="Esquinas">
        <div className="grid grid-cols-3 gap-3">
          {cornerOpts.map((c) => (
            <Choice key={c.id} selected={a.corners === c.id} onClick={() => a.set("corners", c.id)} label={c.name}>
              <div className="flex h-[84px] items-center justify-center gap-2 rounded-[var(--radius-control)] bg-hover">
                <span className="size-12 bg-accent/80" style={{ borderRadius: c.r }} />
                <span className="h-7 w-16 bg-[color-mix(in_srgb,var(--fg)_14%,transparent)]" style={{ borderRadius: c.r * 0.7 }} />
              </div>
            </Choice>
          ))}
        </div>
      </Group>
      <Row label="Densidad de la interfaz">
        <Segmented<Density> layoutId="seg-density" value={a.density} onChange={(v) => a.set("density", v)}
          options={[{ value: "comfortable", label: "Cómoda" }, { value: "compact", label: "Compacta" }]} />
      </Row>
    </>
  );
}

const bgOpts: { id: BgStyle; name: string; preview: string }[] = [
  { id: "aurora", name: "Aurora", preview: "radial-gradient(circle at 25% 30%, var(--accent), transparent 55%), radial-gradient(circle at 80% 80%, #4c7dff, transparent 55%)" },
  { id: "blur", name: "Portada difuminada", preview: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 60%, #000), #2b1055)" },
  { id: "gradient", name: "Degradado", preview: "linear-gradient(155deg, var(--accent), #2b1055 60%, transparent)" },
  { id: "off", name: "Ninguno", preview: "var(--bg)" },
];

function BackgroundTab() {
  const a = useAppearance();
  return (
    <>
      <Group title="Fondo dinámico">
        <p className="mb-3 text-[12.5px] text-muted">Se genera con los colores de la portada que suena. Los colores se atenúan para que el texto siempre se lea bien.</p>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {bgOpts.map((o) => (
            <Choice key={o.id} selected={a.bgStyle === o.id} onClick={() => a.set("bgStyle", o.id)} label={o.name}>
              <div className={clsx("h-[84px] rounded-[var(--radius-control)] ring-1 ring-line", o.id === "blur" && "blur-[1px]")} style={{ background: o.preview }} />
            </Choice>
          ))}
        </div>
      </Group>
      <Row label="Intensidad" hint={a.bgStyle === "off" ? "Activa un estilo de fondo para ajustarla." : `${a.bgIntensity} %`}>
        <input
          type="range" min={0} max={100} step={5} aria-label="Intensidad del fondo"
          disabled={a.bgStyle === "off"}
          value={a.bgIntensity}
          onChange={(e) => a.set("bgIntensity", Number(e.target.value))}
          className="range w-48 disabled:opacity-40"
          style={{ ["--fill" as string]: `${a.bgIntensity}%`, ["--fill-color" as string]: "var(--accent)" }}
        />
      </Row>
    </>
  );
}

function HomeTab() {
  const a = useAppearance();
  return (
    <Group title="Secciones de Inicio">
      <p className="mb-3 text-[12.5px] text-muted">Elige qué aparece en Inicio y en qué orden.</p>
      <div className="rounded-[var(--radius-card)] border border-line">
        {a.homeSections.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
            <span className={clsx("flex-1 text-[14px]", !s.visible && "text-faint line-through")}>{homeSectionLabels[s.id]}</span>
            <button aria-label="Subir" disabled={i === 0} onClick={() => a.moveHomeSection(s.id, -1)} className="grid size-7 place-items-center rounded-full text-muted hover:bg-hover disabled:opacity-25">
              <ArrowUp className="size-4" />
            </button>
            <button aria-label="Bajar" disabled={i === a.homeSections.length - 1} onClick={() => a.moveHomeSection(s.id, 1)} className="grid size-7 place-items-center rounded-full text-muted hover:bg-hover disabled:opacity-25">
              <ArrowDown className="size-4" />
            </button>
            <Toggle label={`Mostrar ${homeSectionLabels[s.id]}`} checked={s.visible} onChange={(v) => a.toggleHomeSection(s.id, v)} />
          </div>
        ))}
      </div>
    </Group>
  );
}

function SidebarTab() {
  const a = useAppearance();
  const items = navGroups.flatMap((g) => g.items).filter((it): it is typeof it & { id: NavId } => !!it.id);
  return (
    <Group title="Entradas visibles">
      <p className="mb-3 text-[12.5px] text-muted">Inicio y Configuración siempre están. Las secciones ocultas siguen siendo accesibles con atajos y enlaces.</p>
      <div className="flex flex-wrap gap-2">
        {items.map(({ id, label, icon: Icon }) => {
          const visible = !a.hiddenNav.includes(id);
          return (
            <Chip key={id} active={visible} onClick={() => a.toggleNav(id, !visible)}>
              <span className="flex items-center gap-1.5"><Icon className="size-3.5" />{label}</span>
            </Chip>
          );
        })}
      </div>
    </Group>
  );
}

function NowPlayingTab() {
  const a = useAppearance();
  return (
    <>
      <Row label="Disposición" hint="También puedes cambiarla desde la propia pantalla.">
        <Segmented<NowPlayingLayout> layoutId="seg-np" value={a.nowPlayingLayout} onChange={(v) => a.set("nowPlayingLayout", v)}
          options={[{ value: "stage", label: "Escenario" }, { value: "split", label: "Dividido" }, { value: "disc", label: "Disco" }]} />
      </Row>
      <Row label="Fondo">
        <Segmented<NpBackground> layoutId="seg-npbg" value={a.npBackground} onChange={(v) => a.set("npBackground", v)}
          options={[{ value: "aurora", label: "Aurora" }, { value: "blur", label: "Difuminado" }, { value: "artwork", label: "Portada" }]} />
      </Row>
      <Row label="Forma de la portada" hint={a.nowPlayingLayout === "disc" ? "En la disposición Disco la portada es siempre circular." : undefined}>
        <Segmented<CoverShape> layoutId="seg-npcover" value={a.npCoverShape} onChange={(v) => a.set("npCoverShape", v)}
          options={[{ value: "rounded", label: "Redondeada" }, { value: "square", label: "Cuadrada" }, { value: "circle", label: "Circular" }]} />
      </Row>
      <Row label="Mostrar «A continuación»" hint="Las próximas canciones de la cola del servicio activo.">
        <Toggle label="Mostrar A continuación" checked={a.npShowQueue} onChange={(v) => a.set("npShowQueue", v)} />
      </Row>
    </>
  );
}

function MotionTab() {
  const a = useAppearance();
  return (
    <Row label="Animaciones" hint="«Reducidas» quita los movimientos amplios; «Ninguna» las desactiva por completo.">
      <Segmented<MotionLevel> layoutId="seg-motion" value={a.motion} onChange={(v) => a.set("motion", v)}
        options={[{ value: "full", label: "Completas" }, { value: "reduced", label: "Reducidas" }, { value: "off", label: "Ninguna" }]} />
    </Row>
  );
}

const panels: Record<Tab, () => ReactNode> = {
  layout: LayoutTab, color: ColorTab, type: TypeTab, background: BackgroundTab,
  home: HomeTab, sidebar: SidebarTab, nowplaying: NowPlayingTab, motion: MotionTab,
};

export function AppearanceSection() {
  const reset = useAppearance((s) => s.reset);
  const [tab, setTab] = useState<Tab>("layout");
  const Panel = panels[tab];
  return (
    <>
      <SectionTitle title="Apariencia" description="Los diseños cambian la estructura de la interfaz, no solo los colores. Los cambios se aplican al instante y se guardan en este equipo.">
        <button onClick={reset} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12.5px] whitespace-nowrap text-muted hover:text-fg">
          <RotateCcw className="size-3.5" /> Restablecer
        </button>
      </SectionTitle>
      <div className="mb-6 flex flex-wrap gap-2" role="tablist">
        {tabs.map((t) => (
          <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</Chip>
        ))}
      </div>
      <div role="tabpanel"><Panel /></div>
    </>
  );
}
