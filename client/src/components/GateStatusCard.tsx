import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DoorOpen, Power, QrCode } from "lucide-react";

interface GateStatusCardProps {
  name: string;
  location: string;
  isActive: boolean;
  checkins: number;
  lastCheckin?: string;
  onToggle?: () => void;
  onViewQR?: () => void;
}

export function GateStatusCard({
  name,
  location,
  isActive,
  checkins,
  lastCheckin,
  onToggle,
  onViewQR,
}: GateStatusCardProps) {
  return (
    <Card
      className={`p-6 border-l-4 ${
        isActive ? "border-l-chart-3" : "border-l-muted"
      }`}
      data-testid={`card-gate-${name.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3">
          <div
            className={`h-10 w-10 rounded-lg flex items-center justify-center ${
              isActive ? "bg-chart-3/10" : "bg-muted"
            }`}
          >
            <DoorOpen
              className={`h-5 w-5 ${isActive ? "text-chart-3" : "text-muted-foreground"}`}
            />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1" data-testid={`text-gate-name-${name.toLowerCase().replace(/\s+/g, "-")}`}>{name}</h3>
            <p className="text-sm text-muted-foreground">{location}</p>
          </div>
        </div>
        <Badge
          variant={isActive ? "default" : "secondary"}
          className="bg-opacity-20"
          data-testid={`badge-gate-status-${name.toLowerCase().replace(/\s+/g, "-")}`}
        >
          {isActive ? "Active" : "Inactive"}
        </Badge>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-2xl font-bold font-mono" data-testid={`text-checkins-${name.toLowerCase().replace(/\s+/g, "-")}`}>{checkins}</p>
          <p className="text-xs text-muted-foreground">Check-ins today</p>
        </div>
        {lastCheckin && (
          <div className="text-right">
            <p className="text-sm font-medium">Last check-in</p>
            <p className="text-xs text-muted-foreground">{lastCheckin}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onToggle}
          data-testid={`button-toggle-${name.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <Power className="h-4 w-4 mr-2" />
          {isActive ? "Disable" : "Enable"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onViewQR}
          data-testid={`button-view-qr-${name.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <QrCode className="h-4 w-4 mr-2" />
          View QR
        </Button>
      </div>
    </Card>
  );
}
