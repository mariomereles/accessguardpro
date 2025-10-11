import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { z } from "zod";
import { nanoid } from "nanoid";
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
  hashPassword,
  verifyPassword,
} from "./crypto";
import { authMiddleware, requireRole, type AuthRequest } from "./middleware";
import { insertAttendeeSchema } from "@shared/schema";

// Gate QR rotation cache
const gateQRCache = new Map<string, { token: string; expiresAt: number }>();

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
  });

  // WebSocket for real-time updates
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("subscribe:event", (eventId: string) => {
      socket.join(`event:${eventId}`);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  // Helper to emit real-time updates
  const emitUpdate = (eventId: string, data: any) => {
    io.to(`event:${eventId}`).emit("update", data);
  };

  // ============= AUTH ROUTES =============

  // Register
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, role = "USER" } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ error: "User already exists" });
      }

      const passwordHash = await hashPassword(password);
      const user = await storage.createUser({
        email,
        passwordHash,
        role: role as any,
        status: "ACTIVE",
      });

      const accessToken = generateAuthToken(user.id, user.email, user.role);
      const refreshToken = generateRefreshToken(user.id);

      res.json({ user: { id: user.id, email: user.email, role: user.role }, accessToken, refreshToken });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const accessToken = generateAuthToken(user.id, user.email, user.role);
      const refreshToken = generateRefreshToken(user.id);

      res.json({ user: { id: user.id, email: user.email, role: user.role }, accessToken, refreshToken });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Refresh token
  app.post("/api/auth/refresh", async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      const payload = verifyAuthToken(refreshToken);

      const user = await storage.getUser(payload.sub);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const accessToken = generateAuthToken(user.id, user.email, user.role);
      const newRefreshToken = generateRefreshToken(user.id);

      res.json({ accessToken, refreshToken: newRefreshToken });
    } catch (error: any) {
      res.status(401).json({ error: "Invalid refresh token" });
    }
  });

  // ============= REGISTRATION & TICKETS =============

  // Register attendee for event
  app.post("/api/events/:eventId/register", async (req: Request, res: Response) => {
    try {
      const { eventId } = req.params;
      const data = insertAttendeeSchema.parse(req.body);

      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Check if already registered
      const existing = await storage.getAttendeeByEmailAndEvent(data.email, eventId);
      if (existing) {
        return res.status(400).json({ error: "Already registered for this event" });
      }

      const attendee = await storage.createAttendee({
        ...data,
        eventId,
      });

      // Generate ticket
      const jti = nanoid();
      const code = generateTicketQR(attendee.id, eventId, attendee.id, jti);
      
      const ticket = await storage.createTicket({
        attendeeId: attendee.id,
        code,
        jti,
      });

      res.json({ attendee, ticket: { ...ticket, qrCode: code } });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get my ticket
  app.get("/api/me/ticket", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { eventId } = req.query;

      if (!eventId) {
        return res.status(400).json({ error: "Event ID required" });
      }

      const attendee = await storage.getAttendeeByEmailAndEvent(req.user!.email, eventId as string);
      if (!attendee) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const ticket = await storage.getTicketByAttendee(attendee.id);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const event = await storage.getEvent(eventId as string);

      res.json({
        attendee,
        ticket: { ...ticket, qrCode: ticket.code },
        event,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============= GATE QR CODES =============

  // Get rotating gate QR
  app.get("/api/gates/:gateId/qr", async (req: Request, res: Response) => {
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

      // Auto-refresh before expiry
      setTimeout(() => {
        gateQRCache.delete(gateId);
      }, 60000);

      res.json({ qrCode: token, expiresAt });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============= CHECK-INS =============

  // Check-in (both modes)
  app.post("/api/checkins", async (req: Request, res: Response) => {
    try {
      const { mode, gateQR, ticketQR, gateId } = req.body;

      let eventId: string;
      let attendeeId: string;
      let finalGateId: string;
      let method: "GATE_QR" | "TICKET_QR";

      if (mode === "gate" && gateQR) {
        // Mode A: Scan gate QR with user's ticket
        method = "GATE_QR";
        
        const gatePayload = verifyGateQR(gateQR);
        eventId = gatePayload.evt;
        finalGateId = gatePayload.gat;

        // In real app, would get attendee from authenticated user
        // For demo, extract from request
        const ticketPayload = verifyTicketQR(ticketQR);
        attendeeId = ticketPayload.sub;

        // Verify ticket
        const ticket = await storage.getTicketByJti(ticketPayload.jti);
        if (!ticket || ticket.revokedAt) {
          return res.json({
            result: "DENIED",
            reason: "Invalid or revoked ticket",
          });
        }
      } else if (mode === "staff" && ticketQR && gateId) {
        // Mode B: Staff scans attendee ticket
        method = "TICKET_QR";
        
        const ticketPayload = verifyTicketQR(ticketQR);
        eventId = ticketPayload.evt;
        attendeeId = ticketPayload.sub;
        finalGateId = gateId;

        // Verify ticket
        const ticket = await storage.getTicketByJti(ticketPayload.jti);
        if (!ticket || ticket.revokedAt) {
          return res.json({
            result: "DENIED",
            reason: "Invalid or revoked ticket",
          });
        }
      } else {
        return res.status(400).json({ error: "Invalid check-in mode" });
      }

      // Anti-duplication check with Redis
      const now = Date.now();
      const bucketTs = Math.floor(now / 10000) * 10000; // 10-second bucket
      const lockKey = `checkin:${eventId}:${attendeeId}:${bucketTs}`;

      const isLocked = await redis.setnx(lockKey, "1");
      if (!isLocked) {
        // Duplicate detected
        const checkin = await storage.createCheckin({
          eventId,
          attendeeId,
          gateId: finalGateId,
          method,
          result: "DUP",
          deviceId: req.headers["user-agent"],
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });

        emitUpdate(eventId, { type: "checkin", data: checkin });

        return res.json({
          result: "DUP",
          reason: "Duplicate check-in attempt",
          timestamp: new Date().toISOString(),
        });
      }

      // Set TTL on lock
      await redis.expire(lockKey, 10);

      // Create successful check-in
      const checkin = await storage.createCheckin({
        eventId,
        attendeeId,
        gateId: finalGateId,
        method,
        result: "OK",
        deviceId: req.headers["user-agent"],
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      const attendee = await storage.getAttendee(attendeeId);
      const gate = await storage.getGate(finalGateId);

      emitUpdate(eventId, { type: "checkin", data: { ...checkin, attendee, gate } });

      res.json({
        result: "OK",
        attendee,
        gate,
        timestamp: checkin.timestamp,
      });
    } catch (error: any) {
      console.error("Check-in error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============= METRICS & ANALYTICS =============

  // Event metrics summary
  app.get("/api/events/:eventId/metrics", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { eventId } = req.params;
      const metrics = await storage.getEventMetrics(eventId);
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Gate metrics
  app.get("/api/events/:eventId/gates/metrics", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { eventId } = req.params;
      const metrics = await storage.getGateMetrics(eventId);
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Recent check-ins
  app.get("/api/events/:eventId/checkins", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { eventId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const checkins = await storage.getCheckinsByEvent(eventId, limit);
      
      // Enrich with attendee and gate data
      const enriched = await Promise.all(
        checkins.map(async (checkin) => {
          const attendee = await storage.getAttendee(checkin.attendeeId);
          const gate = await storage.getGate(checkin.gateId);
          return { ...checkin, attendee, gate };
        })
      );

      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============= ADMIN ROUTES =============

  // Get all events
  app.get("/api/events", authMiddleware, requireRole("ADMIN", "ORGANIZER"), async (req: AuthRequest, res: Response) => {
    try {
      const events = await storage.getAllEvents();
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create event
  app.post("/api/events", authMiddleware, requireRole("ADMIN", "ORGANIZER"), async (req: AuthRequest, res: Response) => {
    try {
      const event = await storage.createEvent(req.body);
      res.json(event);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get gates for event
  app.get("/api/events/:eventId/gates", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { eventId } = req.params;
      const gates = await storage.getGatesByEvent(eventId);
      res.json(gates);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create gate
  app.post("/api/gates", authMiddleware, requireRole("ADMIN", "ORGANIZER"), async (req: AuthRequest, res: Response) => {
    try {
      const gate = await storage.createGate(req.body);
      res.json(gate);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Toggle gate status
  app.patch("/api/gates/:gateId/status", authMiddleware, requireRole("ADMIN", "ORGANIZER"), async (req: AuthRequest, res: Response) => {
    try {
      const { gateId } = req.params;
      const { isActive } = req.body;
      await storage.updateGateStatus(gateId, isActive);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
