import { useQuery } from "@tanstack/react-query";
import { registry } from "@/providers/registry";
import { usePlayer } from "@/stores/player";

/** Cola del proveedor ACTIVO. Se refresca cuando cambia la pista o el modo aleatorio. */
export function useQueue() {
  const provider = usePlayer((s) => s.activeProvider);
  const trackId = usePlayer((s) => s.state?.track?.id);
  const shuffle = usePlayer((s) => s.state?.shuffle);
  const caps = provider ? registry.tryGet(provider)?.capabilities : undefined;
  return useQuery({
    queryKey: [provider, "queue", trackId, shuffle],
    queryFn: ({ signal }) => registry.get(provider!).playback.getQueue(signal),
    enabled: !!provider && !!caps?.queue.read,
    staleTime: 0,
  });
}
