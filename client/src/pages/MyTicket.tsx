import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { TicketCard } from "@/components/TicketCard";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function MyTicket() {
  const [location] = useLocation();
  const [ticketData, setTicketData] = useState<any>(null);

  useEffect(() => {
    // Get ticket from localStorage (set during registration)
    const stored = localStorage.getItem("lastTicket");
    if (stored) {
      const data = JSON.parse(stored);
      setTicketData({
        attendeeName: data.attendee.fullName,
        eventName: data.event?.name ?? "Event",
        ticketType: data.attendee.ticketType,
        ticketCode: data.ticket.qrCode,
        venue: data.event?.venue ?? "",
        date: data.event?.startsAt ? new Date(data.event.startsAt).toLocaleString() : "",
      });
    }
  }, [location]);

  const handleDownload = () => {
    console.log("Download PDF");
    alert("PDF download functionality would be implemented here");
  };

  const handleShare = () => {
    console.log("Share ticket");
    if (navigator.share) {
      navigator.share({
        title: "Event Ticket",
        text: "Check out my event ticket!",
      });
    }
  };

  if (!ticketData) {
    return (
      <div className="min-h-screen bg-background py-12 px-6 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">No Ticket Found</h2>
          <p className="text-muted-foreground mb-6">Please register for an event first.</p>
          <Button asChild>
            <Link href="/register">Register Now</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-12 px-6">
      <div className="max-w-7xl mx-auto">
        <Button variant="ghost" asChild className="mb-8" data-testid="button-back">
          <Link href="/">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>

        <TicketCard
          {...ticketData}
          onDownload={handleDownload}
          onShare={handleShare}
        />
      </div>
    </div>
  );
}
