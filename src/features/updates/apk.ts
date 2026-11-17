/**
 * Actualizaciones en Android: no hay actualizador firmado como en Windows. Se consulta la
 * última Release publicada en GitHub y, si trae un APK más nuevo, se abre su descarga en el
 * navegador; Android pide confirmación para instalarlo encima (misma firma = se conservan
 * los datos).
 */
import { z } from "zod";

export const RELEASES_API = "https://api.github.com/repos/Piscuish/cartucho-music/releases/latest";

const release = z.object({
  tag_name: z.string(),
  body: z.string().nullable().optional(),
  published_at: z.string().nullable().optional(),
  assets: z.array(z.object({ name: z.string(), browser_download_url: z.string().url() })),
});

export interface ApkUpdate { version: string; notes: string; date: string | null; url: string }

/** <0 si a<b, 0 si iguales, >0 si a>b (x.y.z; se ignora el prefijo «v»). */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/i, "").split(/[.+-]/).slice(0, 3).map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Elige el APK de la Release (si hay varios, el universal o el de arm64). */
export function pickApk(assets: { name: string; browser_download_url: string }[]): string | null {
  const apks = assets.filter((a) => a.name.toLowerCase().endsWith(".apk"));
  const pick = apks.find((a) => /universal|arm64|aarch64/i.test(a.name)) ?? apks[0];
  return pick && pick.browser_download_url.startsWith("https://github.com/") ? pick.browser_download_url : null;
}

/** Devuelve la actualización disponible, o null si ya está al día o la Release no trae APK. */
export async function checkApkUpdate(current: string, fetchImpl: typeof fetch = fetch): Promise<ApkUpdate | null> {
  const res = await fetchImpl(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
  if (res.status === 404) throw new Error("404 Not Found");
  if (!res.ok) throw new Error(`GitHub respondió ${res.status}`);
  const r = release.parse(await res.json());
  if (compareVersions(r.tag_name, current) <= 0) return null;
  const url = pickApk(r.assets);
  if (!url) return null;
  return { version: r.tag_name.replace(/^v/i, ""), notes: r.body ?? "", date: r.published_at ?? null, url };
}
