import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Cable, ChevronLeft, ChevronRight, Download, Info, Keyboard, Palette, PlayCircle, Shield, SlidersHorizontal, type LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import { Link, NavLink, Navigate, useParams } from "react-router-dom";
import { IS_MOBILE } from "@/utils/platform";
import { PageHeader } from "@/components/ui";
import { AppearanceSection } from "@/features/settings/AppearanceSection";
import { UpdatesSection } from "@/features/updates/UpdatesSection";
import {
  AboutSection, GeneralSection, NotificationsSection, PlaybackSection, PrivacySection, ServicesSection, ShortcutsSection,
} from "@/features/settings/sections";

type Section = { id: string; label: string; icon: LucideIcon; Component: ComponentType; desktopOnly?: boolean };

const allSections: Section[] = [
  { id: "general", label: "General", icon: SlidersHorizontal, Component: GeneralSection, desktopOnly: true },
  { id: "actualizaciones", label: "Actualizaciones", icon: Download, Component: UpdatesSection },
  { id: "apariencia", label: "Apariencia", icon: Palette, Component: AppearanceSection },
  { id: "servicios", label: "Servicios conectados", icon: Cable, Component: ServicesSection },
  { id: "reproduccion", label: "Reproducción", icon: PlayCircle, Component: PlaybackSection },
  { id: "atajos", label: "Atajos de teclado", icon: Keyboard, Component: ShortcutsSection, desktopOnly: true },
  { id: "notificaciones", label: "Notificaciones", icon: Bell, Component: NotificationsSection, desktopOnly: true },
  { id: "privacidad", label: "Privacidad", icon: Shield, Component: PrivacySection },
  { id: "acerca", label: "Acerca de", icon: Info, Component: AboutSection },
];

/** En el teléfono no hay bandeja, atajos de teclado ni avisos de Windows. */
const sections = IS_MOBILE ? allSections.filter((s) => !s.desktopOnly) : allSections;

export function SettingsPage() {
  const { section } = useParams();
  const active = sections.find((s) => s.id === section);
  if (IS_MOBILE) return <MobileSettings active={active} />;
  if (!active) return <Navigate to="/ajustes/apariencia" replace />;

  return (
    <>
      <PageHeader title="Configuración" />
      <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-10">
        <nav className="sticky top-0 self-start">
          {sections.map((s) => (
            <NavLink
              key={s.id}
              to={`/ajustes/${s.id}`}
              className={({ isActive }) => clsx(
                "flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-[13.5px] font-medium transition-colors",
                isActive ? "bg-hover text-fg" : "text-muted hover:text-fg",
              )}
            >
              {({ isActive }) => <><s.icon className={clsx("size-4", isActive && "text-accent")} />{s.label}</>}
            </NavLink>
          ))}
        </nav>
        <AnimatePresence mode="wait">
          <motion.div key={active.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="max-w-3xl">
            <active.Component />
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}

/** Teléfono: lista de secciones y, al tocar una, la sección a pantalla completa. */
function MobileSettings({ active }: { active: Section | undefined }) {
  if (!active) {
    return (
      <>
        <PageHeader title="Configuración" />
        <nav className="overflow-hidden rounded-[var(--radius-card)] border border-line">
          {sections.map((s) => (
            <Link key={s.id} to={`/ajustes/${s.id}`} className="flex items-center gap-3 border-b border-line px-4 py-3.5 text-[15px] font-medium last:border-0 active:bg-hover">
              <s.icon className="size-5 text-accent" />
              <span className="flex-1">{s.label}</span>
              <ChevronRight className="size-4 text-faint" />
            </Link>
          ))}
        </nav>
      </>
    );
  }
  return (
    <>
      <Link to="/ajustes" className="mb-3 -ml-1 inline-flex items-center gap-1 text-[14px] text-muted">
        <ChevronLeft className="size-5" /> Configuración
      </Link>
      <active.Component />
    </>
  );
}
