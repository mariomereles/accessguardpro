import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface ActiveEvent {
  id: string;
  name: string;
  venue: string;
  startsAt: string;
  endsAt: string;
}

// The event the app currently works with: the first ACTIVE event (replaces the old hard-coded seed id).
// `scoped` (signed-in staff and managers) lists only the events of the user's organization;
// the public registration page lists every open event.
export function useActiveEvent(options: { scoped?: boolean } = {}) {
  const scoped = !!options.scoped;
  const { data, isPending, error } = useQuery<ActiveEvent[]>({
    queryKey: [scoped ? "/api/me/events" : "/api/events/active"],
    queryFn: () => (scoped ? api.getMyEvents() : api.getActiveEvents()),
    staleTime: 60_000,
  });
  return { event: data?.[0], isLoading: isPending, error };
}
