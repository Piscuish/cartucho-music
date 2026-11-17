import { beforeEach, describe, expect, it } from "vitest";
import { kv } from "@/database/stores";
import { BUILTIN_SPOTIFY_CLIENT_ID, getClientId, getCustomClientId, setClientId } from "./connector";

describe("Client ID de Spotify", () => {
  beforeEach(async () => {
    await kv.delete("spotify.clientId");
  });

  it("usa el incluido en la app si no hay uno propio (instalación nueva)", async () => {
    expect(BUILTIN_SPOTIFY_CLIENT_ID).toMatch(/^[A-Za-z0-9]{16,64}$/);
    expect(await getCustomClientId()).toBeNull();
    expect(await getClientId()).toBe(BUILTIN_SPOTIFY_CLIENT_ID);
  });

  it("un Client ID propio tiene prioridad y persiste", async () => {
    await setClientId("  0123456789abcdef0123456789abcdef ");
    expect(await getCustomClientId()).toBe("0123456789abcdef0123456789abcdef");
    expect(await getClientId()).toBe("0123456789abcdef0123456789abcdef");
  });

  it("vaciar el campo vuelve al incluido", async () => {
    await setClientId("0123456789abcdef0123456789abcdef");
    await setClientId("   ");
    expect(await getCustomClientId()).toBeNull();
    expect(await getClientId()).toBe(BUILTIN_SPOTIFY_CLIENT_ID);
  });

  it("guardar el mismo que el incluido no lo marca como propio", async () => {
    await setClientId(BUILTIN_SPOTIFY_CLIENT_ID);
    expect(await getCustomClientId()).toBeNull();
  });

  it("rechaza valores con formato inválido", async () => {
    await expect(setClientId("abc")).rejects.toThrow();
    await expect(setClientId("0123456789abcdef0123456789abcde!")).rejects.toThrow();
    expect(await getCustomClientId()).toBeNull();
  });
});
