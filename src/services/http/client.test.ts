import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { HttpClient, parseRetryAfter } from "./client";
import { AuthError, ForbiddenError, HttpError, NetworkError, RateLimitError, ResponseValidationError } from "./errors";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers });

function setup(responses: (Response | Error)[], extra: Partial<ConstructorParameters<typeof HttpClient>[0]> = {}) {
  const queue = [...responses];
  const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const next = queue.shift();
    if (!next) throw new Error("sin más respuestas simuladas");
    if (next instanceof Error) throw next;
    return next;
  });
  const sleeps: number[] = [];
  let now = 1_000_000;
  const client = new HttpClient({
    baseUrl: "https://api.example.com/v1",
    fetch: fetch as unknown as typeof globalThis.fetch,
    sleep: async (ms) => { sleeps.push(ms); now += ms; },
    now: () => now,
    random: () => 0,
    ...extra,
  });
  return { client, fetch, sleeps };
}

describe("HttpClient", () => {
  it("construye URLs con query y omite valores nulos", () => {
    const { client } = setup([]);
    expect(client.url("me/tracks", { limit: 20, offset: 0, market: undefined, q: null })).toBe("https://api.example.com/v1/me/tracks?limit=20&offset=0");
  });

  it("añade el token Bearer", async () => {
    const { client, fetch } = setup([json(200, { ok: true })], { getAccessToken: async () => "abc" });
    await client.get("me");
    const init = fetch.mock.calls[0][1]!;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer abc");
  });

  it("respeta Retry-After en 429 y reintenta", async () => {
    const { client, fetch, sleeps } = setup([json(429, {}, { "Retry-After": "2" }), json(200, { n: 1 })]);
    await expect(client.get("x")).resolves.toEqual({ n: 1 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([2000]);
  });

  it("lanza RateLimitError al agotar reintentos", async () => {
    const r = () => json(429, {}, { "Retry-After": "1" });
    const { client } = setup([r(), r(), r(), r()], { maxRetries: 3 });
    await expect(client.get("x")).rejects.toBeInstanceOf(RateLimitError);
  });

  it("limita la espera de Retry-After", async () => {
    const { client, sleeps } = setup([json(429, {}, { "Retry-After": "3600" }), json(200, {})], { maxRetryAfterMs: 5000 });
    await client.get("x");
    expect(sleeps).toEqual([5000]);
  });

  it("reintenta 5xx con backoff exponencial", async () => {
    const { client, sleeps } = setup([json(503, {}), json(502, {}), json(200, { ok: 1 })]);
    await expect(client.get("x")).resolves.toEqual({ ok: 1 });
    expect(sleeps).toEqual([300, 600]);
  });

  it("no reintenta 4xx y extrae el mensaje del cuerpo", async () => {
    const { client, fetch } = setup([json(404, { error: { status: 404, message: "Non existing id" } })]);
    const err = (await client.get("x").catch((e: unknown) => e)) as HttpError;
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(404);
    expect(err.message).toBe("Non existing id");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("renueva la sesión una vez ante 401", async () => {
    let token = "viejo";
    const refreshAuth = vi.fn(async () => { token = "nuevo"; return true; });
    const { client, fetch } = setup([json(401, {}), json(200, { ok: 1 })], { getAccessToken: async () => token, refreshAuth });
    await expect(client.get("x")).resolves.toEqual({ ok: 1 });
    expect(refreshAuth).toHaveBeenCalledTimes(1);
    expect((fetch.mock.calls[1][1]!.headers as Record<string, string>).Authorization).toBe("Bearer nuevo");
  });

  it("lanza AuthError si el 401 persiste tras renovar", async () => {
    const { client } = setup([json(401, {}), json(401, {})], { refreshAuth: async () => true });
    await expect(client.get("x")).rejects.toBeInstanceOf(AuthError);
  });

  it("lanza ForbiddenError en 403 sin reintentar", async () => {
    const { client, fetch } = setup([json(403, { error: { message: "Premium required" } })]);
    await expect(client.get("x")).rejects.toBeInstanceOf(ForbiddenError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reintenta errores de red y acaba en NetworkError", async () => {
    const e = () => new TypeError("Failed to fetch");
    const { client, fetch } = setup([e(), e(), e(), e()]);
    await expect(client.get("x")).rejects.toBeInstanceOf(NetworkError);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("deduplica GET idénticos en vuelo", async () => {
    const { client, fetch } = setup([json(200, { a: 1 })]);
    const [a, b] = await Promise.all([client.get("same"), client.get("same")]);
    expect(a).toEqual(b);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("valida la respuesta con zod", async () => {
    const schema = z.object({ id: z.string() });
    const ok = setup([json(200, { id: "1" })]);
    await expect(ok.client.get("x", { schema })).resolves.toEqual({ id: "1" });
    const bad = setup([json(200, { id: 1 })]);
    await expect(bad.client.get("x", { schema })).rejects.toBeInstanceOf(ResponseValidationError);
  });

  it("devuelve undefined en 204", async () => {
    const { client } = setup([new Response(null, { status: 204 })]);
    await expect(client.put("me/player/pause")).resolves.toBeUndefined();
  });

  it("propaga la cancelación sin reintentar", async () => {
    const ctrl = new AbortController();
    const fetch = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const client = new HttpClient({ baseUrl: "https://x.test", fetch: fetch as unknown as typeof globalThis.fetch });
    // Cancelada antes de llegar a fetch.
    const early = client.get("y", { signal: ctrl.signal });
    ctrl.abort();
    await expect(early).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(0);

    // Cancelada con la solicitud ya en curso.
    const ctrl2 = new AbortController();
    const late = client.get("z", { signal: ctrl2.signal });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    ctrl2.abort();
    await expect(late).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("parseRetryAfter", () => {
  it("acepta segundos y fechas HTTP", () => {
    expect(parseRetryAfter("3", 0)).toBe(3000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(parseRetryAfter(null, 0)).toBeNull();
    expect(parseRetryAfter("basura", 0)).toBeNull();
  });
});
