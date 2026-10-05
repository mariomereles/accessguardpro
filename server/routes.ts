import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { z } from "zod";
import { nanoid } from "nanoid";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { redis } from "./redis";
import {
  generateTicketQR,
  generateGateQR,
  verifyTicketQR,
  verifyGateQR,
  generateAuthToken,
  generateRefreshToken,
  verifyAuthToken,
  verifyRefreshToken,
  REFRESH_TTL_SECONDS,
  generateTicketSecret,
  generateDynamicTicketCode,
  isDynamicTicketCode,
  parseDynamicTicketCode,
  verifyDynamicTicketMac,
  hashPassword,
  verifyPassword,
  generateQRCodeDataURL,
} from "./crypto";
import { generateTicketPDF, type TicketPDFData } from "./pdf";
import { afterDenied, afterDuplicate } from "./fraud";
import { authMiddleware, requireRole, type AuthRequest } from "./middleware";
import { insertAttendeeSchema, insertEventSchema, insertGateSchema, type User } from "@shared/schema";
import { incr, setWsConnections } from "./metrics";

// Gate QR rotation cache
const gateQRCache = new Map<string, { token: string; expiresAt: number }>();

const STAFF_ROLES = ["ADMIN", "ORGANIZER", "STAFF"];
const MANAGER_ROLES = ["ADMIN", "ORGANIZER"];

// ---- helpers ----

function handleError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error: "Invalid request",
      details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  console.error("[api] unhandled error:", error);
  return res.status(500).json({ error: "Internal server error" });
}

// Never expose phone / document number outside the attendee's own ticket.
function publicAttendee(a: any, includeEmail = false) {
  if (!a) return null;
  return {
    id: a.id,
    fullName: a.fullName,
    ticketType: a.ticketType,
    ...(includeEmail ? { email: a.email } : {}),
  };
}

function publicGate(g: any) {
  return g ? { id: g.id, name: g.name } : null;
}

// CSV: double the quotes and neutralise spreadsheet formulas (=, +, -, @, tab, CR)
function csvCell(value: unknown): string {
  let v = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return `"${v.replace(/"/g, '""')}"`;
}

const normalizeEmail = (e: string) => e.trim().toLowerCase();

// Returns the verified access token payload if one was sent, otherwise null (never throws)
function optionalUser(req: Request) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  try {
    return verifyAuthToken(h.substring(7));
  } catch {
    return null;
  }
}

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

const loginSchema = z.object({
  email: z.string().trim().max(254),
  password: z.string().max(128),
});

const attendeeInput = insertAttendeeSchema
  .omit({ eventId: true, ticketType: true } as any)
  .extend({
    fullName: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().min(3).max(32),
    docType: z.string().trim().min(1).max(32),
    docNumber: z.string().trim().min(3).max(32),
  });

const eventInput = insertEventSchema.extend({
  name: z.string().trim().min(1).max(200),
  venue: z.string().trim().min(1).max(200),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
});

const gateInput = insertGateSchema.extend({
  allowedTicketTypes: z.array(z.enum(["GENERAL", "VIP", "STAFF"])).nullable().optional(),
  name: z.string().trim().min(1).max(100),
  location: z.string().trim().min(1).max(200),
  capacity: z.number().int().positive().nullable().optional(),
});

// RATE_LIMIT_MULTIPLIER lets automated tests (which hammer the API) raise every limit
const mult = Number(process.env.RATE_LIMIT_MULTIPLIER) || 1;
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 * mult, standardHeaders: "draft-7", legacyHeaders: false });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20 * mult, standardHeaders: "draft-7", legacyHeaders: false });
const checkinLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120 * mult, standardHeaders: "draft-7", legacyHeaders: false });

// Used to equalise login timing when the email does not exist
let dummyHashPromise: Promise<string> | null = null;
const getDummyHash = () => (dummyHashPromise ??= hashPassword("not-a-real-password"));

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);
  const io = new SocketIOServer(httpServer, {
    // Same-origin by default; set CORS_ORIGIN (comma separated) to allow other front-ends.
    cors: corsOrigins?.length ? { origin: corsOrigins } : undefined,
    maxHttpBufferSize: 10_000,
  });

  // Only authenticated staff may open a real-time connection
  io.use((socket, next) => {
    try {
      const token = (socket.handshake.auth as any)?.token;
      if (typeof token !== "string") return next(new Error("unauthorized"));
      const user = verifyAuthToken(token);
      if (!STAFF_ROLES.includes(user.role)) return next(new Error("forbidden"));
      socket.data.user = user;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  // WebSocket for real-time updates
  io.on("connection", (socket) => {
    setWsConnections(io.engine.clientsCount);
    socket.on("disconnect", () => setWsConnections(io.engine.clientsCount));
    socket.on("subscribe:event", async (eventId: unknown) => {
      if (typeof eventId !== "string" || eventId.length > 64 || socket.rooms.size > 5) return;
      try {
        if (await canAccessEvent(socket.data.user, eventId)) socket.join(`event:${eventId}`);
      } catch {
        /* ignore */
      }
    });
  });

  // Helper to emit real-time updates
  const emitUpdate = (eventId: string, data: any) => {
    io.to(`event:${eventId}`).emit("update", data);
  };

  // Creates a session: short-lived access token + a rotating refresh token stored server-side
  async function issueSession(user: User, familyId?: string) {
    const family = familyId ?? nanoid();
    const jti = nanoid();
    await storage.createRefreshToken({
      id: jti,
      userId: user.id,
      familyId: family,
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
    });
    return {
      accessToken: generateAuthToken(user.id, user.email, user.role, user.orgId ?? null),
      refreshToken: generateRefreshToken(user.id, jti, family),
    };
  }

  // Tenant isolation: platform admins (ADMIN without organization) see everything; everyone else
  // only the events of their own organization. Callers answer 404, never 403, so event ids of
  // other organizations are not revealed.
  const isPlatformAdmin = (u: { role: string; org?: string | null }) => u.role === "ADMIN" && !u.org;
  async function canAccessEvent(u: { role: string; org?: string | null }, eventId: string): Promise<boolean> {
    if (isPlatformAdmin(u)) return !!(await storage.getEvent(eventId));
    const ev = await storage.getEvent(eventId);
    return !!ev && !!u.org && ev.orgId === u.org;
  }
  const requireEventAccess = (param = "eventId") => async (req: AuthRequest, res: Response, next: any) => {
    try {
      const id = z.string().max(64).parse(req.params[param]);
      if (await canAccessEvent(req.user!, id)) return next();
      return res.status(404).json({ error: "Event not found" });
    } catch (error) {
      handleError(res, error);
    }
  };

  // Tamper-evident audit trail (hash-chained). Never lets a logging failure break a request.
  const audit = (actorId: string | null, action: string, entity: string, entityId: string | null, meta: Record<string, unknown> = {}) =>
    storage
      .createAuditLog({ actorUserId: actorId, action, entity, entityId, metadata: JSON.stringify(meta) } as any)
      .catch((e) => console.error("[audit] failed to write", action, e));

  // ============= AUTH ROUTES =============

  // Register (public sign-up always creates a USER; privileged roles are never self-assignable)
  app.post("/api/auth/register", authLimiter, async (req: Request, res: Response) => {
    try {
      const { email: rawEmail, password } = credentialsSchema.parse(req.body);
      const email = normalizeEmail(rawEmail);

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ error: "Unable to register with these details" });
      }

      const passwordHash = await hashPassword(password);
      const user = await storage.createUser({
        email,
        passwordHash,
        role: "USER",
        status: "ACTIVE",
      });

      const { accessToken, refreshToken } = await issueSession(user);
      await audit(user.id, "REGISTER", "user", user.id, { ip: req.ip });

      res.json({ user: { id: user.id, email: user.email, role: user.role, orgId: user.orgId ?? null }, accessToken, refreshToken });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Login
  app.post("/api/auth/login", authLimiter, async (req: Request, res: Response) => {
    try {
      const { email: rawEmail, password } = loginSchema.parse(req.body);
      const email = normalizeEmail(rawEmail);

      const user = await storage.getUserByEmail(email);
      // Always run one argon2 verification so response time does not reveal whether the email exists
      const valid = user
        ? await verifyPassword(password, user.passwordHash)
        : (await verifyPassword(password, await getDummyHash()), false);

      if (!user || !valid || user.status !== "ACTIVE") {
        await audit(user?.id ?? null, "LOGIN_FAILED", "user", email, { ip: req.ip, reason: !user ? "unknown" : !valid ? "password" : "inactive" });
        return res.status(401).json({ error: "Invalid credentials" });
      }
      await audit(user.id, "LOGIN", "user", user.id, { ip: req.ip });

      const { accessToken, refreshToken } = await issueSession(user);

      res.json({ user: { id: user.id, email: user.email, role: user.role, orgId: user.orgId ?? null }, accessToken, refreshToken });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Refresh token: single use. Every call returns a NEW refresh token and retires the old one; a
  // token that is presented again after it was rotated means it leaked, so the whole session
  // (family) is revoked.
  app.post("/api/auth/refresh", authLimiter, async (req: Request, res: Response) => {
    const invalid = () => res.status(401).json({ error: "Invalid refresh token" });
    try {
      const { refreshToken } = z.object({ refreshToken: z.string().max(4096) }).parse(req.body);
      const claims = verifyRefreshToken(refreshToken);

      const row = await storage.getRefreshToken(claims.jti);
      if (!row || row.userId !== claims.sub || row.familyId !== claims.fam) return invalid();

      if (row.revokedAt) {
        // Two tabs refreshing at the same instant is normal: give a short grace before calling it theft
        if (Date.now() - row.revokedAt.getTime() > 10_000) {
          await storage.revokeRefreshFamily(row.familyId);
          await audit(row.userId, "REFRESH_REUSE_DETECTED", "user", row.userId, { ip: req.ip, family: row.familyId });
        }
        return invalid();
      }
      if (!(await storage.consumeRefreshToken(row.id))) return invalid();

      const user = await storage.getUser(claims.sub);
      if (!user || user.status !== "ACTIVE") {
        await storage.revokeRefreshFamily(row.familyId);
        return invalid();
      }

      storage.deleteExpiredRefreshTokens().catch(() => {});
      res.json(await issueSession(user, row.familyId));
    } catch (error) {
      invalid();
    }
  });

  // Logout: revokes the whole session on the server (the access token expires on its own within 15 min)
  app.post("/api/auth/logout", authLimiter, async (req: Request, res: Response) => {
    try {
      const { refreshToken } = z.object({ refreshToken: z.string().max(4096) }).parse(req.body);
      const claims = verifyRefreshToken(refreshToken, { ignoreExpiration: true });
      await storage.revokeRefreshFamily(claims.fam);
      await audit(claims.sub, "LOGOUT", "user", claims.sub, { ip: req.ip });
    } catch {
      // nothing to revoke; logging out must always succeed from the client's point of view
    }
    res.json({ success: true });
  });

  // ============= REGISTRATION & TICKETS =============

  // Register attendee for event
  app.post("/api/events/:eventId/register", registerLimiter, async (req: Request, res: Response) => {
    try {
      const { eventId } = req.params;
      const data = attendeeInput.parse(req.body);
      const email = normalizeEmail(data.email);

      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (event.status !== "ACTIVE") {
        return res.status(400).json({ error: "Registration is not open for this event" });
      }

      // Check if already registered
      const existing = await storage.getAttendeeByEmailAndEvent(email, eventId);
      if (existing) {
        return res.status(400).json({ error: "Already registered for this event" });
      }

      // Same document (any formatting) or the same mailbox through "+tag" aliases
      const docNormalized = data.docNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (await storage.findDuplicateIdentity(eventId, data.docType, docNormalized, email)) {
        return res.status(400).json({ error: "Already registered for this event" });
      }

      // ticketType is never taken from the client: public registration is always GENERAL.
      // If the registrant is logged in, the attendee is bound to that account.
      const jti = nanoid();
      const secret = generateTicketSecret();
      let code = "";
      const { attendee, ticket } = await storage.registerAttendee(
        { ...data, email, eventId, ticketType: "GENERAL", userId: optionalUser(req)?.sub ?? null } as any,
        (attendeeId) => {
          // Rotating QR: the device derives a fresh code every 30 s from this per-ticket secret
          code = generateDynamicTicketCode(secret, jti);
          return { code, jti, secret };
        }
      );

      res.json({ attendee, ticket: { ...ticket, qrCode: code } }); // includes `secret` for the ticket holder only
    } catch (error: any) {
      if (error?.code === "23505") {
        return res.status(400).json({ error: "Already registered for this event" });
      }
      handleError(res, error);
    }
  });

  // Active events (public: id, name, venue and dates only)
  app.get("/api/events/active", async (_req: Request, res: Response) => {
    try {
      const list = await storage.getActiveEvents();
      res.json(list.map((e) => ({ id: e.id, name: e.name, venue: e.venue, startsAt: e.startsAt, endsAt: e.endsAt })));
    } catch (error) {
      handleError(res, error);
    }
  });

  // Get my ticket
  app.get("/api/me/ticket", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { eventId, format } = z
        .object({ eventId: z.string().max(64), format: z.string().max(10).optional() })
        .parse(req.query);

      // Only the account the ticket was issued to can read it: matching by (unverified) email
      // alone would let anyone claim a victim's ticket by signing up with their address.
      const attendee = await storage.getAttendeeByEmailAndEvent(normalizeEmail(req.user!.email), eventId);
      if (!attendee || attendee.userId !== req.user!.sub) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const ticket = await storage.getTicketByAttendee(attendee.id);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Rotating tickets: hand out a currently valid code (the client keeps refreshing it itself)
      const currentCode = ticket.secret ? generateDynamicTicketCode(ticket.secret, ticket.jti) : ticket.code;
      const qrDataURL = await generateQRCodeDataURL(currentCode);

      if (format === 'pdf') {
        if (ticket.secret) {
          return res.status(409).json({ error: "Rotating tickets cannot be printed; open the ticket on your phone" });
        }
        // Generate PDF
        const pdfData: TicketPDFData = {
          attendeeName: attendee.fullName,
          eventName: event.name,
          eventDate: new Date(event.startsAt).toLocaleDateString(),
          eventLocation: event.venue,
          ticketType: attendee.ticketType,
          qrCode: ticket.code,
          ticketId: ticket.id,
        };

        const pdfBuffer = await generateTicketPDF(pdfData);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=ticket-${ticket.id}.pdf`);
        res.send(pdfBuffer);
      } else {
        // Return JSON with QR data URL
        res.json({
          attendee,
          ticket: { ...ticket, qrCode: currentCode, qrDataURL },
          event,
        });
      }
    } catch (error) {
      handleError(res, error);
    }
  });

  // ============= GATE QR CODES =============

  // Get rotating gate QR (only staff devices may display it)
  app.get("/api/gates/:gateId/qr", authMiddleware, requireRole(...STAFF_ROLES), async (req: AuthRequest, res: Response) => {
    try {
      const { gateId } = req.params;

      const gate = await storage.getGate(gateId);
      if (!gate || !(await canAccessEvent(req.user!, gate.eventId))) {
        return res.status(404).json({ error: "Gate not found" });
      }

      // Check cache
      const cached = gateQRCache.get(gateId);
      const now = Date.now();

      if (cached && cached.expiresAt > now) {
        return res.json({ qrCode: cached.token, expiresAt: cached.expiresAt });
      }

      // Generate new QR (60 second TTL)
      const token = generateGateQR(gate.eventId, gateId, 60);
      const expiresAt = now + 60000;

      gateQRCache.set(gateId, { token, expiresAt });

      res.json({ qrCode: token, expiresAt });
    } catch (error) {
      handleError(res, error);
    }
  });

  // ============= CHECK-INS =============

  const checkinSchema = z.object({
    mode: z.enum(["gate", "staff"]),
    ticketQR: z.string().min(1).max(4096),
    gateQR: z.string().max(4096).optional(),
    gateId: z.string().max(64).optional(),
  });

  // Check-in (both modes). Requires authentication:
  //  - "staff": a STAFF/ORGANIZER/ADMIN scans the attendee's ticket at a gate
  //  - "gate":  the logged-in attendee scans the gate QR with their own ticket
  app.post("/api/checkins", checkinLimiter, authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const body = checkinSchema.parse(req.body);
      const user = req.user!;
      const meta = {
        deviceId: req.headers["user-agent"]?.slice(0, 255),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"]?.slice(0, 255),
      };
      const method: "GATE_QR" | "TICKET_QR" = body.mode === "gate" ? "GATE_QR" : "TICKET_QR";

      // Record the attempt (best effort) and answer DENIED
      const deny = async (reason: string, ctx: { eventId?: string; attendeeId?: string; gateId?: string } = {}) => {
        try {
          if (ctx.eventId && ctx.attendeeId && ctx.gateId) {
            const gateRow = await storage.getGate(ctx.gateId);
            if (gateRow) {
              await storage.createCheckin({
                eventId: ctx.eventId,
                attendeeId: ctx.attendeeId,
                gateId: ctx.gateId,
                method,
                result: "DENIED",
                ...meta,
              });
            }
          }
          await storage.createAuditLog({
            actorUserId: user.sub,
            action: "CHECKIN_DENIED",
            entity: "checkin",
            entityId: ctx.attendeeId ?? null,
            metadata: JSON.stringify({ reason, mode: body.mode, gateId: ctx.gateId ?? body.gateId ?? null, ip: req.ip }),
          } as any);
        } catch (e) {
          console.error("[checkin] failed to record denial:", e);
        }
        incr("checkins_total", { result: "DENIED" });
        afterDenied(user.sub, ctx.eventId ?? null, emitUpdate).catch((e) => console.error("[fraud]", e));
        return res.json({ result: "DENIED", reason });
      };

      // Permission by mode
      if (body.mode === "staff" && !STAFF_ROLES.includes(user.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Ticket: rotating code (current) or legacy static JWT (only for tickets without a secret)
      let ticketPayload: { evt: string; sub: string; jti: string };
      if (isDynamicTicketCode(body.ticketQR)) {
        const parsed = parseDynamicTicketCode(body.ticketQR);
        const t = parsed ? await storage.getTicketByJti(parsed.jti) : undefined;
        if (!parsed || !t?.secret || !verifyDynamicTicketMac(t.secret, parsed)) {
          return deny("Invalid or expired ticket code");
        }
        const holder = await storage.getAttendee(t.attendeeId);
        if (!holder) return deny("Invalid ticket");
        ticketPayload = { evt: holder.eventId, sub: t.attendeeId, jti: t.jti };
      } else {
        let legacy;
        try {
          legacy = verifyTicketQR(body.ticketQR);
        } catch {
          return deny("Invalid ticket");
        }
        ticketPayload = { evt: legacy.evt, sub: legacy.sub, jti: legacy.jti };
        const t = await storage.getTicketByJti(legacy.jti);
        if (t?.secret) {
          return deny("Static QR is no longer valid: open the ticket to show the live code", { eventId: legacy.evt, attendeeId: legacy.sub });
        }
      }

      // Which event and gate?
      let eventId: string;
      let gateId: string;
      if (body.mode === "gate") {
        if (!body.gateQR) return res.status(400).json({ error: "gateQR required" });
        let gatePayload;
        try {
          gatePayload = verifyGateQR(body.gateQR);
        } catch {
          return deny("Invalid or expired gate code", { eventId: ticketPayload.evt, attendeeId: ticketPayload.sub });
        }
        eventId = gatePayload.evt;
        gateId = gatePayload.gat;
      } else {
        if (!body.gateId) return res.status(400).json({ error: "gateId required" });
        eventId = ticketPayload.evt;
        gateId = body.gateId;
      }
      const attendeeId = ticketPayload.sub;
      const ctx = { eventId, attendeeId, gateId };

      // Ticket must exist, not be revoked and belong to this attendee
      const ticket = await storage.getTicketByJti(ticketPayload.jti);
      if (!ticket || ticket.revokedAt || ticket.attendeeId !== attendeeId) {
        return deny("Invalid or revoked ticket", ctx);
      }

      const attendee = await storage.getAttendee(attendeeId);
      if (!attendee || attendee.eventId !== eventId || ticketPayload.evt !== eventId) {
        return deny("Ticket does not belong to this event", ctx);
      }

      // In gate mode the logged-in user must be the ticket holder
      if (body.mode === "gate" && attendee.userId !== user.sub) {
        return deny("Ticket does not belong to this account", ctx);
      }

      const [event, gate] = await Promise.all([storage.getEvent(eventId), storage.getGate(gateId)]);
      if (!event || event.status !== "ACTIVE") {
        return deny("Event is not active", ctx);
      }
      // Staff may only admit people to events of their own organization
      if (body.mode === "staff" && !isPlatformAdmin(user) && (!user.org || event.orgId !== user.org)) {
        return deny("Not authorized for this event", ctx);
      }
      if (!gate || gate.eventId !== eventId) {
        return deny("Unknown gate for this event", { eventId, attendeeId });
      }
      if (!gate.isActive) {
        return deny("Gate is closed", ctx);
      }
      if (gate.allowedTicketTypes?.length && !gate.allowedTicketTypes.includes(attendee.ticketType)) {
        return deny("Ticket type not allowed at this gate", ctx);
      }

      // One entry per ticket: if it was already used, answer DUP
      const respondDup = async (original?: { timestamp: Date; gateId?: string }) => {
        const dup = await storage.createCheckin({ eventId, attendeeId, gateId, method, result: "DUP", ...meta });
        emitUpdate(eventId, { type: "checkin", data: { id: dup.id, result: "DUP", timestamp: dup.timestamp, attendee: publicAttendee(attendee), gate: publicGate(gate) } });
        incr("checkins_total", { result: "DUP" });
        afterDuplicate(attendeeId, eventId, gateId, original as any, emitUpdate).catch((e) => console.error("[fraud]", e));
        return res.json({
          result: "DUP",
          reason: "Ticket already used",
          attendee: publicAttendee(attendee),
          firstEntryAt: original?.timestamp,
          timestamp: new Date().toISOString(),
        });
      };

      const already = await storage.getOkCheckin(attendeeId, eventId);
      if (already) return respondDup(already);

      // Capacity of limited gates
      if (gate.capacityType === "limited" && gate.capacity != null) {
        const used = await storage.countOkAtGate(gateId);
        if (used >= gate.capacity) {
          return deny("Gate is at capacity", ctx);
        }
      }

      // Short lock absorbs simultaneous scans of the same ticket (best effort; the database
      // unique index is the real guarantee)
      try {
        const lockKey = `checkin:${eventId}:${attendeeId}`;
        const got = await redis.setnx(lockKey, "1");
        if (!got) return respondDup();
        await redis.expire(lockKey, 5);
      } catch (e) {
        console.warn("[checkin] lock unavailable, relying on database constraint");
      }

      let checkin;
      try {
        checkin = await storage.createCheckin({ eventId, attendeeId, gateId, method, result: "OK", ...meta });
      } catch (e: any) {
        // Unique violation: another request admitted this ticket first
        if (e?.code === "23505" || /checkins_one_ok_per_attendee/.test(String(e?.message))) {
          return respondDup(await storage.getOkCheckin(attendeeId, eventId));
        }
        throw e;
      }

      emitUpdate(eventId, {
        type: "checkin",
        data: { id: checkin.id, result: "OK", timestamp: checkin.timestamp, attendee: publicAttendee(attendee), gate: publicGate(gate) },
      });

      incr("checkins_total", { result: "OK" });
      res.json({
        result: "OK",
        attendee: publicAttendee(attendee),
        gate: publicGate(gate),
        timestamp: checkin.timestamp,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  // ============= METRICS & ANALYTICS =============

  const eventIdParam = z.string().max(64);

  // Resolve attendees / gates once per id instead of once per row
  async function enrichCheckins(rows: any[]) {
    const attendeeIds = Array.from(new Set(rows.map((r) => r.attendeeId)));
    const gateIds = Array.from(new Set(rows.map((r) => r.gateId)));
    const [attendeeList, gateList] = await Promise.all([
      Promise.all(attendeeIds.map((id) => storage.getAttendee(id))),
      Promise.all(gateIds.map((id) => storage.getGate(id))),
    ]);
    const attendeeMap = new Map(attendeeList.filter(Boolean).map((a: any) => [a.id, a]));
    const gateMap = new Map(gateList.filter(Boolean).map((g: any) => [g.id, g]));
    return rows.map((r) => ({ ...r, attendee: attendeeMap.get(r.attendeeId), gate: gateMap.get(r.gateId) }));
  }

  // Event metrics summary
  app.get("/api/events/:eventId/metrics", authMiddleware, requireRole(...STAFF_ROLES), requireEventAccess(), async (req: AuthRequest, res: Response) => {
    try {
      const eventId = eventIdParam.parse(req.params.eventId);
      const metrics = await storage.getEventMetrics(eventId);
      res.json(metrics);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Gate metrics
  app.get("/api/events/:eventId/gates/metrics", authMiddleware, requireRole(...STAFF_ROLES), requireEventAccess(), async (req: AuthRequest, res: Response) => {
    try {
      const eventId = eventIdParam.parse(req.params.eventId);
      const metrics = await storage.getGateMetrics(eventId);
      res.json(metrics);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Entries over time per gate (real data for the dashboard chart)
  app.get("/api/events/:eventId/timeseries", authMiddleware, requireRole(...STAFF_ROLES), requireEventAccess(), async (req: AuthRequest, res: Response) => {
    try {
      const eventId = eventIdParam.parse(req.params.eventId);
      res.json(await storage.getEntriesTimeSeries(eventId));
    } catch (error) {
      handleError(res, error);
    }
  });

  // Export check-ins CSV
  app.get("/api/events/:eventId/exports/checkins.csv", authMiddleware, requireRole("ADMIN"), requireEventAccess(), async (req: AuthRequest, res: Response) => {
    try {
      const eventId = eventIdParam.parse(req.params.eventId);

      const checkins = await storage.getCheckinsByEvent(eventId, 10000);
      const enriched = await enrichCheckins(checkins);
      await audit(req.user!.sub, "CHECKINS_EXPORTED", "event", eventId, { rows: checkins.length });

      const csvHeader = "Timestamp,Attendee Name,Email,Gate,Method,Result,Device ID\n";
      const csvRows = enriched.map((c) =>
        [
          c.timestamp.toISOString(),
          c.attendee?.fullName ?? "Unknown",
          c.attendee?.email ?? "",
          c.gate?.name ?? "Unknown",
          c.method,
          c.result,
          c.deviceId ?? "",
        ].map(csvCell).join(",")
      ).join("\n");

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=checkins-${eventId.replace(/[^\w-]/g, "")}.csv`);
      res.send(csvHeader + csvRows);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Recent check-ins (no phone / document number; email and network data only for managers)
  app.get("/api/events/:eventId/checkins", authMiddleware, requireRole(...STAFF_ROLES), requireEventAccess(), async (req: AuthRequest, res: Response) => {
    try {
      const eventId = eventIdParam.parse(req.params.eventId);
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
      const privileged = MANAGER_ROLES.includes(req.user!.role);

      const checkins = await storage.getCheckinsByEvent(eventId, limit);
      const enriched = await enrichCheckins(checkins);

      res.json(
        enriched.map(({ deviceId, ipAddress, userAgent, attendee, gate, ...rest }) => ({
          ...rest,
          ...(privileged ? { deviceId, ipAddress, userAgent } : {}),
          attendee: publicAttendee(attendee, privileged),
          gate,
        }))
      );
    } catch (error) {
      handleError(res, error);
    }
  });

  // ============= ADMIN ROUTES =============

  // Get all events
  app.get("/api/events", authMiddleware, requireRole(...MANAGER_ROLES), async (req: AuthRequest, res: Response) => {
    try {
      const u = req.user!;
      res.json(isPlatformAdmin(u) ? await storage.getAllEvents() : u.org ? await storage.getEventsByOrg(u.org) : []);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Create event
  app.post("/api/events", authMiddleware, requireRole(...MANAGER_ROLES), async (req: AuthRequest, res: Response) => {
    try {
      const data = eventInput.parse(req.body);
      const u = req.user!;
      // Organizers always create events inside their own organization; platform admins may choose
      const orgId = isPlatformAdmin(u) ? (data as any).orgId ?? null : u.org;
      if (!orgId && !isPlatformAdmin(u)) return res.status(403).json({ error: "Your account is not assigned to an organization" });
      const event = await storage.createEvent({ ...data, orgId } as any);
      await audit(req.user!.sub, "EVENT_CREATED", "event", event.id, { name: event.name });
      res.json(event);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Get gates for event
  app.get("/api/events/:eventId/gates", authMiddleware, requireRole(...STAFF_ROLES), requireEventAccess(), async (req: AuthRequest, res: Response) => {
    try {
      const eventId = eventIdParam.parse(req.params.eventId);
      const gates = await storage.getGatesByEvent(eventId);
      res.json(gates);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Get all gates (admin listing)
  app.get("/api/gates", authMiddleware, requireRole(...STAFF_ROLES), async (req: AuthRequest, res: Response) => {
    try {
      const u = req.user!;
      res.json(isPlatformAdmin(u) ? await storage.getAllGates() : u.org ? await storage.getGatesByOrg(u.org) : []);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Create gate
  app.post("/api/gates", authMiddleware, requireRole(...MANAGER_ROLES), async (req: AuthRequest, res: Response) => {
    try {
      const data = gateInput.parse(req.body);
      if (!(await canAccessEvent(req.user!, data.eventId))) return res.status(404).json({ error: "Event not found" });
      const gate = await storage.createGate(data);
      await audit(req.user!.sub, "GATE_CREATED", "gate", gate.id, { eventId: gate.eventId, name: gate.name });
      res.json(gate);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Toggle gate status
  app.patch("/api/gates/:gateId/status", authMiddleware, requireRole(...MANAGER_ROLES), async (req: AuthRequest, res: Response) => {
    try {
      const gateId = z.string().max(64).parse(req.params.gateId);
      const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
      const g = await storage.getGate(gateId);
      if (!g || !(await canAccessEvent(req.user!, g.eventId))) return res.status(404).json({ error: "Gate not found" });
      await storage.updateGateStatus(gateId, isActive);
      await audit(req.user!.sub, isActive ? "GATE_OPENED" : "GATE_CLOSED", "gate", gateId);
      res.json({ success: true });
    } catch (error) {
      handleError(res, error);
    }
  });

  // ============= FRAUD CONTROLS =============

  // Revoke every ticket of an attendee (kill-switch for a stolen or sold-twice ticket)
  app.post("/api/attendees/:attendeeId/revoke", authMiddleware, requireRole(...MANAGER_ROLES), async (req: AuthRequest, res: Response) => {
    try {
      const attendeeId = z.string().max(64).parse(req.params.attendeeId);
      const attendee = await storage.getAttendee(attendeeId);
      if (!attendee || !(await canAccessEvent(req.user!, attendee.eventId))) return res.status(404).json({ error: "Attendee not found" });
      const revoked = await storage.revokeTicketsByAttendee(attendeeId);
      await audit(req.user!.sub, "TICKET_REVOKED", "attendee", attendeeId, { eventId: attendee.eventId, revoked });
      res.json({ revoked });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Event kill-switch: ENDED / CANCELLED events stop admitting people immediately
  app.patch("/api/events/:eventId/status", authMiddleware, requireRole(...MANAGER_ROLES), requireEventAccess(), async (req: AuthRequest, res: Response) => {
    try {
      const eventId = eventIdParam.parse(req.params.eventId);
      const { status } = z.object({ status: z.enum(["DRAFT", "ACTIVE", "ENDED", "CANCELLED"]) }).parse(req.body);
      if (!(await storage.getEvent(eventId))) return res.status(404).json({ error: "Event not found" });
      await storage.updateEventStatus(eventId, status);
      await audit(req.user!.sub, "EVENT_STATUS_CHANGED", "event", eventId, { eventId, status });
      res.json({ success: true, status });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Recent fraud alerts for an event
  app.get("/api/events/:eventId/alerts", authMiddleware, requireRole(...MANAGER_ROLES), requireEventAccess(), async (req: AuthRequest, res: Response) => {
    try {
      const eventId = eventIdParam.parse(req.params.eventId);
      const rows = await storage.getRecentAuditLogs("FRAUD_ALERT", eventId, 50);
      res.json(
        rows.map((r) => ({ id: r.id, timestamp: r.timestamp, ...JSON.parse(r.metadata || "{}") }))
      );
    } catch (error) {
      handleError(res, error);
    }
  });

  // Verify the audit log has not been altered
  app.get("/api/audit/verify", authMiddleware, requireRole("ADMIN"), async (_req: AuthRequest, res: Response) => {
    try {
      res.json(await storage.verifyAuditChain());
    } catch (error) {
      handleError(res, error);
    }
  });

  // ============= ORGANIZATIONS, USERS & DATA RETENTION =============

  // Active events the signed-in staff member can work with (scoped to their organization)
  app.get("/api/me/events", authMiddleware, requireRole(...STAFF_ROLES), async (req: AuthRequest, res: Response) => {
    try {
      const u = req.user!;
      const list = isPlatformAdmin(u) ? await storage.getActiveEvents() : u.org ? await storage.getActiveEventsByOrg(u.org) : [];
      res.json(list.map((e) => ({ id: e.id, name: e.name, venue: e.venue, startsAt: e.startsAt, endsAt: e.endsAt })));
    } catch (error) {
      handleError(res, error);
    }
  });

  // Organizations (platform administrators only)
  app.post("/api/orgs", authMiddleware, requireRole("ADMIN"), async (req: AuthRequest, res: Response) => {
    try {
      if (!isPlatformAdmin(req.user!)) return res.status(403).json({ error: "Forbidden" });
      const { name } = z.object({ name: z.string().trim().min(2).max(120) }).parse(req.body);
      const org = await storage.createOrganization(name);
      await audit(req.user!.sub, "ORG_CREATED", "organization", org.id, { name });
      res.json(org);
    } catch (error: any) {
      if (error?.code === "23505") return res.status(400).json({ error: "An organization with that name already exists" });
      handleError(res, error);
    }
  });

  app.get("/api/orgs", authMiddleware, requireRole("ADMIN"), async (req: AuthRequest, res: Response) => {
    try {
      if (!isPlatformAdmin(req.user!)) return res.status(403).json({ error: "Forbidden" });
      res.json(await storage.listOrganizations());
    } catch (error) {
      handleError(res, error);
    }
  });

  // Users: privileged accounts are created here by administrators (never by public sign-up)
  app.get("/api/users", authMiddleware, requireRole("ADMIN"), async (req: AuthRequest, res: Response) => {
    try {
      const u = req.user!;
      if (!isPlatformAdmin(u) && !u.org) return res.json([]);
      res.json(await storage.listUsers(isPlatformAdmin(u) ? undefined : u.org!));
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/users", authMiddleware, requireRole("ADMIN"), async (req: AuthRequest, res: Response) => {
    try {
      const u = req.user!;
      const body = z
        .object({
          email: z.string().trim().email().max(254),
          password: z.string().min(10, "Password must be at least 10 characters").max(128),
          role: z.enum(["ADMIN", "ORGANIZER", "STAFF"]),
          orgId: z.string().max(64).nullable().optional(),
        })
        .parse(req.body);

      // Organization admins can only create users inside their own organization; only platform
      // administrators can create users without one (i.e. other platform administrators).
      const orgId = isPlatformAdmin(u) ? body.orgId ?? null : u.org ?? null;
      if (!isPlatformAdmin(u) && !orgId) return res.status(403).json({ error: "Forbidden" });
      if (!orgId && body.role !== "ADMIN") return res.status(400).json({ error: "ORGANIZER and STAFF users need an organization" });
      if (orgId && !(await storage.getOrganization(orgId))) return res.status(404).json({ error: "Organization not found" });

      const email = normalizeEmail(body.email);
      if (await storage.getUserByEmail(email)) return res.status(400).json({ error: "Unable to create a user with these details" });
      const created = await storage.createUser({
        email,
        passwordHash: await hashPassword(body.password),
        role: body.role,
        status: "ACTIVE",
        orgId,
      } as any);
      await audit(u.sub, "USER_CREATED", "user", created.id, { role: created.role, orgId });
      res.json({ id: created.id, email: created.email, role: created.role, status: created.status, orgId: created.orgId });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/users/:userId/status", authMiddleware, requireRole("ADMIN"), async (req: AuthRequest, res: Response) => {
    try {
      const u = req.user!;
      const userId = z.string().max(64).parse(req.params.userId);
      const { status } = z.object({ status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]) }).parse(req.body);
      if (userId === u.sub) return res.status(400).json({ error: "You cannot change your own status" });
      const target = await storage.getUser(userId);
      if (!target || (!isPlatformAdmin(u) && target.orgId !== u.org)) return res.status(404).json({ error: "User not found" });
      await storage.updateUserStatus(userId, status);
      if (status !== "ACTIVE") await storage.revokeAllRefreshTokensForUser(userId); // end their sessions now
      await audit(u.sub, "USER_STATUS_CHANGED", "user", userId, { status });
      res.json({ success: true, status });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Data retention / right to erasure: after an event is over, personal data of its attendees can be
  // replaced with irreversible placeholders (check-in history and counts are kept).
  app.post("/api/events/:eventId/anonymize", authMiddleware, requireRole(...MANAGER_ROLES), requireEventAccess(), async (req: AuthRequest, res: Response) => {
    try {
      const eventId = eventIdParam.parse(req.params.eventId);
      const event = await storage.getEvent(eventId);
      if (!event || (event.status !== "ENDED" && event.status !== "CANCELLED")) {
        return res.status(409).json({ error: "Only ENDED or CANCELLED events can be anonymized" });
      }
      const anonymized = await storage.anonymizeEventAttendees(eventId);
      await audit(req.user!.sub, "ATTENDEES_ANONYMIZED", "event", eventId, { eventId, anonymized });
      res.json({ anonymized });
    } catch (error) {
      handleError(res, error);
    }
  });

  return httpServer;
}
