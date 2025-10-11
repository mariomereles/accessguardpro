import { TicketCard } from "@/components/TicketCard";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function MyTicket() {
  // TODO: Remove mock functionality - fetch from backend
  const ticketData = {
    attendeeName: "Sarah Johnson",
    eventName: "Tech Summit 2025",
    ticketType: "VIP Access",
    ticketCode: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJldmVudC1zeXN0ZW0iLCJzdWIiOiIxMjM0NTY3ODkwIiwiZXZ0IjoiZXZ0LTEyMyIsInRrdCI6InRrdC00NTYiLCJ0eXAiOiJ0aWNrZXQifQ",
    venue: "Convention Center, Hall A",
    date: "March 15, 2025 • 9:00 AM",
  };

  const handleDownload = () => {
    console.log("Download PDF");
    // TODO: Remove mock functionality - generate PDF
  };

  const handleShare = () => {
    console.log("Share ticket");
    // TODO: Remove mock functionality - implement share
  };

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
