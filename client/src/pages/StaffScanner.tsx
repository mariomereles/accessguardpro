import { useState } from "react";
import { QRScanner } from "@/components/QRScanner";
import { CheckinSuccessModal } from "@/components/CheckinSuccessModal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScanLine } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

import { useActiveEvent } from "@/hooks/useActiveEvent";

export default function StaffScanner() {
  const { toast } = useToast();
  const { event } = useActiveEvent();
  const eventId = event?.id ?? "";
  const [showScanner, setShowScanner] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedGate, setSelectedGate] = useState("");
  const [lastCheckin, setLastCheckin] = useState<any>(null);

  const { data: gates } = useQuery({
    queryKey: ["/api/events", eventId, "gates"],
    queryFn: () => api.getEventGates(eventId),
    enabled: !!eventId,
  });

  const handleScan = async (data: string) => {
    if (!selectedGate) {
      toast({
        title: "Error",
        description: "Please select a gate first",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await api.checkin("staff", {
        ticketQR: data,
        gateId: selectedGate,
      });

      setShowScanner(false);

      if (result.result === "OK") {
        setLastCheckin({
          attendeeName: result.attendee?.fullName || "Unknown",
          gate: result.gate?.name || "Unknown",
          timestamp: new Date(result.timestamp).toLocaleTimeString(),
        });
        setShowSuccess(true);
      } else {
        toast({
          title: "Check-in Failed",
          description: result.reason || "Unable to check-in",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Check-in failed",
        variant: "destructive",
      });
      setShowScanner(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Staff Scanner</h1>
          <p className="text-muted-foreground">Scan attendee QR codes for check-in</p>
        </div>

        <Card className="p-6">
          <div className="space-y-6">
            <div>
              <label className="text-sm font-medium mb-2 block">Select Gate</label>
              <Select value={selectedGate} onValueChange={setSelectedGate}>
                <SelectTrigger data-testid="select-gate">
                  <SelectValue placeholder="Choose a gate" />
                </SelectTrigger>
                <SelectContent>
                  {gates?.filter((g: any) => g.isActive).map((gate: any) => (
                    <SelectItem key={gate.id} value={gate.id}>
                      {gate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full h-16 text-lg"
              onClick={() => setShowScanner(true)}
              disabled={!selectedGate}
              data-testid="button-start-scan"
            >
              <ScanLine className="h-6 w-6 mr-2" />
              Start Scanning
            </Button>
          </div>
        </Card>

        {lastCheckin && (
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Last Check-in</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Attendee:</span>
                <span className="font-medium" data-testid="text-last-attendee">{lastCheckin.attendeeName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gate:</span>
                <span className="font-medium">{lastCheckin.gate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Time:</span>
                <span className="font-medium font-mono">{lastCheckin.timestamp}</span>
              </div>
            </div>
          </Card>
        )}
      </div>

      {showScanner && (
        <QRScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
          title="Scan Attendee Ticket"
        />
      )}

      {showSuccess && lastCheckin && (
        <CheckinSuccessModal
          attendeeName={lastCheckin.attendeeName}
          gate={lastCheckin.gate}
          timestamp={lastCheckin.timestamp}
          onClose={() => setShowSuccess(false)}
        />
      )}
    </div>
  );
}
