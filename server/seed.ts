import "dotenv/config";
import crypto from "crypto";
import { storage } from "./storage";
import { hashPassword } from "./crypto";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

// Idempotent and non-destructive: safe to run more than once, never deletes existing data.
// Passwords come from SEED_ADMIN_PASSWORD / SEED_STAFF_PASSWORD; if unset, a random one is
// generated and printed once (there are no well-known default credentials).
async function ensureUser(email: string, role: "ADMIN" | "STAFF", envVar: string, orgId: string | null) {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    console.log(`User exists, left untouched: ${email}`);
    return null;
  }
  const password = process.env[envVar] || crypto.randomBytes(12).toString("base64url");
  const generated = !process.env[envVar];
  await storage.createUser({ email, passwordHash: await hashPassword(password), role, status: "ACTIVE", orgId } as any);
  console.log(`Created ${role}: ${email}${generated ? `  password: ${password}   (shown once, change it after first login)` : ""}`);
  return password;
}

async function seed() {
  console.log("Seeding database...");

  // The seed admin is a platform administrator (no organization); staff and events belong to "Default"
  const orgs = await storage.listOrganizations();
  const org = orgs.find((o) => o.name === "Default") ?? orgs[0] ?? (await storage.createOrganization("Default"));

  await ensureUser(process.env.SEED_ADMIN_EMAIL || "admin@event.com", "ADMIN", "SEED_ADMIN_PASSWORD", null);
  await ensureUser(process.env.SEED_STAFF_EMAIL || "staff@event.com", "STAFF", "SEED_STAFF_PASSWORD", org.id);

  const existingEvents = await storage.getAllEvents();
  if (existingEvents.length > 0) {
    console.log(`Events already present (${existingEvents.length}); skipping sample event and gates.`);
    process.exit(0);
  }

  const starts = new Date();
  starts.setDate(starts.getDate() + 14);
  starts.setHours(9, 0, 0, 0);
  const ends = new Date(starts);
  ends.setHours(18, 0, 0, 0);

  const event = await storage.createEvent({
    name: "Tech Summit",
    venue: "Convention Center, Hall A",
    startsAt: starts,
    endsAt: ends,
    status: "ACTIVE",
    orgId: org.id,
  } as any);
  console.log("Created event:", event.name, event.id);

  for (const g of [
    { name: "Main Entrance", location: "Building A - Ground Floor", isActive: true },
    { name: "VIP Gate", location: "Building A - 2nd Floor", isActive: true },
    { name: "East Entry", location: "Building B - Ground Floor", isActive: true },
    { name: "West Entry", location: "Building B - Ground Floor", isActive: false },
  ]) {
    await storage.createGate({ eventId: event.id, ...g });
  }
  console.log("Created 4 gates");
  console.log("\nSeed completed.");
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
