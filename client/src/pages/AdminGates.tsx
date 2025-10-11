import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, DoorOpen, Search, Plus, Activity, Users, Clock, AlertCircle, QrCode } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GateQRDisplay } from "@/components/GateQRDisplay";

export default function AdminGates() {
  const { data: gates, isLoading, error } = useQuery({
    queryKey: ["/api/gates"],
    queryFn: () => api.getGates(),
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [selectedGateForQR, setSelectedGateForQR] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState({ name: "", location: "", capacityType: "unlimited", capacity: "" });

  const createGate = useMutation({
    mutationFn: (data: any) => api.createGate(data),
    onSuccess: () => {
      toast({
        title: "✅ Puerta creada exitosamente",
        description: "La nueva puerta está lista para recibir check-ins."
      });
      setOpen(false);
      setForm({ name: "", location: "", capacityType: "unlimited", capacity: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/gates"] });
    },
    onError: (e: any) => toast({
      title: "❌ Error al crear puerta",
      description: e.message,
      variant: "destructive"
    }),
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, isActive }: any) => api.toggleGateStatus(id, isActive),
    onSuccess: (_, { isActive }) => {
      toast({
        title: isActive ? "🔓 Puerta activada" : "🔒 Puerta desactivada",
        description: `La puerta ${isActive ? 'ahora acepta' : 'ya no acepta'} check-ins.`
      });
      queryClient.invalidateQueries({ queryKey: ["/api/gates"] });
    },
    onError: (e: any) => toast({
      title: "❌ Error al cambiar estado",
      description: e.message,
      variant: "destructive"
    }),
  });

  const filteredGates = gates?.filter((gate: any) =>
    gate.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    gate.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: gates?.length || 0,
    active: gates?.filter((g: any) => g.isActive).length || 0,
    totalCheckins: gates?.reduce((sum: number, g: any) => sum + (g.checkinCount || 0), 0) || 0
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
          <p className="text-lg font-medium">Cargando puertas...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="max-w-2xl mx-auto">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Error al cargar las puertas: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header con estadísticas */}
      <div className="bg-gradient-to-r from-primary/5 to-secondary/5 border border-border rounded-lg p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Gestión de Puertas
            </h1>
            <p className="text-muted-foreground text-lg mt-2">
              Administra las puertas de acceso y monitorea su actividad
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="shadow-lg hover:shadow-xl transition-shadow">
                <Plus className="w-5 h-5 mr-2" />
                Nueva Puerta
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogTitle className="text-xl font-semibold">Crear Nueva Puerta</DialogTitle>
              <DialogDescription>
                Agrega una nueva puerta de acceso al evento
              </DialogDescription>
              <form
                onSubmit={e => {
                  e.preventDefault();
                  createGate.mutate(form);
                }}
                className="space-y-6 mt-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">Nombre de la Puerta</Label>
                  <Input
                    id="name"
                    placeholder="Ej: Entrada Principal"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    required
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location" className="text-sm font-medium">Ubicación</Label>
                  <Input
                    id="location"
                    placeholder="Ej: Calle Principal, Edificio A"
                    value={form.location}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                    required
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="capacityType" className="text-sm font-medium">Tipo de Capacidad</Label>
                  <Select
                    value={form.capacityType}
                    onValueChange={value => setForm(f => ({ ...f, capacityType: value }))}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Selecciona el tipo de capacidad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="limited">Capacidad Limitada</SelectItem>
                      <SelectItem value="unlimited">Ilimitada</SelectItem>
                      <SelectItem value="unmeasured">Sin Medir</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.capacityType === "limited" && (
                  <div className="space-y-2">
                    <Label htmlFor="capacity" className="text-sm font-medium">Capacidad Máxima</Label>
                    <Input
                      id="capacity"
                      type="number"
                      placeholder="Ej: 500"
                      value={form.capacity}
                      onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
                      min="1"
                      required
                      className="h-11"
                    />
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={createGate.isPending}
                  className="w-full h-11 text-base font-medium"
                >
                  {createGate.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    <>
                      <DoorOpen className="w-4 h-4 mr-2" />
                      Crear Puerta
                    </>
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Estadísticas rápidas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border border-border shadow-sm bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <DoorOpen className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                  <p className="text-sm text-muted-foreground">Total Puertas</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border shadow-sm bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <Activity className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.active}</p>
                  <p className="text-sm text-muted-foreground">Puertas Activas</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border shadow-sm bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Users className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.totalCheckins}</p>
                  <p className="text-sm text-muted-foreground">Total Check-ins</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Barra de búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
        <Input
          placeholder="Buscar puertas por nombre o ubicación..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-10 h-12 text-base"
        />
      </div>

      {/* Grid de puertas */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredGates?.map((gate: any) => (
          <Card key={gate.id} className="hover:shadow-lg transition-all duration-200 border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg ${gate.isActive ? 'bg-green-100' : 'bg-gray-100'}`}>
                    <DoorOpen className={`w-6 h-6 ${gate.isActive ? 'text-green-600' : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{gate.name}</CardTitle>
                    <CardDescription className="text-sm">{gate.location}</CardDescription>
                  </div>
                </div>
                <Badge
                  variant={gate.isActive ? "default" : "secondary"}
                  className={`px-3 py-1 ${gate.isActive ? 'bg-green-100 text-green-800 hover:bg-green-200' : ''}`}
                >
                  {gate.isActive ? "Activa" : "Inactiva"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-blue-400" />
                    <span className="text-muted-foreground">Check-ins</span>
                  </div>
                  <p className="text-xl font-bold text-blue-400 mt-1">{gate.checkinCount || 0}</p>
                </div>
                <div className="bg-orange-500/10 border border-orange-500/20 p-3 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-orange-400" />
                    <span className="text-muted-foreground">Capacidad</span>
                  </div>
                  <p className="text-xl font-bold text-orange-400 mt-1">
                    {gate.capacityType === "limited" ? gate.capacity : 
                     gate.capacityType === "unlimited" ? "∞" : "N/A"}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={gate.isActive}
                    onCheckedChange={(checked: boolean) => toggleStatus.mutate({ id: gate.id, isActive: checked })}
                    disabled={toggleStatus.isPending}
                  />
                  <span className="text-sm font-medium">
                    {gate.isActive ? "Activa" : "Inactiva"}
                  </span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={() => {
                    setSelectedGateForQR(gate);
                    setQrDialogOpen(true);
                  }}
                >
                  <QrCode className="w-4 h-4 mr-1" />
                  Ver QR
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredGates?.length === 0 && (
        <div className="text-center py-12">
          <DoorOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No se encontraron puertas</h3>
          <p className="text-muted-foreground">
            {searchTerm ? "Intenta con otros términos de búsqueda" : "Crea tu primera puerta para comenzar"}
          </p>
        </div>
      )}

      {/* QR Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle className="sr-only">Gate QR Code</DialogTitle>
          {selectedGateForQR && (
            <GateQRDisplay
              gateId={selectedGateForQR.id}
              gateName={selectedGateForQR.name}
              gateLocation={selectedGateForQR.location}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
