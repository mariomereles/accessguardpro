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
  hashPassword,
  verifyPassword,
  generateQRCodeDataURL,
} from "./crypto";
import { generateTicketPDF, type TicketPDFData } from "./pdf";
import { authMiddleware, requireRole, type AuthRequest } from "./middleware";
import { insertAttendeeSchema, insertEventSchema, insertGateSchema } from "@shared/schema";

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
  name: z.string().trim().min(1).max(100),
  location: z.string().trim().min(1).max(200),
  capacity: z.number().int().positive().nullable().optional(),
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false });
const checkinLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false });

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
    socket.on("subscribe:event", (eventId: unknown) => {
      if (typeof eventId !== "string" || eventId.length > 64 || socket.rooms.size > 5) return;
      socket.join(`event:${eventId}`);
    });
  });

  // Helper to emit real-time updates
  const emitUpdate = (eventId: string, data: any) => {
    io.to(`event:${eventId}`).emit("update", data);
  };

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

      const accessToken = generateAuthToken(user.id, user.email, user.role);
      const refreshToken = generateRefreshToken(user.id);

      res.json({ user: { id: user.id, email: user.email, role: user.role }, accessToken, refreshToken });
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
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const accessToken = generateAuthToken(user.id, user.email, user.role);
      const refreshToken = generateRefreshToken(user.id);

      res.json({ user: { id: user.id, email: user.email, role: user.role }, accessToken, refreshToken });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Refresh token
  app.post("/api/auth/refresh", authLimiter, async (req: Request, res: Response) => {
    try {
      const { refreshToken } = z.object({ refreshToken: z.string().max(4096) }).parse(req.body);
      const payload = verifyRefreshToken(refreshToken);

      const user = await storage.getUser(payload.sub);
      if (!user || user.status !== "ACTIVE") {
        return res.status(401).json({ error: "Invalid refresh token" });
      }

      const accessToken = generateAuthToken(user.id, user.email, user.role);
      const newRefreshToken = generateRefreshToken(user.id);

      res.json({ accessToken, refreshToken: newRefreshToken });
    } catch (error) {
      res.status(401).json({ error: "Invalid refresh token" });
    }
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

      // ticketType is never taken from the client: public registration is always GENERAL.
      // If the registrant is logged in, the attendee is bound to that account.
      const jti = nanoid();
      let code = "";
      const { attendee, ticket } = await storage.registerAttendee(
        { ...data, email, eventId, ticketType: "GENERAL", userId: optionalUser(req)?.sub ?? null } as any,
        (attendeeId) => {
          code = generateTicketQR(attendeeId, eventId, attendeeId, jti);
          return { code, jti };
        }
      );

      res.json({ attendee, ticket: { ...ticket, qrCode: code } });
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

      // Generate QR code data URL
      const qrDataURL = await generateQRCodeDataURL(ticket.code);

      if (format === 'pdf') {
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
          ticket: { ...ticket, qrCode: ticket.code, qrDataURL },
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
      if (!gate) {
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
        return res.json({ result: "DENIED", reason });
      };

      // Permission by mode
      if (body.mode === "staff" && !STAFF_ROLES.includes(user.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Ticket signature
      let ticketPayload;
      try {
        ticketPayload = verifyTicketQR(body.ticketQR);
      } catch {
        return deny("Invalid ticket");
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
      if (!gate || gate.eventId !== eventId) {
        return deny("Unknown gate for this event", { eventId, attendeeId });
      }
      if (!gate.isActive) {
        return deny("Gate is closed", ctx);
      }

      // One entry per ticket: if it was already used, answer DUP
      const respondDup = async (original?: { timestamp: Date }) => {
        const dup = await storage.createCheckin({ eventId, attendeeId, gateId, method, result: "DUP", ...meta });
        emitUpdate(eventId, { type: "checkin", data: { id: dup.id, result: "DUP", timestamp: dup.timestamp, attendee: publicAttendee(attendee), gate: publicGate(gate) } });
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
  app.get("/api/events/:eventId/metrics", authMiddleware, requireRole(...STAFF_ROLES), async (req: AuthRequest, res: Response) => {
    try {
      const eventId = eventIdParam.parse(req.params.eventId);
      const metrics = await storage.getEventMetrics(eventId);
      res.json(metrics);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Gate metrics
  app.get("/api/events/:eventId/gates/metrics", authMiddleware, requireRole(...STAFF_ROLES), async (req: AuthRequest, res: Response) => {
    try {
      const eventId = eventIdParam.parse(req.params.eventId);
      const metrics = await storage.getGateMetrics(eventId);
      res.json(metrics);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Export check-ins CSV
  app.get("/api/events/:eventId/exports/checkins.csv", authMiddleware, requireRole("ADMIN"), async (req: AuthRequest, res: Response) => {
    try {
      const eventId = eventIdParam.parse(req.params.eventId);

      const checkins = await storage.getCheckinsByEvent(eventId, 10000);
      const enriched = await enrichCheckins(checkins);

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
  app.get("/api/events/:eventId/checkins", authMiddleware, requireRole(...STAFF_ROLES), async (req: AuthRequest, res: Response) => {
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
      const events = await storage.getAllEvents();
      res.json(events);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Create event
  app.post("/api/events", authMiddleware, requireRole(...MANAGER_ROLES), async (req: AuthRequest, res: Response) => {
    try {
      const data = eventInput.parse(req.body);
      const event = await storage.createEvent(data);
      res.json(event);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Get gates for event
  app.get("/api/events/:eventId/gates", authMiddleware, requireRole(...STAFF_ROLES), async (req: AuthRequest, res: Response) => {
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
      const all = await storage.getAllGates();
      res.json(all);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Create gate
  app.post("/api/gates", authMiddleware, requireRole(...MANAGER_ROLES), async (req: AuthRequest, res: Response) => {
    try {
      const data = gateInput.parse(req.body);
      const gate = await storage.createGate(data);
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
      await storage.updateGateStatus(gateId, isActive);
      res.json({ success: true });
    } catch (error) {
      handleError(res, error);
    }
  });

  return httpServer;
}
