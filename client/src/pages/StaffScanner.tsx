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

export default function StaffScanner() {
  const [showScanner, setShowScanner] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedGate, setSelectedGate] = useState("main-entrance");
  const [lastCheckin, setLastCheckin] = useState<any>(null);

  // TODO: Remove mock functionality - fetch gates from backend
  const gates = [
    { id: "main-entrance", name: "Main Entrance" },
    { id: "vip-gate", name: "VIP Gate" },
    { id: "east-entry", name: "East Entry" },
  ];

  const handleScan = (data: string) => {
    console.log("Scanned:", data);
    // TODO: Remove mock functionality - validate and check-in via backend
    
    const mockCheckin = {
      attendeeName: "Sarah Johnson",
      gate: gates.find(g => g.id === selectedGate)?.name || "Main Entrance",
      timestamp: new Date().toLocaleTimeString(),
    };
    
    setLastCheckin(mockCheckin);
    setShowScanner(false);
    setShowSuccess(true);
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
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {gates.map((gate) => (
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
