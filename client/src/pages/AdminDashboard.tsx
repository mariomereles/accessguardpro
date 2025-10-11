import { useState } from "react";
import { MetricCard } from "@/components/MetricCard";
import { GateStatusCard } from "@/components/GateStatusCard";
import { LiveActivityFeed } from "@/components/LiveActivityFeed";
import { ChartContainer } from "@/components/ChartContainer";
import { Users, Activity, AlertTriangle, DoorOpen } from "lucide-react";

export default function AdminDashboard() {
  // TODO: Remove mock functionality - fetch from backend
  const [gates, setGates] = useState([
    { id: "1", name: "Main Entrance", location: "Building A - Ground Floor", isActive: true, checkins: 342, lastCheckin: "2 min ago" },
    { id: "2", name: "VIP Gate", location: "Building A - 2nd Floor", isActive: true, checkins: 87, lastCheckin: "5 min ago" },
    { id: "3", name: "East Entry", location: "Building B - Ground Floor", isActive: true, checkins: 156, lastCheckin: "1 min ago" },
    { id: "4", name: "West Entry", location: "Building B - Ground Floor", isActive: false, checkins: 0 },
  ]);

  const mockActivities = [
    { id: "1", attendeeName: "Sarah Johnson", gate: "Main Entrance", result: "OK" as const, timestamp: "14:32:45" },
    { id: "2", attendeeName: "Michael Chen", gate: "VIP Gate", result: "OK" as const, timestamp: "14:32:42" },
    { id: "3", attendeeName: "Emma Wilson", gate: "Main Entrance", result: "DUP" as const, timestamp: "14:32:38" },
    { id: "4", attendeeName: "David Martinez", gate: "East Entry", result: "OK" as const, timestamp: "14:32:35" },
    { id: "5", attendeeName: "Lisa Anderson", gate: "Main Entrance", result: "DENIED" as const, timestamp: "14:32:30" },
    { id: "6", attendeeName: "James Taylor", gate: "VIP Gate", result: "OK" as const, timestamp: "14:32:28" },
  ];

  const chartData = [
    { time: "14:00", mainEntrance: 24, vipGate: 8, eastEntry: 12 },
    { time: "14:15", mainEntrance: 32, vipGate: 12, eastEntry: 15 },
    { time: "14:30", mainEntrance: 45, vipGate: 18, eastEntry: 22 },
    { time: "14:45", mainEntrance: 38, vipGate: 15, eastEntry: 18 },
    { time: "15:00", mainEntrance: 42, vipGate: 20, eastEntry: 25 },
  ];

  const chartLines = [
    { dataKey: "mainEntrance", name: "Main Entrance", color: "hsl(var(--chart-1))" },
    { dataKey: "vipGate", name: "VIP Gate", color: "hsl(var(--chart-2))" },
    { dataKey: "eastEntry", name: "East Entry", color: "hsl(var(--chart-3))" },
  ];

  const handleToggleGate = (id: string) => {
    setGates(gates.map(gate => 
      gate.id === id ? { ...gate, isActive: !gate.isActive } : gate
    ));
    console.log("Toggle gate:", id);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Monitor check-ins and gate status in real-time</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
          value="3"
          icon={DoorOpen}
          description="1 inactive"
        />
      </div>

      {/* Chart */}
      <ChartContainer
        title="Check-ins Over Time"
        data={chartData}
        lines={chartLines}
      />

      {/* Gates and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Gate Status</h2>
          <div className="space-y-4">
            {gates.map((gate) => (
              <GateStatusCard
                key={gate.id}
                name={gate.name}
                location={gate.location}
                isActive={gate.isActive}
                checkins={gate.checkins}
                lastCheckin={gate.lastCheckin}
                onToggle={() => handleToggleGate(gate.id)}
                onViewQR={() => console.log("View QR for", gate.id)}
              />
            ))}
          </div>
        </div>

        <LiveActivityFeed activities={mockActivities} />
      </div>
    </div>
  );
}
