import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";

interface CheckinSuccessModalProps {
  attendeeName: string;
  gate: string;
  timestamp: string;
  onClose: () => void;
}

export function CheckinSuccessModal({
  attendeeName,
  gate,
  timestamp,
  onClose,
}: CheckinSuccessModalProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" data-testid="modal-checkin-success">
      <div className="bg-card border rounded-lg p-8 max-w-md w-full text-center space-y-6 animate-in fade-in zoom-in duration-300">
        <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-chart-3/10">
          <CheckCircle2 className="h-12 w-12 text-chart-3" />
        </div>
        
        <div>
          <h2 className="text-2xl font-bold mb-2">Check-in Successful!</h2>
          <p className="text-lg font-semibold text-primary" data-testid="text-success-attendee">{attendeeName}</p>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex justify-between">
            <span>Gate:</span>
            <span className="font-medium text-foreground" data-testid="text-success-gate">{gate}</span>
          </div>
          <div className="flex justify-between">
            <span>Time:</span>
            <span className="font-medium font-mono text-foreground" data-testid="text-success-time">{timestamp}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
