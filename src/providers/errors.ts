import type { ProviderId } from "@/types/music";

/** Operación que el proveedor no permite (según sus capacidades declaradas). */
export class UnsupportedOperationError extends Error {
  readonly provider: ProviderId;
  readonly operation: string;
  constructor(provider: ProviderId, operation: string) {
    super(`${provider} no admite la operación "${operation}"`);
    this.name = "UnsupportedOperationError";
    this.provider = provider;
    this.operation = operation;
  }
}

export class NotFoundError extends Error {
  constructor(what: string, id: string) {
    super(`${what} no encontrado: ${id}`);
    this.name = "NotFoundError";
  }
}

/** El servicio necesita que el usuario (re)conecte su cuenta. */
export class ProviderAuthError extends Error {
  readonly provider: ProviderId;
  constructor(provider: ProviderId, message = "Sesión no válida o caducada") {
    super(message);
    this.name = "ProviderAuthError";
    this.provider = provider;
  }
}

/** No hay ningún dispositivo activo para controlar (Spotify Connect). */
export class NoActiveDeviceError extends Error {
  readonly provider: ProviderId;
  constructor(provider: ProviderId) {
    super("No hay ningún dispositivo activo");
    this.name = "NoActiveDeviceError";
    this.provider = provider;
  }
}

/** La acción requiere una suscripción de pago (p. ej. controlar la reproducción en Spotify). */
export class PremiumRequiredError extends Error {
  readonly provider: ProviderId;
  constructor(provider: ProviderId) {
    super("Se necesita una suscripción Premium");
    this.name = "PremiumRequiredError";
    this.provider = provider;
  }
}

/** La sesión no incluye un permiso que la acción necesita: hay que reconectar el servicio. */
export class MissingPermissionError extends Error {
  readonly provider: ProviderId;
  readonly scope: string;
  constructor(provider: ProviderId, scope: string) {
    super(`Falta el permiso ${scope}`);
    this.name = "MissingPermissionError";
    this.provider = provider;
    this.scope = scope;
  }
}

/** Mensaje legible para el usuario a partir de cualquier error. */
export function describeError(err: unknown): string {
  if (err instanceof MissingPermissionError) return "Reconecta Spotify para que Cartucho pueda editar tus playlists.";
  if (err instanceof PremiumRequiredError) return "Necesitas Spotify Premium para controlar la reproducción.";
  if (err instanceof UnsupportedOperationError) return "Este servicio no permite esa acción.";
  if (err instanceof Error && err.name === "ForbiddenError") return "El servicio ha denegado la acción para esta cuenta.";
  if (err instanceof Error && err.name === "AuthError") return "Tu sesión ha caducado. Vuelve a conectar el servicio.";
  if (err instanceof ProviderAuthError) return "Tu sesión ha caducado. Vuelve a conectar el servicio.";
  if (err instanceof NoActiveDeviceError) return "Abre la app oficial en algún dispositivo para poder controlarla.";
  if (err instanceof NotFoundError) return "No se ha encontrado el contenido.";
  if (err instanceof Error && err.name === "RateLimitError") return "Demasiadas solicitudes. Reintentando en unos segundos…";
  if (err instanceof Error && err.name === "NetworkError") return "Sin conexión con el servicio.";
  return "Algo ha fallado. Inténtalo de nuevo.";
}
