import { describe, expect, it } from "vitest";
import { checkApkUpdate, compareVersions, pickApk } from "./apk";

const asset = (name: string) => ({ name, browser_download_url: `https://github.com/Piscuish/cartucho-music/releases/download/v1.1.0/${name}` });
const fakeFetch = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("actualizaciones del APK", () => {
  it("compara versiones", () => {
    expect(compareVersions("v1.0.10", "1.0.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.6", "v1.0.6")).toBe(0);
    expect(compareVersions("1.0.5", "1.1.0")).toBeLessThan(0);
  });

  it("elige el APK y descarta otros archivos", () => {
    expect(pickApk([asset("Cartucho.exe"), asset("Cartucho-Music-v1.1.0-android.apk")])).toContain(".apk");
    expect(pickApk([asset("Cartucho.exe")])).toBeNull();
    expect(pickApk([{ name: "x.apk", browser_download_url: "https://evil.example/x.apk" }])).toBeNull();
  });

  it("avisa solo si hay una versión más nueva con APK", async () => {
    const body = { tag_name: "v1.1.0", body: "Notas", published_at: null, assets: [asset("Cartucho-Music-v1.1.0-android.apk")] };
    expect((await checkApkUpdate("1.0.6", fakeFetch(body)))?.version).toBe("1.1.0");
    expect(await checkApkUpdate("1.1.0", fakeFetch(body))).toBeNull();
    expect(await checkApkUpdate("1.0.6", fakeFetch({ ...body, assets: [] }))).toBeNull();
  });

  it("propaga los errores de GitHub", async () => {
    await expect(checkApkUpdate("1.0.6", fakeFetch({}, 404))).rejects.toThrow(/404/);
  });
});
