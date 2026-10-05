import { useState } from "react";
import { Calendar, Loader2, MapPin, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const emptyForm = { name: "", venue: "", startsAt: "", endsAt: "", orgId: "" };

const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" =>
  status === "ACTIVE" ? "default" : status === "CANCELLED" ? "destructive" : "secondary";

export default function AdminEvents() {
  const { isPlatformAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: events, isLoading } = useQuery({ queryKey: ["/api/events"], queryFn: () => api.getAllEvents() });
  const { data: orgs } = useQuery({ queryKey: ["/api/orgs"], queryFn: () => api.listOrgs(), enabled: isPlatformAdmin });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    queryClient.invalidateQueries({ queryKey: ["/api/events/active"] });
    queryClient.invalidateQueries({ queryKey: ["/api/me/events"] });
  };
  const fail = (title: string) => (e: any) => toast({ title, description: e.message, variant: "destructive" });

  const create = useMutation({
    mutationFn: () =>
      api.createEvent({
        name: form.name.trim(),
        venue: form.venue.trim(),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        status: "ACTIVE",
        ...(isPlatformAdmin ? { orgId: form.orgId || null } : {}),
      }),
    onSuccess: () => {
      toast({ title: "Event created" });
      setOpen(false);
      setForm(emptyForm);
      refresh();
    },
    onError: fail("Could not create the event"),
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) => api.setEventStatus(v.id, v.status),
    onSuccess: refresh,
    onError: fail("Could not change the event"),
  });

  const anonymize = useMutation({
    mutationFn: (id: string) => api.anonymizeEvent(id),
    onSuccess: (r: any) => toast({ title: "Personal data removed", description: `${r.anonymized} attendee record(s) anonymized.` }),
    onError: fail("Could not anonymize"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Events Management</h1>
          <p className="text-muted-foreground">Create events and control when they admit people</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-event"><Plus className="w-4 h-4 mr-2" />Create Event</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>New event</DialogTitle>
            <DialogDescription>It opens for registration and check-in as soon as it is created.</DialogDescription>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (isPlatformAdmin && !form.orgId) {
                  toast({ title: "Choose an organization", variant: "destructive" });
                  return;
                }
                create.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="ev-name">Name</Label>
                <Input id="ev-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={200} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ev-venue">Venue</Label>
                <Input id="ev-venue" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} required maxLength={200} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ev-start">Starts</Label>
                  <Input id="ev-start" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ev-end">Ends</Label>
                  <Input id="ev-end" type="datetime-local" value={form.endsAt} min={form.startsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} required />
                </div>
              </div>
              {isPlatformAdmin && (
                <div className="space-y-2">
                  <Label>Organization</Label>
                  <Select value={form.orgId} onValueChange={(v) => setForm({ ...form, orgId: v })}>
                    <SelectTrigger data-testid="select-event-org"><SelectValue placeholder="Choose an organization" /></SelectTrigger>
                    <SelectContent>
                      {orgs?.map((o: any) => (
                        <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button type="submit" disabled={create.isPending} className="w-full">
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create event
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {events?.length === 0 && <p className="text-muted-foreground">No events yet.</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {events?.map((event: any) => (
          <Card key={event.id} data-testid={`card-event-${event.id}`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Calendar className="w-6 h-6 text-primary" />
                <Badge variant={statusVariant(event.status)}>{event.status}</Badge>
              </div>
              <CardTitle>{event.name}</CardTitle>
              <CardDescription className="flex items-center gap-1"><MapPin className="w-3 h-3" />{event.venue}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Starts</span>
                <span>{new Date(event.startsAt).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ends</span>
                <span>{new Date(event.endsAt).toLocaleString()}</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {event.status === "ACTIVE" && (
                  <>
                    <Button size="sm" variant="outline" disabled={setStatus.isPending}
                      onClick={() => window.confirm("End this event? Nobody will be admitted after this.") && setStatus.mutate({ id: event.id, status: "ENDED" })}>
                      End event
                    </Button>
                    <Button size="sm" variant="destructive" disabled={setStatus.isPending}
                      onClick={() => window.confirm("Cancel this event? Check-in stops immediately.") && setStatus.mutate({ id: event.id, status: "CANCELLED" })}>
                      Cancel
                    </Button>
                  </>
                )}
                {(event.status === "DRAFT" || event.status === "ENDED") && (
                  <Button size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: event.id, status: "ACTIVE" })}>
                    {event.status === "DRAFT" ? "Activate" : "Reopen"}
                  </Button>
                )}
                {(event.status === "ENDED" || event.status === "CANCELLED") && (
                  <Button size="sm" variant="outline" disabled={anonymize.isPending}
                    onClick={() => window.confirm("Replace the personal data of every attendee of this event with irreversible placeholders? Check-in history is kept.") && anonymize.mutate(event.id)}
                    data-testid={`button-anonymize-${event.id}`}>
                    Remove personal data
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
