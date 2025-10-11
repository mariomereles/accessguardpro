import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface ActivityItem {
  id: string;
  attendeeName: string;
  gate: string;
  result: "OK" | "DUP" | "DENIED";
  timestamp: string;
}

interface LiveActivityFeedProps {
  activities: ActivityItem[];
}

export function LiveActivityFeed({ activities }: LiveActivityFeedProps) {
  const getResultIcon = (result: string) => {
    switch (result) {
      case "OK":
        return <CheckCircle2 className="h-4 w-4 text-chart-3" />;
      case "DUP":
        return <AlertCircle className="h-4 w-4 text-chart-4" />;
      case "DENIED":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const getResultBadge = (result: string) => {
    const variants: Record<string, { bg: string; text: string; label: string }> = {
      OK: { bg: "bg-chart-3/10", text: "text-chart-3", label: "Success" },
      DUP: { bg: "bg-chart-4/10", text: "text-chart-4", label: "Duplicate" },
      DENIED: { bg: "bg-destructive/10", text: "text-destructive", label: "Denied" },
    };

    const variant = variants[result] || variants.OK;

    return (
      <Badge className={`${variant.bg} ${variant.text}`} variant="secondary">
        {variant.label}
      </Badge>
    );
  };

  return (
    <Card className="p-6" data-testid="card-activity-feed">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Recent Activity</h3>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-chart-3 animate-pulse"></div>
          <span className="text-sm font-medium text-chart-3">LIVE</span>
        </div>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-3">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover-elevate"
              data-testid={`activity-${activity.id}`}
            >
              <div className="flex items-center gap-3 flex-1">
                {getResultIcon(activity.result)}
                <div className="flex-1">
                  <p className="font-medium text-sm" data-testid={`text-attendee-${activity.id}`}>{activity.attendeeName}</p>
                  <p className="text-xs text-muted-foreground">{activity.gate}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {getResultBadge(activity.result)}
                <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                  {activity.timestamp}
                </span>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
}
