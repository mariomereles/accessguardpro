import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Loader2, Users, Mail, Calendar } from "lucide-react";

export default function AdminAttendees() {
  const { data: events } = useQuery({
    queryKey: ["/api/events"],
    queryFn: () => api.getAllEvents(),
  });

  // For now, show a placeholder until we add an attendees API
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Attendees Management</h1>
        <p className="text-muted-foreground">View and manage event attendees</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registered Attendees</CardTitle>
          <CardDescription>View all registered attendees for your events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Attendee Management</h3>
            <p className="text-muted-foreground max-w-sm">
              View, search, and manage attendees who have registered for your events.
              Filter by event, check-in status, and more.
            </p>
            <Button className="mt-6">View All Attendees</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
