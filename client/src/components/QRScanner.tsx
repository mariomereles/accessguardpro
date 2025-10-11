import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, Camera } from "lucide-react";

interface QRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
  title?: string;
}

export function QRScanner({ onScan, onClose, title = "Scan QR Code" }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    const startScanner = async () => {
      try {
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            onScan(decodedText);
            scanner.stop();
          },
          () => {
            // Error callback - ignore
          }
        );
        setIsScanning(true);
      } catch (err) {
        console.error("Scanner error:", err);
      }
    };

    startScanner();

    return () => {
      if (scanner.isScanning) {
        scanner.stop().catch(console.error);
      }
    };
  }, [onScan]);

  const handleClose = async () => {
    if (scannerRef.current?.isScanning) {
      await scannerRef.current.stop();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <div className="relative h-full flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-semibold" data-testid="text-scanner-title">{title}</h2>
          <Button variant="ghost" size="icon" onClick={handleClose} data-testid="button-close-scanner">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <Card className="p-6 bg-muted/30">
              <div
                id="qr-reader"
                className="w-full rounded-lg overflow-hidden"
                data-testid="qr-reader-container"
              ></div>
            </Card>
            
            {isScanning && (
              <div className="mt-6 text-center">
                <div className="inline-flex items-center gap-2 text-muted-foreground">
                  <Camera className="h-5 w-5" />
                  <span>Position QR code within the frame</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
