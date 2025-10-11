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
  async getEventMetrics(eventId: string): Promise<any> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalCheckins] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(checkins)
      .where(eq(checkins.eventId, eventId));

    const [todayCheckins] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(checkins)
      .where(and(eq(checkins.eventId, eventId), gte(checkins.timestamp, today)));

    const [duplicates] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(checkins)
      .where(and(eq(checkins.eventId, eventId), eq(checkins.result, "DUP")));

    const [denied] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(checkins)
      .where(and(eq(checkins.eventId, eventId), eq(checkins.result, "DENIED")));

    return {
      totalCheckins: totalCheckins?.count || 0,
      todayCheckins: todayCheckins?.count || 0,
      duplicates: duplicates?.count || 0,
      denied: denied?.count || 0,
    };
  }

  async getGateMetrics(eventId: string): Promise<any[]> {
    const gatesList = await this.getGatesByEvent(eventId);
    
    const metrics = await Promise.all(
      gatesList.map(async (gate) => {
        const count = await this.getCheckinCount(eventId, gate.id);
        const recentCheckins = await db
          .select()
          .from(checkins)
          .where(and(eq(checkins.gateId, gate.id), eq(checkins.result, "OK")))
          .orderBy(desc(checkins.timestamp))
          .limit(1);

        return {
          ...gate,
          checkins: count,
          lastCheckin: recentCheckins[0]?.timestamp,
        };
      })
    );

    return metrics;
  }

  // Audit
  async createAuditLog(log: Omit<AuditLog, "id" | "timestamp">): Promise<void> {
    await db.insert(auditLogs).values(log as any);
  }
}

export const storage = new DatabaseStorage();
