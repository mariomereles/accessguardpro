import { storage } from "./storage";
import { hashPassword } from "./crypto";

async function seed() {
  console.log("Seeding database...");

  // Create admin user
  const adminPassword = await hashPassword("admin123");
  const admin = await storage.createUser({
    email: "admin@event.com",
    passwordHash: adminPassword,
    role: "ADMIN",
    status: "ACTIVE",
  });
  console.log("Created admin user:", admin.email);

  // Create staff user
  const staffPassword = await hashPassword("staff123");
  const staff = await storage.createUser({
    email: "staff@event.com",
    passwordHash: staffPassword,
    role: "STAFF",
    status: "ACTIVE",
  });
  console.log("Created staff user:", staff.email);

  // Create event
  const event = await storage.createEvent({
    name: "Tech Summit 2025",
    venue: "Convention Center, Hall A",
    startsAt: new Date("2025-03-15T09:00:00"),
    endsAt: new Date("2025-03-15T18:00:00"),
    status: "ACTIVE",
  });
  console.log("Created event:", event.name);

  // Create gates
  const gates = await Promise.all([
    storage.createGate({
      eventId: event.id,
      name: "Main Entrance",
      location: "Building A - Ground Floor",
      isActive: true,
    }),
    storage.createGate({
      eventId: event.id,
      name: "VIP Gate",
      location: "Building A - 2nd Floor",
      isActive: true,
    }),
    storage.createGate({
      eventId: event.id,
      name: "East Entry",
      location: "Building B - Ground Floor",
      isActive: true,
    }),
    storage.createGate({
      eventId: event.id,
      name: "West Entry",
      location: "Building B - Ground Floor",
      isActive: false,
    }),
  ]);
  console.log("Created gates:", gates.length);

  console.log("\nSeed completed successfully!");
  console.log("\nLogin credentials:");
  console.log("Admin: admin@event.com / admin123");
  console.log("Staff: staff@event.com / staff123");
  console.log("\nEvent ID:", event.id);

  process.exit(0);
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
