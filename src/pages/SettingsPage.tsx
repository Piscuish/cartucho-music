import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Cable, Download, Info, Keyboard, Palette, PlayCircle, Shield, SlidersHorizontal, type LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import { NavLink, Navigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/ui";
import { AppearanceSection } from "@/features/settings/AppearanceSection";
import { UpdatesSection } from "@/features/updates/UpdatesSection";
import {
  AboutSection, GeneralSection, NotificationsSection, PlaybackSection, PrivacySection, ServicesSection, ShortcutsSection,
} from "@/features/settings/sections";

const sections: { id: string; label: string; icon: LucideIcon; Component: ComponentType }[] = [
  { id: "general", label: "General", icon: SlidersHorizontal, Component: GeneralSection },
  { id: "actualizaciones", label: "Actualizaciones", icon: Download, Component: UpdatesSection },
  { id: "apariencia", label: "Apariencia", icon: Palette, Component: AppearanceSection },
  { id: "servicios", label: "Servicios conectados", icon: Cable, Component: ServicesSection },
  { id: "reproduccion", label: "Reproducción", icon: PlayCircle, Component: PlaybackSection },
  { id: "atajos", label: "Atajos de teclado", icon: Keyboard, Component: ShortcutsSection },
  { id: "notificaciones", label: "Notificaciones", icon: Bell, Component: NotificationsSection },
  { id: "privacidad", label: "Privacidad", icon: Shield, Component: PrivacySection },
  { id: "acerca", label: "Acerca de", icon: Info, Component: AboutSection },
];

export function SettingsPage() {
  const { section } = useParams();
  const active = sections.find((s) => s.id === section);
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
