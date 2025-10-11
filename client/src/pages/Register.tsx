import { useState } from "react";
import { useLocation } from "wouter";
import { RegistrationForm } from "@/components/RegistrationForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// Default event ID from seed
const DEFAULT_EVENT_ID = "cf0bd3b2-7f74-4c85-a0f5-f80940cadc39";

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const result = await api.registerForEvent(DEFAULT_EVENT_ID, {
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        docType: data.docType,
        docNumber: data.docNumber,
        ticketType: data.ticketType.toUpperCase(),
        eventId: DEFAULT_EVENT_ID,
      });

      toast({
        title: "Registration Successful!",
        description: "Your ticket has been generated. Check your email for details.",
      });

      // Store ticket data for the ticket page
      localStorage.setItem("lastTicket", JSON.stringify(result));
      
      setLocation(`/me/ticket?eventId=${DEFAULT_EVENT_ID}`);
    } catch (error: any) {
      toast({
        title: "Registration Failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background py-12 px-6">
      <div className="max-w-7xl mx-auto">
        <Button variant="ghost" asChild className="mb-8" data-testid="button-back-home">
          <Link href="/">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Link>
        </Button>

        <RegistrationForm
          eventName="Tech Summit 2025 - March 15, 2025"
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
