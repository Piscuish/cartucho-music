import type { ZodType } from "zod";
import {
  AuthError, ForbiddenError, HttpError, NetworkError, RateLimitError, ResponseValidationError, TimeoutError,
} from "./errors";

/**
 * Cliente HTTP común para las APIs de los proveedores.
 *
 * - 429: respeta `Retry-After` y pausa TODAS las solicitudes del cliente (cooldown compartido).
 * - 5xx y errores de red: reintentos con backoff exponencial y jitter.
 * - 401: llama a `refreshAuth` una sola vez y repite; si sigue fallando lanza `AuthError`.
 * - GET idénticos en vuelo se deduplican.
 * - Validación opcional de la respuesta con zod.
 */
export interface HttpClientOptions {
  baseUrl: string;
  getAccessToken?: () => Promise<string | null>;
  /** Intenta renovar la sesión. Devuelve `true` si hay un token nuevo. */
  refreshAuth?: () => Promise<boolean>;
  maxRetries?: number;
  timeoutMs?: number;
  /** Tope de espera para Retry-After, para no bloquear la UI indefinidamente. */
  maxRetryAfterMs?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

export interface RequestOptions<T> {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  schema?: ZodType<T>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

const RETRYABLE = new Set([500, 502, 503, 504]);

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const id = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(id); reject(signal.reason); }, { once: true });
  });
}

/** `Retry-After` puede venir en segundos o como fecha HTTP. */
export function parseRetryAfter(value: string | null, now: number): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

export class HttpClient {
  private readonly o: Required<Omit<HttpClientOptions, "getAccessToken" | "refreshAuth">> &
    Pick<HttpClientOptions, "getAccessToken" | "refreshAuth">;
  private readonly inflight = new Map<string, Promise<unknown>>();
  private cooldownUntil = 0;

  constructor(options: HttpClientOptions) {
    this.o = {
      maxRetries: 3,
      timeoutMs: 15_000,
      maxRetryAfterMs: 60_000,
      fetch: (...args) => globalThis.fetch(...args),
      sleep: defaultSleep,
      random: Math.random,
      now: Date.now,
      ...options,
    };
  }

  get<T>(path: string, opts: Omit<RequestOptions<T>, "body"> = {}): Promise<T> {
    const url = this.url(path, opts.query);
    // Solo se deduplican GET sin señal de cancelación propia (compartir una señal sería incorrecto).
    if (opts.signal) return this.request("GET", url, opts);
    const existing = this.inflight.get(url);
    if (existing) return existing as Promise<T>;
    const p = this.request("GET", url, opts).finally(() => this.inflight.delete(url));
    this.inflight.set(url, p);
    return p;
  }

  post<T>(path: string, opts: RequestOptions<T> = {}) { return this.request<T>("POST", this.url(path, opts.query), opts); }
  put<T>(path: string, opts: RequestOptions<T> = {}) { return this.request<T>("PUT", this.url(path, opts.query), opts); }
  delete<T>(path: string, opts: RequestOptions<T> = {}) { return this.request<T>("DELETE", this.url(path, opts.query), opts); }

  url(path: string, query?: RequestOptions<unknown>["query"]): string {
    const u = new URL(path, this.o.baseUrl.endsWith("/") ? this.o.baseUrl : this.o.baseUrl + "/");
    for (const [k, v] of Object.entries(query ?? {})) if (v != null) u.searchParams.set(k, String(v));
    return u.toString();
  }

  private backoff(attempt: number): number {
    const base = 300 * 2 ** attempt;
    return Math.min(8_000, base + this.o.random() * base * 0.3);
  }

  private async request<T>(method: Method, url: string, opts: RequestOptions<T>): Promise<T> {
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      const wait = this.cooldownUntil - this.o.now();
      if (wait > 0) await this.o.sleep(wait, opts.signal);

      let res: Response;
      try {
        res = await this.send(method, url, opts);
      } catch (e) {
        if (opts.signal?.aborted || (e instanceof DOMException && e.name === "AbortError")) throw e;
        if (attempt < this.o.maxRetries) { await this.o.sleep(this.backoff(attempt), opts.signal); continue; }
        throw e instanceof TimeoutError ? e : new NetworkError(e);
      }

      if (res.ok) return this.parse(res, url, opts.schema);

      const body = await safeBody(res);
      if (res.status === 401) {
        if (!refreshed && this.o.refreshAuth && (await this.o.refreshAuth())) { refreshed = true; attempt--; continue; }
        throw new AuthError(body);
      }
      if (res.status === 403) throw new ForbiddenError(body);
      if (res.status === 429) {
        const ms = Math.min(parseRetryAfter(res.headers.get("Retry-After"), this.o.now()) ?? this.backoff(attempt), this.o.maxRetryAfterMs);
        if (attempt < this.o.maxRetries) {
          this.cooldownUntil = Math.max(this.cooldownUntil, this.o.now() + ms);
          continue;
        }
        throw new RateLimitError(ms, body);
      }
      if (RETRYABLE.has(res.status) && attempt < this.o.maxRetries) {
        await this.o.sleep(this.backoff(attempt), opts.signal);
        continue;
      }
      throw new HttpError(res.status, errorMessage(body) ?? `HTTP ${res.status}`, body);
    }
  }

  private async send(method: Method, url: string, opts: RequestOptions<unknown>): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
    const token = await this.o.getAccessToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }

    // La señal puede haberse cancelado mientras se obtenía el token: el evento ya no llegaría.
    if (opts.signal?.aborted) throw opts.signal.reason ?? new DOMException("Aborted", "AbortError");
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort(opts.signal?.reason);
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, this.o.timeoutMs);
    try {
      return await this.o.fetch(url, { method, headers, body, signal: ctrl.signal });
    } catch (e) {
      if (timedOut) throw new TimeoutError(this.o.timeoutMs);
      throw e;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }

  private async parse<T>(res: Response, url: string, schema?: ZodType<T>): Promise<T> {
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const data: unknown = text ? JSON.parse(text) : undefined;
    if (!schema) return data as T;
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new ResponseValidationError(url, parsed.error.issues);
    return parsed.data;
  }
}

async function safeBody(res: Response): Promise<unknown> {
  try {
    const text = await res.text();
    try { return JSON.parse(text); } catch { return text; }
  } catch {
    return undefined;
  }
}

function errorMessage(body: unknown): string | undefined {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error: unknown }).error;
    if (typeof err === "string") return err;
    if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  }
  return undefined;
}
