import { useState } from "react";
import { CheckinSuccessModal } from "../CheckinSuccessModal";
import { Button } from "@/components/ui/button";

export default function CheckinSuccessModalExample() {
  const [show, setShow] = useState(false);

  return (
    <div className="p-8 bg-background min-h-screen flex items-center justify-center">
      <Button onClick={() => setShow(true)} data-testid="button-show-success">
        Show Success Modal
      </Button>

      {show && (
        <CheckinSuccessModal
          attendeeName="Sarah Johnson"
          gate="Main Entrance"
          timestamp="14:32:45"
          onClose={() => setShow(false)}
        />
      )}
    </div>
  );
}
