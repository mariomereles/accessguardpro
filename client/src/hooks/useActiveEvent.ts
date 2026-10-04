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
export function useActiveEvent() {
  const { data, isPending, error } = useQuery<ActiveEvent[]>({
    queryKey: ["/api/events/active"],
    queryFn: () => api.getActiveEvents(),
    staleTime: 60_000,
  });
  return { event: data?.[0], isLoading: isPending, error };
}
