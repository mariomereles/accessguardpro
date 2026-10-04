import { db } from "./db";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { auditHash } from "./crypto";
import {
  users,
  events,
  gates,
  attendees,
  tickets,
  checkins,
  metricsCounters,
  auditLogs,
  organizations,
  refreshTokens,
  type Organization,
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
    makeTicket: (attendeeId: string) => { code: string; jti: string; secret?: string }
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

  async countCheckinsSince(attendeeId: string, eventId: string, result: "OK" | "DUP" | "DENIED", since: Date): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(checkins)
      .where(and(eq(checkins.attendeeId, attendeeId), eq(checkins.eventId, eventId), eq(checkins.result, result), gte(checkins.timestamp, since)));
    return row?.count || 0;
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

  // Entries (result = OK) per gate in 15-minute buckets, newest 6 hours
  async getEntriesTimeSeries(eventId: string): Promise<Array<{ bucket: string; gateId: string; count: number }>> {
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const rows = await db.execute(sql`
      select to_char(to_timestamp(floor(extract(epoch from ${checkins.timestamp}) / 900) * 900) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as bucket,
             ${checkins.gateId} as gate_id, count(*)::int as count
      from ${checkins}
      where ${checkins.eventId} = ${eventId} and ${checkins.result} = 'OK' and ${checkins.timestamp} >= ${since}::timestamp
      group by 1, 2 order by 1`);
    return (rows as any[]).map((r) => ({ bucket: r.bucket, gateId: r.gate_id, count: r.count }));
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
  // Append-only, hash-chained: each row's hash covers the previous row's hash, so editing or
  // deleting any past row breaks verification from that point on. Writes are serialised with an
  // advisory lock so the chain has a single, well-defined order.
  async createAuditLog(log: Omit<AuditLog, "id" | "timestamp" | "seq" | "prevHash" | "hash">): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(727401)`);
      const [last] = await tx
        .select({ hash: auditLogs.hash })
        .from(auditLogs)
        .where(sql`${auditLogs.hash} is not null`)
        .orderBy(desc(auditLogs.seq))
        .limit(1);
      const prevHash = last?.hash ?? null;
      const timestamp = new Date();
      const hash = auditHash(prevHash, [
        log.actorUserId ?? null, log.action, log.entity, log.entityId ?? null, timestamp.toISOString(), log.metadata ?? null,
      ]);
      await tx.insert(auditLogs).values({ ...(log as any), timestamp, prevHash, hash });
    });
  }

  async verifyAuditChain(): Promise<{ valid: boolean; checked: number; brokenAtSeq?: number }> {
    const rows = await db
      .select()
      .from(auditLogs)
      .where(sql`${auditLogs.hash} is not null`)
      .orderBy(auditLogs.seq);
    // The first hashed row is the genesis of the chain (prevHash null); every later row must
    // chain from the hash of the one before it.
    let prev: string | null = null;
    let checked = 0;
    for (const r of rows) {
      const expected = auditHash(prev, [
        r.actorUserId ?? null, r.action, r.entity, r.entityId ?? null, r.timestamp.toISOString(), r.metadata ?? null,
      ]);
      if (r.hash !== expected || (r.prevHash ?? null) !== prev) {
        return { valid: false, checked, brokenAtSeq: r.seq ?? undefined };
      }
      prev = r.hash;
      checked++;
    }
    return { valid: true, checked };
  }

  async getRecentAuditLogs(action: string, eventId: string, limit = 50): Promise<AuditLog[]> {
    return db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, action), sql`((${auditLogs.metadata})::jsonb ->> 'eventId' = ${eventId} or (${auditLogs.metadata})::jsonb ->> 'eventId' is null)`))
      .orderBy(desc(auditLogs.seq))
      .limit(limit);
  }

  async countAuditLogsSince(action: string, since: Date, filter?: { actorUserId?: string; entityId?: string }): Promise<number> {
    const conds = [eq(auditLogs.action, action), gte(auditLogs.timestamp, since)];
    if (filter?.actorUserId) conds.push(eq(auditLogs.actorUserId, filter.actorUserId));
    if (filter?.entityId) conds.push(eq(auditLogs.entityId, filter.entityId));
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogs).where(and(...conds));
    return row?.count || 0;
  }

  // Refresh tokens (rotation + reuse detection)
  async createRefreshToken(row: { id: string; userId: string; familyId: string; expiresAt: Date }): Promise<void> {
    await db.insert(refreshTokens).values(row);
  }

  async getRefreshToken(id: string) {
    const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.id, id)).limit(1);
    return row;
  }

  // Marks a token as used. Returns false if another request already rotated it.
  async consumeRefreshToken(id: string): Promise<boolean> {
    const rows = await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, id), sql`${refreshTokens.revokedAt} is null`))
      .returning({ id: refreshTokens.id });
    return rows.length === 1;
  }

  async revokeRefreshFamily(familyId: string): Promise<void> {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), sql`${refreshTokens.revokedAt} is null`));
  }

  async revokeAllRefreshTokensForUser(userId: string): Promise<void> {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), sql`${refreshTokens.revokedAt} is null`));
  }

  async deleteExpiredRefreshTokens(): Promise<void> {
    await db.delete(refreshTokens).where(sql`${refreshTokens.expiresAt} < now() - interval '1 day'`);
  }

  // Organizations and tenant scoping
  async createOrganization(name: string): Promise<Organization> {
    const [org] = await db.insert(organizations).values({ name }).returning();
    return org;
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    return org;
  }

  async listOrganizations(): Promise<Organization[]> {
    return db.select().from(organizations).orderBy(organizations.name);
  }

  async getEventsByOrg(orgId: string): Promise<Event[]> {
    return db.select().from(events).where(eq(events.orgId, orgId)).orderBy(desc(events.startsAt));
  }

  async getActiveEventsByOrg(orgId: string): Promise<Event[]> {
    return db.select().from(events).where(and(eq(events.orgId, orgId), eq(events.status, "ACTIVE"))).orderBy(events.startsAt);
  }

  async getGatesByOrg(orgId: string): Promise<Gate[]> {
    const rows = await db
      .select({ gate: gates })
      .from(gates)
      .innerJoin(events, eq(gates.eventId, events.id))
      .where(eq(events.orgId, orgId));
    return rows.map((r) => r.gate);
  }

  async listUsers(orgId?: string): Promise<Array<Pick<User, "id" | "email" | "role" | "status" | "orgId" | "createdAt">>> {
    const q = db
      .select({ id: users.id, email: users.email, role: users.role, status: users.status, orgId: users.orgId, createdAt: users.createdAt })
      .from(users);
    return orgId ? q.where(eq(users.orgId, orgId)).orderBy(users.email) : q.orderBy(users.email);
  }

  // Data retention: replace personal data of an attendee with irreversible placeholders
  async anonymizeEventAttendees(eventId: string): Promise<number> {
    const rows = await db.execute(sql`
      update attendees set
        full_name = 'Anonymized',
        email = 'anon-' || substr(md5(id), 1, 12) || '@anonymized.invalid',
        phone = 'anonymized',
        doc_type = 'ANON',
        doc_number = 'anon-' || substr(md5(id || 'doc'), 1, 12)
      where event_id = ${eventId} and email not like '%@anonymized.invalid'
      returning id`);
    return (rows as any[]).length;
  }

  // Tickets
  async revokeTicketsByAttendee(attendeeId: string): Promise<number> {
    const rows = await db
      .update(tickets)
      .set({ revokedAt: new Date() })
      .where(and(eq(tickets.attendeeId, attendeeId), sql`${tickets.revokedAt} is null`))
      .returning({ id: tickets.id });
    return rows.length;
  }

  // Identity de-duplication: same document, or the same mailbox through "+tag" aliases
  async findDuplicateIdentity(eventId: string, docType: string, docNumber: string, email: string): Promise<Attendee | undefined> {
    const canonical = email.toLowerCase().replace(/\+[^@]*@/, "@");
    const [row] = await db
      .select()
      .from(attendees)
      .where(and(
        eq(attendees.eventId, eventId),
        sql`(
          (upper(regexp_replace(${attendees.docNumber}, '[^A-Za-z0-9]', '', 'g')) = ${docNumber}
             and upper(${attendees.docType}) = ${docType.toUpperCase()})
          or regexp_replace(lower(${attendees.email}), '\\+[^@]*@', '@') = ${canonical}
        )`
      ))
      .limit(1);
    return row;
  }

}

export const storage = new DatabaseStorage();
