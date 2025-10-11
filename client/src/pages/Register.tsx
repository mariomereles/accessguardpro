import { useState } from "react";
import { useLocation } from "wouter";
import { RegistrationForm } from "@/components/RegistrationForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function Register() {
  const [, setLocation] = useLocation();

  const handleSubmit = (data: any) => {
    console.log("Registration data:", data);
    // TODO: Remove mock functionality - submit to backend
    setLocation("/me/ticket");
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
