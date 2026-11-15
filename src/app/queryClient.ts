import { QueryClient } from "@tanstack/react-query";
import { NotFoundError, ProviderAuthError, UnsupportedOperationError } from "@/providers/errors";
import { AuthError, ForbiddenError, HttpError, RateLimitError } from "@/services/http/errors";

/** Errores que no mejoran reintentando. (El HttpClient ya reintenta 429/5xx/red por su cuenta.) */
function isPermanent(err: unknown): boolean {
  return (
    err instanceof UnsupportedOperationError ||
    err instanceof NotFoundError ||
    err instanceof ProviderAuthError ||
    err instanceof AuthError ||
    err instanceof ForbiddenError ||
    err instanceof RateLimitError ||
    (err instanceof HttpError && err.status >= 400 && err.status < 500)
  );
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !isPermanent(err) && count < 1,
    },
    mutations: { retry: false },
  },
});
