import { useState } from "react";
import { QRScanner } from "../QRScanner";
import { Button } from "@/components/ui/button";

export default function QRScannerExample() {
  const [showScanner, setShowScanner] = useState(false);
  const [scannedData, setScannedData] = useState("");

  return (
    <div className="p-8 bg-background min-h-screen">
      <div className="max-w-md mx-auto text-center space-y-4">
        <h2 className="text-2xl font-bold">QR Scanner Demo</h2>
        <Button onClick={() => setShowScanner(true)} data-testid="button-open-scanner">
          Open Scanner
        </Button>
        {scannedData && (
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">Scanned Data:</p>
            <p className="font-mono text-sm mt-2 break-all">{scannedData}</p>
          </div>
        )}
      </div>

      {showScanner && (
        <QRScanner
          onScan={(data) => {
            setScannedData(data);
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
