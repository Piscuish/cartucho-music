import { beforeEach, describe, expect, it, vi } from "vitest";

// El plugin de Tauri y el entorno se simulan: aquí se prueba la lógica del store.
const checkMock = vi.fn();
const relaunchMock = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({ check: (...a: unknown[]) => checkMock(...a) }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: () => relaunchMock() }));
vi.mock("@/database/runtime", async (orig) => ({ ...(await orig<object>()), isTauri: () => true }));

const { describeUpdateError, useUpdates } = await import("./updater");

function fakeUpdate(version = "1.0.2") {
  return {
    version,
    body: "Novedades de prueba",
    date: "2026-11-20T10:00:00Z",
    downloadAndInstall: vi.fn(async (cb: (e: unknown) => void) => {
      cb({ event: "Started", data: { contentLength: 1000 } });
      cb({ event: "Progress", data: { chunkLength: 600 } });
      cb({ event: "Progress", data: { chunkLength: 400 } });
      cb({ event: "Finished" });
    }),
  };
}

describe("actualizador", () => {
  beforeEach(() => {
    checkMock.mockReset();
    relaunchMock.mockReset();
    useUpdates.setState({ status: { state: "idle" }, autoCheck: true, lastChecked: null });
  });

  it("detecta una versión nueva con sus notas", async () => {
    checkMock.mockResolvedValue(fakeUpdate());
    await useUpdates.getState().check({ manual: true });
    expect(useUpdates.getState().status).toMatchObject({ state: "available", version: "1.0.2", notes: "Novedades de prueba" });
    expect(useUpdates.getState().lastChecked).not.toBeNull();
  });

  it("dice que está al día si no hay nada nuevo (solo en la comprobación manual)", async () => {
    checkMock.mockResolvedValue(null);
    await useUpdates.getState().check();
    expect(useUpdates.getState().status.state).toBe("idle");
    await useUpdates.getState().check({ manual: true });
    expect(useUpdates.getState().status.state).toBe("uptodate");
  });

  it("las comprobaciones automáticas fallan en silencio; las manuales lo explican", async () => {
    checkMock.mockRejectedValue(new Error("Could not fetch a valid release JSON from the remote"));
    await useUpdates.getState().check();
    expect(useUpdates.getState().status.state).toBe("idle");
    await useUpdates.getState().check({ manual: true });
    expect(useUpdates.getState().status).toMatchObject({ state: "error" });
  });

  it("descarga con progreso, instala y reinicia", async () => {
    const u = fakeUpdate();
    checkMock.mockResolvedValue(u);
    await useUpdates.getState().check({ manual: true });
    const seen: string[] = [];
    const unsub = useUpdates.subscribe((s) => seen.push(s.status.state === "downloading" ? `dl:${s.status.downloaded}/${s.status.total}` : s.status.state));
    await useUpdates.getState().install();
    unsub();
    expect(u.downloadAndInstall).toHaveBeenCalled();
    expect(seen).toContain("dl:1000/1000");
    expect(seen).toContain("installing");
    expect(relaunchMock).toHaveBeenCalled();
  });

  it("no comprueba dos veces a la vez", async () => {
    let resolve!: (v: null) => void;
    checkMock.mockReturnValue(new Promise((r) => { resolve = r; }));
    const a = useUpdates.getState().check({ manual: true });
    const b = useUpdates.getState().check({ manual: true });
    resolve(null);
    await Promise.all([a, b]);
    expect(checkMock).toHaveBeenCalledTimes(1);
  });

  it("traduce los errores habituales", () => {
    expect(describeUpdateError(new Error("404 Not Found"))).toMatch(/Todavía no hay/);
    expect(describeUpdateError(new Error("signature verification failed"))).toMatch(/firma/);
    expect(describeUpdateError(new Error("error sending request: timed out"))).toMatch(/conexión/);
  });
});
