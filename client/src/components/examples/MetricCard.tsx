import { MetricCard } from "../MetricCard";
import { Users, Activity, AlertTriangle, DoorOpen } from "lucide-react";

export default function MetricCardExample() {
  return (
    <div className="p-8 bg-background grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <MetricCard
        title="Total Entries"
        value="1,247"
        icon={Users}
        trend={{ value: 12.5, isPositive: true }}
        description="Last 24 hours"
      />
      <MetricCard
        title="Current Rate"
        value="24/min"
        icon={Activity}
        trend={{ value: 8.2, isPositive: true }}
      />
      <MetricCard
        title="Duplicates"
        value="3"
        icon={AlertTriangle}
        trend={{ value: 2.1, isPositive: false }}
      />
      <MetricCard
        title="Active Gates"
        value="4"
        icon={DoorOpen}
        description="All operational"
      />
    </div>
  );
}
