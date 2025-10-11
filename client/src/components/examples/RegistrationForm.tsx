import { RegistrationForm } from "../RegistrationForm";

export default function RegistrationFormExample() {
  return (
    <div className="p-8 bg-background min-h-screen">
      <RegistrationForm
        eventName="Tech Summit 2025"
        onSubmit={(data) => {
          console.log("Registration submitted:", data);
        }}
      />
    </div>
  );
}
