import { TicketCard } from "../TicketCard";

export default function TicketCardExample() {
  return (
    <div className="p-8 bg-background min-h-screen flex items-center justify-center">
      <TicketCard
        attendeeName="Sarah Johnson"
        eventName="Tech Summit 2025"
        ticketType="VIP Access"
        ticketCode="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9"
        venue="Convention Center, Hall A"
        date="March 15, 2025 • 9:00 AM"
        onDownload={() => console.log("Download PDF")}
        onShare={() => console.log("Share ticket")}
      />
    </div>
  );
}
