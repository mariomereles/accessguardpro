import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { TicketCard } from "@/components/TicketCard";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { dynamicTicketCode, secondsLeftInWindow, windowCounter, QR_WINDOW_SECONDS } from "@/lib/ticketCode";

export default function MyTicket() {
  const [location] = useLocation();
  const [ticketData, setTicketData] = useState<any>(null);
  const [secondsLeft, setSecondsLeft] = useState(secondsLeftInWindow());

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

  // The QR changes every 30 s: a screenshot or forwarded image stops working within a minute or two.
  useEffect(() => {
    const stored = localStorage.getItem("lastTicket");
    const ticket = stored ? JSON.parse(stored).ticket : null;
    if (!ticket?.secret || !ticket?.jti) return;
    let lastCounter = -1;
    const tick = async () => {
      setSecondsLeft(secondsLeftInWindow());
      const counter = windowCounter();
      if (counter === lastCounter) return;
      lastCounter = counter;
      try {
        const code = await dynamicTicketCode(ticket.secret, ticket.jti);
        setTicketData((prev: any) => (prev ? { ...prev, ticketCode: code } : prev));
      } catch (e) {
        console.error("Could not generate the rotating code", e);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [location, !!ticketData]);

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
        <p className="text-center text-sm text-muted-foreground mt-4" data-testid="text-qr-refresh">
          Live code: renews in {secondsLeft}s (every {QR_WINDOW_SECONDS}s). Show this screen at the gate; screenshots stop working.
        </p>
      </div>
    </div>
  );
}
