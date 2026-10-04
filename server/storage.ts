import { db } from "./db";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import {
  users,
  events,
  gates,
  attendees,
  tickets,
  checkins,
  metricsCounters,
  auditLogs,
  type User,
  type InsertUser,
  type Event,
  type InsertEvent,
  type Gate,
  type InsertGate,
  type Attendee,
  type InsertAttendee,
  type Ticket,
  type InsertTicket,
  type Checkin,
  type InsertCheckin,
  type AuditLog,
} from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserStatus(id: string, status: "ACTIVE" | "INACTIVE" | "SUSPENDED"): Promise<void>;

  // Events
  getEvent(id: string): Promise<Event | undefined>;
  getAllEvents(): Promise<Event[]>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEventStatus(id: string, status: "DRAFT" | "ACTIVE" | "ENDED" | "CANCELLED"): Promise<void>;

  // Gates
  getGate(id: string): Promise<Gate | undefined>;
  getAllGates(): Promise<Gate[]>;
  getGatesByEvent(eventId: string): Promise<Gate[]>;
  createGate(gate: InsertGate): Promise<Gate>;
  updateGateStatus(id: string, isActive: boolean): Promise<void>;

  // Attendees
  getAttendee(id: string): Promise<Attendee | undefined>;
  getAttendeesByEvent(eventId: string): Promise<Attendee[]>;
  getAttendeeByEmailAndEvent(email: string, eventId: string): Promise<Attendee | undefined>;
  createAttendee(attendee: InsertAttendee): Promise<Attendee>;

  // Tickets
  getTicket(id: string): Promise<Ticket | undefined>;
  getTicketByAttendee(attendeeId: string): Promise<Ticket | undefined>;
  getTicketByJti(jti: string): Promise<Ticket | undefined>;
  createTicket(ticket: InsertTicket): Promise<Ticket>;
  revokeTicket(id: string): Promise<void>;

  // Check-ins
  createCheckin(checkin: InsertCheckin): Promise<Checkin>;
  getCheckinsByEvent(eventId: string, limit?: number): Promise<Checkin[]>;
  getCheckinsByGate(gateId: string): Promise<Checkin[]>;
  getCheckinCount(eventId: string, gateId?: string): Promise<number>;

  // Metrics
  getEventMetrics(eventId: string): Promise<any>;
  getGateMetrics(eventId: string): Promise<any[]>;

  // Audit
  createAuditLog(log: Omit<AuditLog, "id" | "timestamp">): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async updateUserStatus(id: string, status: "ACTIVE" | "INACTIVE" | "SUSPENDED"): Promise<void> {
    await db.update(users).set({ status }).where(eq(users.id, id));
  }

  // Events
  async getEvent(id: string): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    return event;
  }

  async getActiveEvents(): Promise<Event[]> {
    return db.select().from(events).where(eq(events.status, "ACTIVE")).orderBy(events.startsAt);
  }

  async getAllEvents(): Promise<Event[]> {
    return db.select().from(events).orderBy(desc(events.createdAt));
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    const [newEvent] = await db.insert(events).values(event).returning();
    return newEvent;
  }

  async updateEventStatus(id: string, status: "DRAFT" | "ACTIVE" | "ENDED" | "CANCELLED"): Promise<void> {
    await db.update(events).set({ status }).where(eq(events.id, id));
  }

  // Gates
  async getGate(id: string): Promise<Gate | undefined> {
    const [gate] = await db.select().from(gates).where(eq(gates.id, id)).limit(1);
    return gate;
  }

  async getAllGates(): Promise<Gate[]> {
    return db.select().from(gates).orderBy(desc(gates.createdAt));
  }

  async getGatesByEvent(eventId: string): Promise<Gate[]> {
    return db.select().from(gates).where(eq(gates.eventId, eventId));
  }

  async createGate(gate: InsertGate): Promise<Gate> {
    const [newGate] = await db.insert(gates).values(gate).returning();
    return newGate;
  }

  async updateGateStatus(id: string, isActive: boolean): Promise<void> {
    await db.update(gates).set({ isActive }).where(eq(gates.id, id));
  }

  // Attendees
  async getAttendee(id: string): Promise<Attendee | undefined> {
    const [attendee] = await db.select().from(attendees).where(eq(attendees.id, id)).limit(1);
    return attendee;
  }

  async getAttendeesByEvent(eventId: string): Promise<Attendee[]> {
    return db.select().from(attendees).where(eq(attendees.eventId, eventId));
  }

  async getAttendeeByEmailAndEvent(email: string, eventId: string): Promise<Attendee | undefined> {
    const [attendee] = await db
      .select()
      .from(attendees)
      .where(and(eq(attendees.email, email), eq(attendees.eventId, eventId)))
      .limit(1);
    return attendee;
  }

  // Attendee and ticket are created atomically: no orphan attendees if ticket creation fails
  async registerAttendee(
    attendee: InsertAttendee,
    makeTicket: (attendeeId: string) => { code: string; jti: string }
  ): Promise<{ attendee: Attendee; ticket: Ticket }> {
    return db.transaction(async (tx) => {
      const [newAttendee] = await tx.insert(attendees).values(attendee).returning();
      const [newTicket] = await tx
        .insert(tickets)
        .values({ attendeeId: newAttendee.id, ...makeTicket(newAttendee.id) })
        .returning();
      return { attendee: newAttendee, ticket: newTicket };
    });
  }

  async createAttendee(attendee: InsertAttendee): Promise<Attendee> {
    const [newAttendee] = await db.insert(attendees).values(attendee).returning();
    return newAttendee;
  }

  // Tickets
  async getTicket(id: string): Promise<Ticket | undefined> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
    return ticket;
  }

  async getTicketByAttendee(attendeeId: string): Promise<Ticket | undefined> {
    const [ticket] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.attendeeId, attendeeId))
      .limit(1);
    return ticket;
  }

  async getTicketByJti(jti: string): Promise<Ticket | undefined> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.jti, jti)).limit(1);
    return ticket;
  }

  async createTicket(ticket: InsertTicket): Promise<Ticket> {
    const [newTicket] = await db.insert(tickets).values(ticket).returning();
    return newTicket;
  }

  async revokeTicket(id: string): Promise<void> {
    await db.update(tickets).set({ revokedAt: new Date() }).where(eq(tickets.id, id));
  }

  // Check-ins
  async createCheckin(checkin: InsertCheckin): Promise<Checkin> {
    const [newCheckin] = await db.insert(checkins).values(checkin).returning();
    return newCheckin;
  }

  async getCheckinsByEvent(eventId: string, limit: number = 50): Promise<Checkin[]> {
    return db
      .select()
      .from(checkins)
      .where(eq(checkins.eventId, eventId))
      .orderBy(desc(checkins.timestamp))
      .limit(limit);
  }

  async getCheckinsByGate(gateId: string): Promise<Checkin[]> {
    return db
      .select()
      .from(checkins)
      .where(eq(checkins.gateId, gateId))
      .orderBy(desc(checkins.timestamp));
  }

  async getOkCheckin(attendeeId: string, eventId: string): Promise<Checkin | undefined> {
    const [row] = await db
      .select()
      .from(checkins)
      .where(and(eq(checkins.attendeeId, attendeeId), eq(checkins.eventId, eventId), eq(checkins.result, "OK")))
      .limit(1);
    return row;
  }

  async countOkAtGate(gateId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(checkins)
      .where(and(eq(checkins.gateId, gateId), eq(checkins.result, "OK")));
    return row?.count || 0;
  }

  async getCheckinCount(eventId: string, gateId?: string): Promise<number> {
    const conditions = gateId
      ? and(eq(checkins.eventId, eventId), eq(checkins.gateId, gateId))
      : eq(checkins.eventId, eventId);

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(checkins)
      .where(conditions);

    return result?.count || 0;
  }

  // Metrics
  // Entries are counted once per attendee (result = OK); duplicates and denials are reported separately
  async getEventMetrics(eventId: string): Promise<any> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [row] = await db
      .select({
        entered: sql<number>`count(*) filter (where ${checkins.result} = 'OK')::int`,
        enteredToday: sql<number>`count(*) filter (where ${checkins.result} = 'OK' and ${checkins.timestamp} >= ${startOfDay.toISOString()}::timestamp)::int`,
        duplicates: sql<number>`count(*) filter (where ${checkins.result} = 'DUP')::int`,
        denied: sql<number>`count(*) filter (where ${checkins.result} = 'DENIED')::int`,
      })
      .from(checkins)
      .where(eq(checkins.eventId, eventId));

    return {
      totalCheckins: row?.entered || 0,
      todayCheckins: row?.enteredToday || 0,
      duplicates: row?.duplicates || 0,
      denied: row?.denied || 0,
    };
  }

  async getGateMetrics(eventId: string): Promise<any[]> {
    const [gatesList, stats] = await Promise.all([
      this.getGatesByEvent(eventId),
      db
        .select({
          gateId: checkins.gateId,
          entered: sql<number>`count(*) filter (where ${checkins.result} = 'OK')::int`,
          lastCheckin: sql<Date | null>`max(${checkins.timestamp}) filter (where ${checkins.result} = 'OK')`,
        })
        .from(checkins)
        .where(eq(checkins.eventId, eventId))
        .groupBy(checkins.gateId),
    ]);
    const byGate = new Map(stats.map((s) => [s.gateId, s]));
    return gatesList.map((gate) => ({
      ...gate,
      checkins: byGate.get(gate.id)?.entered ?? 0,
      lastCheckin: byGate.get(gate.id)?.lastCheckin ?? undefined,
    }));
  }

  // Audit
  async createAuditLog(log: Omit<AuditLog, "id" | "timestamp">): Promise<void> {
    await db.insert(auditLogs).values(log as any);
  }
}

export const storage = new DatabaseStorage();
