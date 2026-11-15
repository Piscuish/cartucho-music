export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

/** 401 persistente: hay que volver a autorizar al usuario. */
export class AuthError extends HttpError {
  constructor(body?: unknown) {
    super(401, "No autorizado", body);
    this.name = "AuthError";
  }
}

/** 403: la cuenta o la app no tienen permiso (p. ej. sin Premium, o fuera de la allowlist). */
export class ForbiddenError extends HttpError {
  constructor(body?: unknown) {
    super(403, "Acceso denegado", body);
    this.name = "ForbiddenError";
  }
}

/** 429 tras agotar los reintentos. */
export class RateLimitError extends HttpError {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number, body?: unknown) {
    super(429, `Límite de solicitudes; reintentar en ${Math.ceil(retryAfterMs / 1000)} s`, body);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("Error de red", { cause });
    this.name = "NetworkError";
  }
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Tiempo de espera agotado (${ms} ms)`);
    this.name = "TimeoutError";
  }
}

/** La respuesta no tiene la forma esperada. */
export class ResponseValidationError extends Error {
  readonly issues: unknown;
  constructor(url: string, issues: unknown) {
    super(`Respuesta inesperada de ${url}`);
    this.name = "ResponseValidationError";
    this.issues = issues;
  }
}
