import { GateStatusCard } from "../GateStatusCard";

export default function GateStatusCardExample() {
  return (
    <div className="p-8 bg-background grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <GateStatusCard
        name="Main Entrance"
        location="Building A - Ground Floor"
        isActive={true}
        checkins={342}
        lastCheckin="2 min ago"
        onToggle={() => console.log("Toggle gate")}
        onViewQR={() => console.log("View QR")}
      />
      <GateStatusCard
        name="VIP Gate"
        location="Building A - 2nd Floor"
        isActive={true}
        checkins={87}
        lastCheckin="5 min ago"
        onToggle={() => console.log("Toggle gate")}
        onViewQR={() => console.log("View QR")}
      />
      <GateStatusCard
        name="East Entry"
        location="Building B - Ground Floor"
        isActive={false}
        checkins={0}
        onToggle={() => console.log("Toggle gate")}
        onViewQR={() => console.log("View QR")}
      />
    </div>
  );
}
