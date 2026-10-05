import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle, XCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function AdminActivity() {
  const { data: events } = useQuery({
    queryKey: ["/api/events"],
    queryFn: () => api.getAllEvents(),
  });

  // Prefer an open event; fall back to the most recent one
  const eventId = (events?.find((e: any) => e.status === "ACTIVE") ?? events?.[0])?.id;

  const { data: checkins } = useQuery({
    queryKey: ["/api/checkins", eventId],
    queryFn: () => eventId ? api.getRecentCheckins(eventId, 100) : Promise.resolve([]),
    enabled: !!eventId,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Activity Log</h1>
        <p className="text-muted-foreground">Real-time check-in activity and system events</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Check-ins</CardTitle>
          <CardDescription>Latest attendee check-in activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {checkins?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No check-in activity yet</p>
              </div>
            )}
            {checkins?.map((checkin: any) => (
              <div
                key={checkin.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {checkin.result === "OK" ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <div>
                    <p className="font-medium">{checkin.attendee?.fullName || "Unknown"}</p>
                    <p className="text-sm text-muted-foreground">
                      Gate: {checkin.gate?.name || "Unknown"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant={checkin.result === "OK" ? "default" : checkin.result === "DUP" ? "secondary" : "destructive"}>
                    {checkin.result}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(checkin.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
