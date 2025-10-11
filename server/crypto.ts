import jwt from "jsonwebtoken";
import crypto from "crypto";
import bcrypt from "bcryptjs";

// Generate RSA key pair for JWT signing (in production, load from files)
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

// HS256 secret for gate QR codes
const GATE_SECRET = process.env.GATE_HS_SECRET_DEFAULT || "change_me_in_production";

export interface TicketPayload {
  iss: string;
  aud: string;
  sub: string;
  evt: string;
  tkt: string;
  typ: "ticket";
  jti: string;
  iat: number;
  exp: number;
}

export interface GatePayload {
  iss: string;
  evt: string;
  gat: string;
  typ: "gate";
  nonce: string;
  iat: number;
  exp: number;
}

export interface AuthPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

// Generate ticket QR JWT (RS256)
export function generateTicketQR(
  attendeeId: string,
  eventId: string,
  ticketId: string,
  jti: string
): string {
  const payload: TicketPayload = {
    iss: "event-access-control",
    aud: "event-checkin",
    sub: attendeeId,
    evt: eventId,
    tkt: ticketId,
    typ: "ticket",
    jti,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
  };

  return jwt.sign(payload, privateKey, { algorithm: "RS256" });
}

// Verify ticket QR JWT
export function verifyTicketQR(token: string): TicketPayload {
  return jwt.verify(token, publicKey, {
    algorithms: ["RS256"],
    issuer: "event-access-control",
    audience: "event-checkin",
  }) as TicketPayload;
}

// Generate gate QR JWT (HS256)
export function generateGateQR(eventId: string, gateId: string, ttlSeconds: number = 60): string {
  const payload: GatePayload = {
    iss: "event-access-control",
    evt: eventId,
    gat: gateId,
    typ: "gate",
    nonce: crypto.randomBytes(16).toString("hex"),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  return jwt.sign(payload, GATE_SECRET, { algorithm: "HS256" });
}

// Verify gate QR JWT
export function verifyGateQR(token: string): GatePayload {
  return jwt.verify(token, GATE_SECRET, {
    algorithms: ["HS256"],
    issuer: "event-access-control",
  }) as GatePayload;
}

// Generate auth JWT
export function generateAuthToken(userId: string, email: string, role: string): string {
  const payload: AuthPayload = {
    sub: userId,
    email,
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 5 * 60, // 5 minutes
  };

  return jwt.sign(payload, privateKey, { algorithm: "RS256" });
}

// Generate refresh token
export function generateRefreshToken(userId: string): string {
  return jwt.sign(
    { sub: userId, typ: "refresh" },
    privateKey,
    { algorithm: "RS256", expiresIn: "7d" }
  );
}

// Verify auth token
export function verifyAuthToken(token: string): AuthPayload {
  return jwt.verify(token, publicKey, { algorithms: ["RS256"] }) as AuthPayload;
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Verify password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
