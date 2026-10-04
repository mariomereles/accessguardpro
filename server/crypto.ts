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

const isProduction = process.env.NODE_ENV === "production";
const allowEphemeral = process.env.ALLOW_EPHEMERAL_JWT_KEYS === "true";

function loadKeys(): { privateKey: string; publicKey: string } {
  const priv = normalizePem(process.env.JWT_PRIVATE_KEY);
  const pub = normalizePem(process.env.JWT_PUBLIC_KEY);
  if (priv && pub) {
    try {
      crypto.createPrivateKey(priv);
      crypto.createPublicKey(pub);
      return { privateKey: priv, publicKey: pub };
    } catch (err: any) {
      if (isProduction && !allowEphemeral) {
        throw new Error(`JWT_PRIVATE_KEY/JWT_PUBLIC_KEY are not valid PEM keys: ${err.message}`);
      }
      console.error("[crypto] JWT_PRIVATE_KEY/JWT_PUBLIC_KEY are not valid PEM keys, using a temporary pair:", err.message);
    }
  } else {
    if (isProduction && !allowEphemeral) {
      throw new Error("JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be set in production (or set ALLOW_EPHEMERAL_JWT_KEYS=true to accept sessions and tickets that break on every restart)");
    }
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
  org: string | null; // organization (tenant); null = platform administrator
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

// ---- Rotating ticket QR -------------------------------------------------------
// Code format: AG1.<ticket jti>.<30 s window counter>.<truncated HMAC-SHA256>.
// The attendee's device holds the per-ticket secret and recomputes the code every 30 s, so a
// screenshot or forwarded image stops working within ~90 s. The server stores the same secret.
export const DYNAMIC_PREFIX = "AG1";
export const QR_WINDOW_SECONDS = 30;

export function generateTicketSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function dynamicMac(secret: string, jti: string, counter: number): Buffer {
  return crypto
    .createHmac("sha256", Buffer.from(secret, "base64url"))
    .update(`${jti}.${counter}`)
    .digest()
    .subarray(0, 16);
}

export function generateDynamicTicketCode(secret: string, jti: string, at: number = Date.now()): string {
  const counter = Math.floor(at / 1000 / QR_WINDOW_SECONDS);
  return `${DYNAMIC_PREFIX}.${jti}.${counter}.${dynamicMac(secret, jti, counter).toString("base64url")}`;
}

export function isDynamicTicketCode(code: string): boolean {
  return code.startsWith(`${DYNAMIC_PREFIX}.`);
}

export function parseDynamicTicketCode(code: string): { jti: string; counter: number; mac: string } | null {
  const parts = code.split(".");
  if (parts.length !== 4 || parts[0] !== DYNAMIC_PREFIX) return null;
  const counter = Number(parts[2]);
  if (!parts[1] || !Number.isInteger(counter) || !parts[3]) return null;
  return { jti: parts[1], counter, mac: parts[3] };
}

// Accepts the current window and one window either side (clock drift between phone and server)
export function verifyDynamicTicketMac(
  secret: string,
  parsed: { jti: string; counter: number; mac: string },
  at: number = Date.now(),
  drift = 1
): boolean {
  const current = Math.floor(at / 1000 / QR_WINDOW_SECONDS);
  if (Math.abs(current - parsed.counter) > drift) return false;
  const expected = dynamicMac(secret, parsed.jti, parsed.counter);
  const given = Buffer.from(parsed.mac, "base64url");
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// ---- Audit hash chain ---------------------------------------------------------
if (process.env.NODE_ENV === "production" && !process.env.HASH_CHAIN_SALT) {
  console.warn("[crypto] HASH_CHAIN_SALT is not set; audit-log integrity relies on a development default");
}
const HASH_CHAIN_SALT = process.env.HASH_CHAIN_SALT || "dev-hash-chain-salt";

export function auditHash(prevHash: string | null, fields: Array<string | null>): string {
  return crypto
    .createHmac("sha256", HASH_CHAIN_SALT)
    .update([prevHash ?? "", ...fields.map((f) => f ?? "")].join("\u001f"))
    .digest("hex");
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
export function generateAuthToken(userId: string, email: string, role: string, org: string | null = null): string {
  const payload: AuthPayload = {
    sub: userId,
    email,
    role,
    org,
    typ: "access",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 15 * 60, // 15 minutes; clients renew with the refresh token
  };

  return jwt.sign(payload, privateKey, { algorithm: "RS256" });
}

// Generate refresh token. `jti` identifies the row in refresh_tokens, `family` groups every token
// descended from one login so a whole session can be revoked together.
export const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;
export function generateRefreshToken(userId: string, jti: string, family: string): string {
  return jwt.sign(
    { sub: userId, typ: "refresh", jti, fam: family },
    privateKey,
    { algorithm: "RS256", expiresIn: REFRESH_TTL_SECONDS }
  );
}

// Verify auth token
export function verifyAuthToken(token: string): AuthPayload {
  const payload = jwt.verify(token, publicKey, { algorithms: ["RS256"] }) as AuthPayload;
  if (payload.typ !== "access") throw new Error("Not an access token");
  return payload;
}

// Verify refresh token (must be typ "refresh"; access and ticket tokens are rejected)
export function verifyRefreshToken(token: string, opts: { ignoreExpiration?: boolean } = {}): { sub: string; jti: string; fam: string } {
  const payload = jwt.verify(token, publicKey, { algorithms: ["RS256"], ...opts }) as any;
  if (payload.typ !== "refresh" || !payload.jti || !payload.fam) throw new Error("Not a refresh token");
  return { sub: payload.sub, jti: payload.jti, fam: payload.fam };
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
