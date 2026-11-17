import clsx from "clsx";
import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isDesktopApp } from "@/utils/platform";

/** Alto de la barra propia. En el navegador (vite dev) y en el teléfono no hay barra: 0. */
export const TITLEBAR_HEIGHT = isDesktopApp() ? 36 : 0;
// Las pantallas reservan este hueco arriba con `pt-[var(--titlebar-h)]`. En el teléfono es
// el área de la barra de estado de Android (ver index.css).
if (TITLEBAR_HEIGHT) document.documentElement.style.setProperty("--titlebar-h", `${TITLEBAR_HEIGHT}px`);

/**
 * Barra de título propia (la ventana no tiene marco de Windows: `decorations: false`).
 * Es transparente y flota sobre cada pantalla, así el fondo de la app llega hasta arriba.
 * Arrastrar mueve la ventana y el doble clic la maximiza (lo hace Tauri con
 * `data-tauri-drag-region`). Cerrar respeta «cerrar a la bandeja».
 */
export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktopApp()) return;
    const win = getCurrentWindow();
    const sync = () => void win.isMaximized().then(setMaximized).catch(() => {});
    sync();
    const unlisten = win.onResized(sync);
    return () => void unlisten.then((f) => f());
  }, []);

  if (!isDesktopApp()) return null;
  const win = getCurrentWindow();

  return (
    <div
      data-tauri-drag-region
      className="fixed inset-x-0 top-0 z-[90] flex select-none justify-end"
      style={{ height: TITLEBAR_HEIGHT }}
    >
      <WindowButton label="Minimizar" onClick={() => void win.minimize()}>
        <Minus className="size-4" strokeWidth={1.6} />
      </WindowButton>
      <WindowButton label={maximized ? "Restaurar" : "Maximizar"} onClick={() => void win.toggleMaximize()}>
        {maximized
          ? <Copy className="size-3.5 -scale-x-100" strokeWidth={1.6} />
          : <Square className="size-3.5" strokeWidth={1.6} />}
      </WindowButton>
      <WindowButton label="Cerrar" danger onClick={() => void win.close()}>
        <X className="size-4" strokeWidth={1.6} />
      </WindowButton>
    </div>
  );
}

function WindowButton({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={clsx(
        "grid h-full w-[46px] place-items-center text-muted transition-colors duration-100",
        danger ? "hover:bg-[#e81123] hover:text-white" : "hover:bg-hover hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
