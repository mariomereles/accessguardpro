import jwt from "jsonwebtoken";
import crypto from "crypto";
import argon2 from "argon2";
import QRCode from "qrcode";

// RSA key pair for JWT signing. Set JWT_PRIVATE_KEY / JWT_PUBLIC_KEY (PEM, "\\n" allowed)
// so tokens survive restarts. If they are missing or malformed, a temporary pair is
// generated at startup (tokens then stop being valid after each restart).
const normalizePem = (value?: string) =>
  value
    ?.trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n")
    .trim();

function loadKeys(): { privateKey: string; publicKey: string } {
  const priv = normalizePem(process.env.JWT_PRIVATE_KEY);
  const pub = normalizePem(process.env.JWT_PUBLIC_KEY);
  if (priv && pub) {
    try {
      crypto.createPrivateKey(priv);
      crypto.createPublicKey(pub);
      return { privateKey: priv, publicKey: pub };
    } catch (err: any) {
      console.error("[crypto] JWT_PRIVATE_KEY/JWT_PUBLIC_KEY are not valid PEM keys, using a temporary pair:", err.message);
    }
  } else {
    console.warn("[crypto] JWT keys not configured, using a temporary pair");
  }
  return crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

const { privateKey, publicKey } = loadKeys();

// HS256 secret for gate QR codes
if (process.env.NODE_ENV === "production" && !process.env.GATE_HS_SECRET_DEFAULT) {
  throw new Error("GATE_HS_SECRET_DEFAULT must be set in production");
}
const GATE_SECRET = process.env.GATE_HS_SECRET_DEFAULT || "dev-only-gate-secret-not-for-production";

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
  typ: "access";
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
  const payload: Omit<TicketPayload, "exp"> = {
    iss: "event-access-control",
    aud: "event-checkin",
    sub: attendeeId,
    evt: eventId,
    tkt: ticketId,
    typ: "ticket",
    jti,
    iat: Math.floor(Date.now() / 1000),
    // No exp: validity is decided server-side (revocation, event status), so a
    // ticket issued days before the event does not silently expire.
  };

  return jwt.sign(payload, privateKey, { algorithm: "RS256" });
}

// Verify ticket QR JWT
export function verifyTicketQR(token: string): TicketPayload {
  const payload = jwt.verify(token, publicKey, {
    algorithms: ["RS256"],
    issuer: "event-access-control",
    audience: "event-checkin",
    ignoreExpiration: true, // tickets issued before this change carry a 24h exp
  }) as TicketPayload;
  if (payload.typ !== "ticket") throw new Error("Not a ticket token");
  return payload;
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
  const payload = jwt.verify(token, GATE_SECRET, {
    algorithms: ["HS256"],
    issuer: "event-access-control",
  }) as GatePayload;
  if (payload.typ !== "gate") throw new Error("Not a gate token");
  return payload;
}

// Generate auth JWT
export function generateAuthToken(userId: string, email: string, role: string): string {
  const payload: AuthPayload = {
    sub: userId,
    email,
    role,
    typ: "access",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 15 * 60, // 15 minutes; clients renew with the refresh token
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
  const payload = jwt.verify(token, publicKey, { algorithms: ["RS256"] }) as AuthPayload;
  if (payload.typ !== "access") throw new Error("Not an access token");
  return payload;
}

// Verify refresh token (must be typ "refresh"; access and ticket tokens are rejected)
export function verifyRefreshToken(token: string): { sub: string } {
  const payload = jwt.verify(token, publicKey, { algorithms: ["RS256"] }) as any;
  if (payload.typ !== "refresh") throw new Error("Not a refresh token");
  return { sub: payload.sub };
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

// Verify password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

// Generate QR code as data URL
export async function generateQRCodeDataURL(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    margin: 1,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });
}

// Generate QR code as buffer
export async function generateQRCodeBuffer(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    errorCorrectionLevel: 'M',
    type: 'png',
    margin: 1,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });
}
