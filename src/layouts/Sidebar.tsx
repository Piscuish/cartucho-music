import clsx from "clsx";
import { motion } from "framer-motion";
import {
  Compass, Disc3, Heart, House, Library, ListMusic, ListOrdered, MicVocal, Music2, Search, Settings, type LucideIcon,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { LogoMark, Wordmark } from "@/components/Logo";
import { providers } from "@/providers/registry";
import type { ConnectionStatus } from "@/providers/types";
import type { ProviderId } from "@/types/music";
import { useConnectionStatus, useVisibleServices } from "@/hooks/useProviders";
import { useAppearance, type NavId } from "@/stores/appearance";

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean; id?: NavId }

export const navGroups: { title?: string; items: NavItem[] }[] = [
  { items: [
    { to: "/", label: "Inicio", icon: House, end: true },
    { to: "/explorar", label: "Explorar", icon: Compass, id: "explore" },
    { to: "/buscar", label: "Buscar", icon: Search, id: "search" },
  ] },
  { title: "Tu música", items: [
    { to: "/biblioteca", label: "Mi biblioteca", icon: Library, id: "library" },
    { to: "/albumes", label: "Álbumes", icon: Disc3, id: "albums" },
    { to: "/artistas", label: "Artistas", icon: MicVocal, id: "artists" },
    { to: "/canciones", label: "Canciones", icon: Music2, id: "songs" },
    { to: "/playlists", label: "Playlists", icon: ListMusic, id: "playlists" },
    { to: "/favoritos", label: "Favoritos", icon: Heart, id: "favorites" },
  ] },
  { items: [
    { to: "/cola", label: "Cola de reproducción", icon: ListOrdered, id: "queue" },
  ] },
];

export function Sidebar() {
  const style = useAppearance((s) => s.sidebarStyle);
  const rail = style === "rail";
  const hiddenNav = useAppearance((s) => s.hiddenNav);
  const services = useVisibleServices();

  return (
    <motion.aside
      layout
      transition={{ type: "spring", stiffness: 300, damping: 34 }}
      className={clsx(
        "relative z-20 flex shrink-0 flex-col",
        rail ? "w-[76px] items-center" : "w-[var(--sidebar-w)]",
        style === "floating" ? "glass m-3 mr-0 rounded-[22px] shadow-[var(--shadow)]" : "glass border-y-0 border-l-0",
      )}
    >
      <div className={clsx("flex h-[72px] shrink-0 items-center", rail ? "justify-center" : "px-5")}>
        {rail ? <LogoMark size={32} /> : <Wordmark />}
      </div>

      <nav className={clsx("scroll-area flex-1", rail ? "w-full px-3" : "px-3")} aria-label="Principal">
        {navGroups.map((g, gi) => {
          const items = g.items.filter((it) => !it.id || !hiddenNav.includes(it.id));
          if (!items.length) return null;
          return (
            <div key={gi} className="mb-4">
              {g.title && !rail && <div className="eyebrow px-3 pt-2 pb-2">{g.title}</div>}
              {g.title && rail && <div className="mx-auto mb-3 h-px w-6 bg-line" />}
              {items.map((item) => <SidebarLink key={item.to} item={item} rail={rail} />)}
            </div>
          );
        })}
      </nav>

      <div className={clsx("shrink-0 border-t border-line", rail ? "w-full px-3 py-3" : "p-3")}>
        {!rail && <div className="eyebrow px-3 pt-1 pb-2">Servicios</div>}
        {services.map((p) => <ServiceLink key={p.id} id={p.id} rail={rail} />)}
        <SidebarLink item={{ to: "/ajustes", label: "Configuración", icon: Settings }} rail={rail} />
      </div>
    </motion.aside>
  );
}

const statusLabel = (s: ConnectionStatus) =>
  s.state === "connected" ? s.displayName
  : s.state === "connecting" ? "Conectando…"
  : s.state === "preview" ? "Vista previa"
  : s.state === "error" ? "Error de conexión"
  : s.state === "unavailable" ? "No disponible"
  : "Sin conectar";

const statusDot: Record<ConnectionStatus["state"], string> = {
  connected: "bg-emerald-400", connecting: "bg-amber-400", preview: "bg-accent", error: "bg-red-400", unavailable: "bg-faint", disconnected: "bg-faint",
};

function ServiceLink({ id, rail }: { id: ProviderId; rail: boolean }) {
  const p = providers[id];
  const st = useConnectionStatus(id);
  const label = statusLabel(st);
  return (
    <NavLink
      to="/ajustes/servicios"
      title={`${p.name}: ${label}`}
      className={clsx("flex items-center gap-3 rounded-[var(--radius-control)] py-2 text-[13px] transition-colors hover:bg-hover", rail ? "justify-center" : "px-3")}
    >
      <span className="relative grid size-6 place-items-center rounded-md" style={{ background: `${p.color}22` }}>
        <span className="size-2 rounded-full" style={{ background: p.color }} />
        <span className={clsx("absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-[var(--bg)]", statusDot[st.state])} />
      </span>
      {!rail && (
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{p.name}</span>
          <span className="block truncate text-[11.5px] text-muted">{label}</span>
        </span>
      )}
    </NavLink>
  );
}

function SidebarLink({ item, rail }: { item: NavItem; rail: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={rail ? item.label : undefined}
      className={({ isActive }) => clsx(
        "group relative flex items-center gap-3 rounded-[var(--radius-control)] py-[calc(var(--row-py)+1px)] text-[13.5px] font-medium transition-colors",
        rail ? "justify-center" : "px-3",
        isActive ? "text-fg" : "text-muted hover:bg-hover hover:text-fg",
      )}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="sidebar-active"
              className="absolute inset-0 rounded-[var(--radius-control)] bg-hover"
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            >
              <span className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-full bg-accent" />
            </motion.span>
          )}
          <Icon className={clsx("relative size-[18px] shrink-0", isActive && "text-accent")} strokeWidth={isActive ? 2.2 : 1.8} />
          {!rail && <span className="relative truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
}
