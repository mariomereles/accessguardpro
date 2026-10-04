import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["ADMIN", "ORGANIZER", "STAFF", "USER"]);
export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "INACTIVE", "SUSPENDED"]);
export const ticketTypeEnum = pgEnum("ticket_type", ["GENERAL", "VIP", "STAFF"]);
export const eventStatusEnum = pgEnum("event_status", ["DRAFT", "ACTIVE", "ENDED", "CANCELLED"]);
export const checkinMethodEnum = pgEnum("checkin_method", ["GATE_QR", "TICKET_QR"]);
export const checkinResultEnum = pgEnum("checkin_result", ["OK", "DUP", "DENIED"]);
export const gateCapacityTypeEnum = pgEnum("gate_capacity_type", ["limited", "unlimited", "unmeasured"]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("USER"),
  status: userStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Events table
export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  venue: text("venue").notNull(),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  status: eventStatusEnum("status").notNull().default("DRAFT"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Gates table
export const gates = pgTable("gates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id),
  name: text("name").notNull(),
  location: text("location").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  capacityType: gateCapacityTypeEnum("capacity_type").notNull().default("unlimited"),
  capacity: integer("capacity"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("gates_event_idx").on(t.eventId)]);

// Attendees table
export const attendees = pgTable("attendees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id),
  userId: varchar("user_id").references(() => users.id),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  docType: text("doc_type").notNull(),
  docNumber: text("doc_number").notNull(),
  ticketType: ticketTypeEnum("ticket_type").notNull().default("GENERAL"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  // One registration per email per event (emails are stored lowercase)
  uniqueIndex("attendees_event_email_unique").on(t.eventId, t.email),
  index("attendees_user_idx").on(t.userId),
]);

// Tickets table
export const tickets = pgTable("tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  attendeeId: varchar("attendee_id").notNull().references(() => attendees.id),
  code: text("code").notNull().unique(),
  jti: text("jti").notNull().unique(),
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  revokedAt: timestamp("revoked_at"),
}, (t) => [index("tickets_attendee_idx").on(t.attendeeId)]);

// Check-ins table
export const checkins = pgTable("checkins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id),
  attendeeId: varchar("attendee_id").notNull().references(() => attendees.id),
  gateId: varchar("gate_id").notNull().references(() => gates.id),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  method: checkinMethodEnum("method").notNull(),
  result: checkinResultEnum("result").notNull(),
  deviceId: text("device_id"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (t) => [
  // One successful entry per attendee per event, enforced atomically by the database
  uniqueIndex("checkins_one_ok_per_attendee").on(t.attendeeId, t.eventId).where(sql`${t.result} = 'OK'`),
  index("checkins_event_timestamp_idx").on(t.eventId, t.timestamp),
  index("checkins_gate_idx").on(t.gateId),
]);

// Metrics counters table
export const metricsCounters = pgTable("metrics_counters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id),
  gateId: varchar("gate_id").references(() => gates.id),
  timeBucket: timestamp("time_bucket").notNull(),
  entered: integer("entered").notNull().default(0),
  denied: integer("denied").notNull().default(0),
  duplicates: integer("duplicates").notNull().default(0),
});

// Audit logs table
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actorUserId: varchar("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  metadata: text("metadata"),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true });
export const insertGateSchema = createInsertSchema(gates).omit({ id: true, createdAt: true });
export const insertAttendeeSchema = createInsertSchema(attendees).omit({ id: true, createdAt: true, userId: true });
export const insertTicketSchema = createInsertSchema(tickets).omit({ id: true, issuedAt: true, revokedAt: true });
export const insertCheckinSchema = createInsertSchema(checkins).omit({ id: true, timestamp: true });

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;

export type Gate = typeof gates.$inferSelect;
export type InsertGate = z.infer<typeof insertGateSchema>;

export type Attendee = typeof attendees.$inferSelect;
export type InsertAttendee = z.infer<typeof insertAttendeeSchema>;

export type Ticket = typeof tickets.$inferSelect;
export type InsertTicket = z.infer<typeof insertTicketSchema>;

export type Checkin = typeof checkins.$inferSelect;
export type InsertCheckin = z.infer<typeof insertCheckinSchema>;

export type MetricsCounter = typeof metricsCounters.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
