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

import { useActiveEvent } from "@/hooks/useActiveEvent";

export default function AdminDashboard() {
  const { toast } = useToast();
  const { event } = useActiveEvent({ scoped: true });
  const eventId = event?.id ?? "";
  const [recentCheckins, setRecentCheckins] = useState<any[]>([]);

  const { data: metrics, refetch: refetchMetrics } = useQuery({
    queryKey: ["/api/events", eventId, "metrics"],
    queryFn: () => api.getEventMetrics(eventId),
    enabled: !!eventId,
  });

  const { data: gateMetrics, refetch: refetchGates } = useQuery({
    queryKey: ["/api/events", eventId, "gates", "metrics"],
    queryFn: () => api.getGateMetrics(eventId),
    enabled: !!eventId,
  });

  const { data: checkins, refetch: refetchCheckins } = useQuery({
    queryKey: ["/api/events", eventId, "checkins"],
    queryFn: () => api.getRecentCheckins(eventId, 50),
    enabled: !!eventId,
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

  const { data: series, refetch: refetchSeries } = useQuery({
    queryKey: ["/api/events", eventId, "timeseries"],
    queryFn: () => api.getTimeSeries(eventId),
    enabled: !!eventId,
  });

  const { data: alerts, refetch: refetchAlerts } = useQuery({
    queryKey: ["/api/events", eventId, "alerts"],
    queryFn: () => api.getAlerts(eventId),
    enabled: !!eventId,
  });

  useEffect(() => {
    if (!eventId) return;
    const unsubscribe = subscribeToEvent(eventId, (data) => {
      if (data.type === "checkin") {
        refetchMetrics();
        refetchGates();
        refetchCheckins();
        refetchSeries();
      }
      if (data.type === "alert") {
        refetchAlerts();
        toast({ title: "Fraud alert", description: data.data?.message, variant: "destructive" });
      }
    });

    return () => unsubscribe();
  }, [eventId, refetchMetrics, refetchGates, refetchCheckins, refetchSeries, refetchAlerts]);

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

  // Real entries per 15 minutes and gate (one line per gate)
  const chartColors = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];
  const chartLines = (gateMetrics || []).map((g: any, i: number) => ({
    dataKey: g.id,
    name: g.name,
    color: chartColors[i % chartColors.length],
  }));
  const chartData = Object.values(
    (series || []).reduce((acc: Record<string, any>, p: any) => {
      const row = (acc[p.bucket] ??= {
        time: new Date(p.bucket).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      row[p.gateId] = p.count;
      return acc;
    }, {})
  ) as any[];

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

      {/* Fraud alerts */}
      {alerts && alerts.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4" data-testid="card-fraud-alerts">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Fraud alerts
          </h2>
          <ul className="space-y-2 text-sm">
            {alerts.slice(0, 5).map((a: any) => (
              <li key={a.id} className="flex items-start gap-3">
                <span className={`mt-0.5 rounded px-2 py-0.5 text-xs font-medium ${a.severity === "high" ? "bg-destructive text-destructive-foreground" : "bg-muted"}`}>
                  {a.severity}
                </span>
                <span className="flex-1">{a.message}</span>
                <span className="text-muted-foreground">{new Date(a.timestamp).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
