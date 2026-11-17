import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/space-grotesk/latin-700.css";
import "./styles.css";

import { backend, type InstallEvent, type InstallerInfo } from "./backend";

type Screen =
  | { name: "welcome" }
  | { name: "options" }
  | { name: "installing"; stage: string; fraction: number | null }
  | { name: "done" }
  | { name: "error"; message: string; canRetry: boolean };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const panel = $<HTMLElement>("panel");
const mark = $<HTMLElement>("mark");
const primary = $<HTMLButtonElement>("btn-primary");
const secondary = $<HTMLButtonElement>("btn-secondary");
const closeBtn = $<HTMLButtonElement>("btn-close");

const CHEVRON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5"/></svg>`;

const STAGES: Record<string, string> = {
  preparing: "Preparando la instalación…",
  copying: "Copiando archivos…",
  finishing: "Creando accesos directos…",
};

let info: InstallerInfo;
let dir = "";
let desktopShortcut = true;
let openAfter = true;
let screen: Screen = { name: "welcome" };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function formatSize(bytes: number) {
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

/** Compara versiones x.y.z: <0 si a<b, 0 si iguales, >0 si a>b. */
export function compareVersions(a: string, b: string) {
  const pa = a.split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const isUpdate = () => !!info.existing;

function welcomeText() {
  const ex = info.existing;
  if (!ex) {
    return `
      <p class="text">Bienvenido al asistente de instalación de <strong>Cartucho Music</strong>.</p>
      <p class="text">Este instalador te guiará paso a paso para instalar la aplicación en tu equipo.</p>`;
  }
  const cmp = compareVersions(ex.version, info.version);
  if (cmp < 0) {
    return `
      <p class="text">Ya tienes <strong>Cartucho Music ${esc(ex.version)}</strong> en este equipo.</p>
      <p class="text">Se actualizará a la versión <strong>${esc(info.version)}</strong>. Tus ajustes y tu sesión se conservan.</p>`;
  }
  if (cmp === 0) {
    return `
      <p class="text">Ya tienes <strong>Cartucho Music ${esc(ex.version)}</strong> instalado.</p>
      <p class="text">Puedes volver a instalarlo para reparar la instalación. Tus ajustes y tu sesión se conservan.</p>`;
  }
  return `
    <p class="text">Tienes instalada la versión <strong>${esc(ex.version)}</strong>, más nueva que esta (${esc(info.version)}).</p>
    <p class="text">Si continúas, se instalará la <strong>${esc(info.version)}</strong> en su lugar. Tus ajustes se conservan.</p>`;
}

function render(next: Screen) {
  const changed = next.name !== screen.name;
  screen = next;
  const busy = next.name === "installing";

  mark.classList.toggle("busy", busy);
  mark.classList.toggle("done", next.name === "done");
  closeBtn.disabled = busy;
  primary.hidden = false;
  secondary.hidden = false;
  primary.disabled = false;
  secondary.disabled = false;

  switch (next.name) {
    case "welcome":
      panel.innerHTML = `
        <h1 class="title">Cartucho <em>Music</em></h1>
        <p class="subtitle">${isUpdate() ? "Actualización" : "Instalador"}</p>
        ${welcomeText()}`;
      secondary.textContent = "Cancelar";
      primary.innerHTML = `Siguiente ${CHEVRON}`;
      break;

    case "options": {
      const meta = [
        "Solo para tu usuario, sin permisos de administrador",
        info.requiredBytes > 0 ? `Espacio necesario: ${formatSize(info.requiredBytes)}` : null,
      ].filter(Boolean);
      panel.innerHTML = `
        <h1 class="title">Cartucho <em>Music</em></h1>
        <p class="subtitle">Opciones de instalación</p>
        <p class="field-label">Carpeta de destino</p>
        <div class="field">
          <span class="field-path" title="${esc(dir)}"><bdi>${esc(dir)}</bdi></span>
          <button class="btn-small" id="btn-browse" type="button" ${isUpdate() ? "disabled" : ""}>Cambiar…</button>
        </div>
        ${
          isUpdate()
            ? `<p class="hint">Se actualiza en la carpeta donde ya está instalado.</p>`
            : ""
        }
        <label class="check">
          <input type="checkbox" id="chk-desktop" ${desktopShortcut ? "checked" : ""} />
          Crear un acceso directo en el escritorio
        </label>
        <div class="meta">${meta.map((m) => `<span>${esc(m!)}</span>`).join("")}</div>`;
      $<HTMLButtonElement>("btn-browse").onclick = browse;
      $<HTMLInputElement>("chk-desktop").onchange = (e) => {
        desktopShortcut = (e.target as HTMLInputElement).checked;
      };
      secondary.textContent = "Atrás";
      primary.textContent = isUpdate() ? "Actualizar" : "Instalar";
      break;
    }

    case "installing": {
      const pct = next.fraction === null ? null : Math.round(next.fraction * 100);
      if (changed || !document.getElementById("bar")) {
        panel.innerHTML = `
          <h1 class="title">Cartucho <em>Music</em></h1>
          <p class="subtitle">${isUpdate() ? "Actualizando…" : "Instalando…"}</p>
          <div class="progress">
            <div class="progress-row"><span id="stage"></span><span class="progress-pct" id="pct"></span></div>
            <div class="track" id="track"><div class="bar" id="bar"></div></div>
          </div>
          <p class="hint">No cierres esta ventana. Si Cartucho Music está abierto, se cerrará para actualizarlo.</p>`;
      }
      $("stage").textContent = STAGES[next.stage] ?? "Instalando…";
      $("pct").textContent = pct === null ? "" : `${pct}%`;
      $("track").classList.toggle("indeterminate", pct === null);
      $("bar").style.width = `${pct ?? 0}%`;
      secondary.hidden = true;
      primary.disabled = true;
      primary.textContent = isUpdate() ? "Actualizando…" : "Instalando…";
      break;
    }

    case "done":
      panel.innerHTML = `
        <h1 class="title">Cartucho <em>Music</em></h1>
        <p class="subtitle">${isUpdate() ? "Actualización completada" : "Instalación completada"}</p>
        <p class="text">Cartucho Music <strong>${esc(info.version)}</strong> ya está listo en tu equipo.</p>
        <label class="check">
          <input type="checkbox" id="chk-open" ${openAfter ? "checked" : ""} />
          Abrir Cartucho Music ahora
        </label>`;
      $<HTMLInputElement>("chk-open").onchange = (e) => {
        openAfter = (e.target as HTMLInputElement).checked;
      };
      secondary.hidden = true;
      primary.textContent = "Finalizar";
      break;

    case "error":
      panel.innerHTML = `
        <h1 class="title">Cartucho <em>Music</em></h1>
        <p class="subtitle">No se pudo instalar</p>
        <p class="text error">${esc(next.message)}</p>`;
      secondary.textContent = "Cerrar";
      primary.textContent = "Reintentar";
      primary.hidden = !next.canRetry;
      break;
  }

  if (changed) {
    panel.classList.remove("enter");
    void panel.offsetWidth; // reinicia la animación de entrada
    panel.classList.add("enter");
  }
  if (!primary.hidden && !primary.disabled) primary.focus({ preventScroll: true });
}

async function browse() {
  const picked = await backend.pickFolder(dir);
  if (picked) {
    dir = picked;
    render({ name: "options" });
  }
}

async function install() {
  render({ name: "installing", stage: "preparing", fraction: null });
  let fraction: number | null = null;
  let stage = "preparing";
  const onEvent = (ev: InstallEvent) => {
    switch (ev.kind) {
      case "stage":
        stage = ev.stage;
        break;
      case "progress":
        fraction = ev.fraction;
        break;
      case "finished":
        render({ name: "done" });
        return;
      case "failed":
        render({ name: "error", message: ev.message, canRetry: true });
        return;
    }
    if (screen.name === "installing") render({ name: "installing", stage, fraction });
  };
  try {
    await backend.startInstall(dir, desktopShortcut, onEvent);
  } catch (e) {
    render({ name: "error", message: String(e), canRetry: true });
  }
}

async function finish() {
  if (openAfter) {
    try {
      await backend.launchApp();
    } catch (e) {
      render({ name: "error", message: String(e), canRetry: false });
      return;
    }
  }
  await backend.close();
}

primary.addEventListener("click", () => {
  switch (screen.name) {
    case "welcome":
      return render({ name: "options" });
    case "options":
      return void install();
    case "done":
      return void finish();
    case "error":
      return render({ name: "options" });
  }
});

secondary.addEventListener("click", () => {
  switch (screen.name) {
    case "options":
      return render({ name: "welcome" });
    case "welcome":
    case "error":
      return void backend.close();
  }
});

$("btn-minimize").addEventListener("click", () => void backend.minimize());
closeBtn.addEventListener("click", () => {
  if (screen.name !== "installing") void backend.close();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && screen.name !== "installing" && screen.name !== "done") void backend.close();
});
// Sin menú contextual del navegador: esto es una ventana de instalación, no una página.
document.addEventListener("contextmenu", (e) => e.preventDefault());

async function boot() {
  info = await backend.info();
  dir = info.defaultDir;
  $("version").textContent = `v${info.version}`;
  if (!info.payloadOk) {
    render({
      name: "error",
      message:
        "Este instalador está incompleto: no lleva la aplicación dentro. Descárgalo de nuevo desde la página de Releases de Cartucho Music.",
      canRetry: false,
    });
    return;
  }
  render({ name: "welcome" });
}

void boot();
