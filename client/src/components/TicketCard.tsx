import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Share2, QrCode as QrCodeIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface TicketCardProps {
  attendeeName: string;
  eventName: string;
  ticketType: string;
  ticketCode: string;
  venue: string;
  date: string;
  onDownload?: () => void;
  onShare?: () => void;
}

export function TicketCard({
  attendeeName,
  eventName,
  ticketType,
  ticketCode,
  venue,
  date,
  onDownload,
  onShare,
}: TicketCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, ticketCode, {
        width: 280,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
    }
  }, [ticketCode]);

  return (
    <div className="max-w-md mx-auto" data-testid="card-ticket">
      <Card className="p-8 border-2 border-primary/20">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-primary/10 mb-4">
            <QrCodeIcon className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-2" data-testid="text-event-name">{eventName}</h2>
          <p className="text-muted-foreground">{venue}</p>
          <p className="text-sm text-muted-foreground">{date}</p>
        </div>

        <div className="bg-muted/30 rounded-lg p-6 mb-6 flex items-center justify-center">
          <canvas ref={canvasRef} className="max-w-full" data-testid="canvas-qr-code" data-code={ticketCode} />
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Attendee</span>
            <span className="text-sm font-medium" data-testid="text-attendee-name">{attendeeName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Ticket Type</span>
            <span className="text-sm font-medium" data-testid="text-ticket-type">{ticketType}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Ticket Code</span>
            <span className="text-sm font-mono font-medium" data-testid="text-ticket-code">{ticketCode}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="default"
            className="flex-1"
            onClick={onDownload}
            data-testid="button-download-ticket"
          >
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={onShare}
            data-testid="button-share-ticket"
          >
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>
      </Card>
    </div>
  );
}
