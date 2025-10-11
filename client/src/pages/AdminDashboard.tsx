import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { MetricCard } from "@/components/MetricCard";
import { GateStatusCard } from "@/components/GateStatusCard";
import { LiveActivityFeed } from "@/components/LiveActivityFeed";
import { ChartContainer } from "@/components/ChartContainer";
import { Users, Activity, AlertTriangle, DoorOpen } from "lucide-react";
import { api } from "@/lib/api";
import { subscribeToEvent } from "@/lib/websocket";
import { useToast } from "@/hooks/use-toast";

// Default event ID from seed
const DEFAULT_EVENT_ID = "cf0bd3b2-7f74-4c85-a0f5-f80940cadc39";

export default function AdminDashboard() {
  const { toast } = useToast();
  const [recentCheckins, setRecentCheckins] = useState<any[]>([]);

  const { data: metrics, refetch: refetchMetrics } = useQuery({
    queryKey: ["/api/events", DEFAULT_EVENT_ID, "metrics"],
    queryFn: () => api.getEventMetrics(DEFAULT_EVENT_ID),
  });

  const { data: gateMetrics, refetch: refetchGates } = useQuery({
    queryKey: ["/api/events", DEFAULT_EVENT_ID, "gates", "metrics"],
    queryFn: () => api.getGateMetrics(DEFAULT_EVENT_ID),
  });

  const { data: checkins, refetch: refetchCheckins } = useQuery({
    queryKey: ["/api/events", DEFAULT_EVENT_ID, "checkins"],
    queryFn: () => api.getRecentCheckins(DEFAULT_EVENT_ID, 50),
  });

  useEffect(() => {
    if (checkins) {
      setRecentCheckins(checkins.map((c: any) => ({
        id: c.id,
        attendeeName: c.attendee?.fullName || "Unknown",
        gate: c.gate?.name || "Unknown Gate",
        result: c.result,
        timestamp: new Date(c.timestamp).toLocaleTimeString(),
      })));
    }
  }, [checkins]);

  useEffect(() => {
    const unsubscribe = subscribeToEvent(DEFAULT_EVENT_ID, (data) => {
      if (data.type === "checkin") {
        refetchMetrics();
        refetchGates();
        refetchCheckins();
      }
    });

    return () => unsubscribe();
  }, [refetchMetrics, refetchGates, refetchCheckins]);

  const handleToggleGate = async (gateId: string, currentStatus: boolean) => {
    try {
      await api.toggleGateStatus(gateId, !currentStatus);
      refetchGates();
      toast({
        title: "Gate Updated",
        description: `Gate ${!currentStatus ? 'enabled' : 'disabled'} successfully`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Mock chart data - would come from time-series metrics in real app
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
          value={metrics?.totalCheckins || 0}
          icon={Users}
          description="All time"
        />
        <MetricCard
          title="Today"
          value={metrics?.todayCheckins || 0}
          icon={Activity}
        />
        <MetricCard
          title="Duplicates"
          value={metrics?.duplicates || 0}
          icon={AlertTriangle}
        />
        <MetricCard
          title="Active Gates"
          value={gateMetrics?.filter((g: any) => g.isActive).length || 0}
          icon={DoorOpen}
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
            {gateMetrics?.map((gate: any) => (
              <GateStatusCard
                key={gate.id}
                name={gate.name}
                location={gate.location}
                isActive={gate.isActive}
                checkins={gate.checkins}
                lastCheckin={gate.lastCheckin ? new Date(gate.lastCheckin).toLocaleString() : undefined}
                onToggle={() => handleToggleGate(gate.id, gate.isActive)}
                onViewQR={() => console.log("View QR for", gate.id)}
              />
            ))}
          </div>
        </div>

        <LiveActivityFeed activities={recentCheckins} />
      </div>
    </div>
  );
}
