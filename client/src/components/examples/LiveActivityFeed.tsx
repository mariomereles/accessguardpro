import { LiveActivityFeed } from "../LiveActivityFeed";

export default function LiveActivityFeedExample() {
  const mockActivities = [
    { id: "1", attendeeName: "Sarah Johnson", gate: "Main Entrance", result: "OK" as const, timestamp: "14:32:45" },
    { id: "2", attendeeName: "Michael Chen", gate: "VIP Gate", result: "OK" as const, timestamp: "14:32:42" },
    { id: "3", attendeeName: "Emma Wilson", gate: "Main Entrance", result: "DUP" as const, timestamp: "14:32:38" },
    { id: "4", attendeeName: "David Martinez", gate: "East Entry", result: "OK" as const, timestamp: "14:32:35" },
    { id: "5", attendeeName: "Lisa Anderson", gate: "Main Entrance", result: "DENIED" as const, timestamp: "14:32:30" },
    { id: "6", attendeeName: "James Taylor", gate: "VIP Gate", result: "OK" as const, timestamp: "14:32:28" },
  ];

  return (
    <div className="p-8 bg-background">
      <LiveActivityFeed activities={mockActivities} />
    </div>
  );
}
