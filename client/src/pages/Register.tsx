import { useState } from "react";
import { useLocation } from "wouter";
import { RegistrationForm } from "@/components/RegistrationForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

import { useActiveEvent } from "@/hooks/useActiveEvent";

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { event } = useActiveEvent();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: any) => {
    if (!event) {
      toast({ title: "Registration unavailable", description: "There is no open event right now.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await api.registerForEvent(event.id, {
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        docType: data.docType,
        docNumber: data.docNumber,
      });

      toast({
        title: "Registration Successful!",
        description: "Your ticket has been generated. Keep this ticket to enter the event.",
      });

      // Store ticket data for the ticket page
      localStorage.setItem("lastTicket", JSON.stringify({ ...result, event }));
      
      setLocation(`/me/ticket?eventId=${event.id}`);
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
