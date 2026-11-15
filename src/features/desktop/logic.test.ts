import { describe, expect, it } from "vitest";
import { shouldNotify, trackKey, trayTooltip } from "./logic";
import { desktopDefaults, parseDesktopPrefs } from "@/stores/desktop";
import type { Track } from "@/types/music";

const t = (id: string, name = `Tema ${id}`): Track => ({
  kind: "track", id, provider: "spotify", name, artistIds: ["a"], artistNames: ["Artista"], albumId: "al", albumName: "Álbum",
  durationMs: 1000, artwork: {},
});
const prefs = { notifyTrackChange: true, notifyOnlyWhenHidden: true };

describe("shouldNotify", () => {
  it("no avisa en la primera lectura al abrir la app", () => {
    expect(shouldNotify({ previousKey: undefined, track: t("1"), isPlaying: true, windowVisible: false, prefs })).toBe(false);
  });
  it("avisa cuando empieza otra canción con la ventana oculta", () => {
    expect(shouldNotify({ previousKey: "spotify:1", track: t("2"), isPlaying: true, windowVisible: false, prefs })).toBe(true);
  });
  it("no avisa al pausar/reanudar la misma canción", () => {
    expect(shouldNotify({ previousKey: "spotify:1", track: t("1"), isPlaying: true, windowVisible: false, prefs })).toBe(false);
    expect(shouldNotify({ previousKey: "spotify:1", track: t("2"), isPlaying: false, windowVisible: false, prefs })).toBe(false);
  });
  it("respeta «solo en segundo plano» y el interruptor general", () => {
    expect(shouldNotify({ previousKey: "spotify:1", track: t("2"), isPlaying: true, windowVisible: true, prefs })).toBe(false);
    expect(shouldNotify({ previousKey: "spotify:1", track: t("2"), isPlaying: true, windowVisible: true, prefs: { ...prefs, notifyOnlyWhenHidden: false } })).toBe(true);
    expect(shouldNotify({ previousKey: "spotify:1", track: t("2"), isPlaying: true, windowVisible: false, prefs: { ...prefs, notifyTrackChange: false } })).toBe(false);
  });
  it("distingue el mismo ID en servicios distintos", () => {
    expect(trackKey({ ...t("1"), provider: "apple-music" })).not.toBe(trackKey(t("1")));
  });
});

describe("trayTooltip", () => {
  it("muestra estado, canción y artista, y recorta a 120 caracteres", () => {
    expect(trayTooltip(null, false)).toBe("Cartucho Music");
    expect(trayTooltip(t("1", "Luz"), true)).toBe("▶ Luz — Artista");
    expect(trayTooltip(t("1", "x".repeat(300)), false).length).toBeLessThanOrEqual(120);
  });
});

describe("preferencias de escritorio", () => {
  it("valida y completa con valores por defecto", () => {
    expect(parseDesktopPrefs(null)).toEqual(desktopDefaults);
    expect(parseDesktopPrefs({ mediaKeys: "sí", closeToTray: false })).toEqual({ ...desktopDefaults, closeToTray: false });
  });
});
