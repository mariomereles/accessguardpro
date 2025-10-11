import { ChartContainer } from "../ChartContainer";

export default function ChartContainerExample() {
  const mockData = [
    { time: "14:00", mainEntrance: 24, vipGate: 8, eastEntry: 12 },
    { time: "14:15", mainEntrance: 32, vipGate: 12, eastEntry: 15 },
    { time: "14:30", mainEntrance: 45, vipGate: 18, eastEntry: 22 },
    { time: "14:45", mainEntrance: 38, vipGate: 15, eastEntry: 18 },
    { time: "15:00", mainEntrance: 42, vipGate: 20, eastEntry: 25 },
  ];

  const lines = [
    { dataKey: "mainEntrance", name: "Main Entrance", color: "hsl(var(--chart-1))" },
    { dataKey: "vipGate", name: "VIP Gate", color: "hsl(var(--chart-2))" },
    { dataKey: "eastEntry", name: "East Entry", color: "hsl(var(--chart-3))" },
  ];

  return (
    <div className="p-8 bg-background">
      <ChartContainer
        title="Check-ins Over Time"
        data={mockData}
        lines={lines}
      />
    </div>
  );
}
