import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Laptop, Loader2, MonitorSpeaker, Smartphone, Speaker, Tv } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconButton, QueryError } from "@/components/ui";
import { registry } from "@/providers/registry";
import { usePlayer } from "@/stores/player";
import { useUi } from "@/stores/ui";
import { describeError } from "@/providers/errors";

const iconFor = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes("smartphone") || t.includes("tablet")) return Smartphone;
  if (t.includes("tv") || t.includes("castvideo")) return Tv;
  if (t.includes("speaker") || t.includes("avr") || t.includes("castaudio")) return Speaker;
  return Laptop;
};

/** Selector de dispositivo (Spotify Connect). Solo aparece si el servicio activo lo admite. */
export function DevicePicker() {
  const active = usePlayer((s) => s.activeProvider);
  const deviceName = usePlayer((s) => s.state?.device?.name);
  const devicesModule = active ? registry.tryGet(active)?.devices : undefined;
  const open = useUi((s) => s.devicePickerOpen);
  const setOpen = useUi((s) => s.setDevicePickerOpen);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const devices = useQuery({
    queryKey: [active, "devices"],
    queryFn: ({ signal }) => devicesModule!.list(signal),
    enabled: open && !!devicesModule,
    staleTime: 0,
  });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !(e.target as Element).closest?.("[data-devices-trigger]")) setOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open, setOpen]);

  if (!devicesModule) return null;

  const transfer = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await devicesModule.transfer(id, true);
      await devices.refetch();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={ref} className="relative">
      <IconButton label={deviceName ? `Dispositivo: ${deviceName}` : "Elegir dispositivo"} size="sm" active={open} onClick={() => setOpen(!open)}>
        <MonitorSpeaker className="size-4" />
      </IconButton>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }}
            className="glass absolute right-0 bottom-11 z-50 w-72 rounded-[18px] p-2 shadow-[var(--shadow)]"
          >
            <div className="eyebrow px-2.5 pt-1.5 pb-2">Reproducir en</div>
            {devices.isLoading && <div className="flex justify-center py-4"><Loader2 className="size-4 animate-spin text-muted" /></div>}
            {devices.error != null && <QueryError error={devices.error} compact />}
            {devices.data?.length === 0 && (
              <p className="px-2.5 py-3 text-[12.5px] text-muted">No hay dispositivos disponibles. Abre Spotify en tu móvil u ordenador.</p>
            )}
            {devices.data?.map((d) => {
              const Icon = d.isThisApp ? Laptop : iconFor(d.type);
              return (
                <button
                  key={d.id}
                  disabled={d.restricted || busy != null}
                  onClick={() => transfer(d.id)}
                  className={clsx("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-hover disabled:opacity-50", d.isActive && "text-accent")}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{d.isThisApp ? "Este equipo (Cartucho Music)" : d.name}</span>
                    {d.restricted && <span className="block text-[11px] text-muted">No admite control remoto</span>}
                  </span>
                  {busy === d.id ? <Loader2 className="size-4 animate-spin" /> : d.isActive && <Check className="size-4" />}
                </button>
              );
            })}
            {error && <p role="alert" className="px-2.5 pt-2 text-[12px] text-red-400">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
