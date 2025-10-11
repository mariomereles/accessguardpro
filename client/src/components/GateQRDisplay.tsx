import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, RefreshCw, Clock, DoorOpen } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface GateQRDisplayProps {
  gateId: string;
  gateName: string;
  gateLocation: string;
}

export function GateQRDisplay({ gateId, gateName, gateLocation }: GateQRDisplayProps) {
  const [timeLeft, setTimeLeft] = useState(60);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/gates", gateId, "qr"],
    queryFn: () => api.getGateQR(gateId),
    refetchInterval: 55000, // Refetch every 55 seconds (before 60s expiry)
  });

  useEffect(() => {
    if (!data?.expiresAt) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((data.expiresAt - now) / 1000));
      setTimeLeft(remaining);

      if (remaining === 0) {
        refetch();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [data?.expiresAt, refetch]);

  if (isLoading) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto shadow-xl">
      <CardHeader className="space-y-1 pb-4 bg-gradient-to-r from-primary/10 to-secondary/10">
        <div className="flex items-center gap-2">
          <DoorOpen className="w-5 h-5 text-primary" />
          <CardTitle className="text-2xl">{gateName}</CardTitle>
        </div>
        <CardDescription className="text-base">{gateLocation}</CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        {/* QR Code */}
        <div className="flex justify-center p-8 bg-white rounded-xl shadow-inner">
          {data?.qrCode ? (
            <QRCodeSVG
              value={data.qrCode}
              size={280}
              level="M"
              includeMargin={true}
              className="animate-in fade-in zoom-in duration-300"
            />
          ) : (
            <div className="w-[280px] h-[280px] flex items-center justify-center bg-gray-100 rounded">
              <p className="text-muted-foreground">No QR disponible</p>
            </div>
          )}
        </div>

        {/* Timer */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Tiempo restante</span>
            </div>
            <span className={`font-mono text-lg font-bold ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-primary'}`}>
              {timeLeft}s
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ease-linear ${
                timeLeft <= 10 ? 'bg-red-500' : 'bg-primary'
              }`}
              style={{ width: `${(timeLeft / 60) * 100}%` }}
            />
          </div>
        </div>

        {/* Manual refresh button */}
        <Button
          onClick={() => refetch()}
          variant="outline"
          className="w-full"
          size="lg"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Generar Nuevo QR
        </Button>

        {/* Instructions */}
        <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-900 dark:text-blue-100 font-medium mb-2">
            📱 Instrucciones:
          </p>
          <ol className="text-xs text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
            <li>Muestra este QR en la puerta del evento</li>
            <li>Los asistentes escanean este QR con su app móvil</li>
            <li>Check-in automático al escanear</li>
            <li>El QR se renueva cada 60 segundos por seguridad</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
