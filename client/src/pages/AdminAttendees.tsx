import { useEffect, useState } from "react";
import { Loader2, Search, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 25;

export default function AdminAttendees() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [eventId, setEventId] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const { data: events } = useQuery({ queryKey: ["/api/events"], queryFn: () => api.getAllEvents() });

  // Default to an open event once the list is loaded
  useEffect(() => {
    if (!eventId && events?.length) setEventId((events.find((e: any) => e.status === "ACTIVE") ?? events[0]).id);
  }, [events, eventId]);

  // Debounce the search box and go back to the first page
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/events", eventId, "attendees", q, page],
    queryFn: () => api.getAttendees(eventId, { q, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    enabled: !!eventId,
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeAttendee(id),
    onSuccess: () => {
      toast({ title: "Ticket revoked", description: "It will be rejected at every gate." });
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "attendees"] });
    },
    onError: (e: any) => toast({ title: "Could not revoke the ticket", description: e.message, variant: "destructive" }),
  });

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Attendees Management</h1>
        <p className="text-muted-foreground">Search registrations and revoke tickets that were lost, stolen or sold twice</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" />Registered attendees</CardTitle>
          <CardDescription>{total} registration{total === 1 ? "" : "s"}{q ? ` matching "${q}"` : ""}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="sm:w-72">
              <Select value={eventId} onValueChange={(v) => { setEventId(v); setPage(0); }}>
                <SelectTrigger data-testid="select-attendee-event"><SelectValue placeholder="Choose an event" /></SelectTrigger>
                <SelectContent>
                  {events?.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-attendee-search" />
            </div>
          </div>

          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No attendees found</TableCell></TableRow>
                )}
                {data?.items.map((a: any) => (
                  <TableRow key={a.id} data-testid={`row-attendee-${a.id}`}>
                    <TableCell className="font-medium">{a.fullName}</TableCell>
                    <TableCell>{a.email}</TableCell>
                    <TableCell><Badge variant="secondary">{a.ticketType}</Badge></TableCell>
                    <TableCell>
                      {a.revoked ? <Badge variant="destructive">Revoked</Badge> : a.entered ? <Badge>Entered</Badge> : <Badge variant="outline">Registered</Badge>}
                    </TableCell>
                    <TableCell>{new Date(a.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      {!a.revoked && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={revoke.isPending}
                          onClick={() => window.confirm(`Revoke the ticket of ${a.fullName}? It will stop working immediately.`) && revoke.mutate(a.id)}
                          data-testid={`button-revoke-${a.id}`}
                        >
                          Revoke ticket
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Page {page + 1} of {pages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
