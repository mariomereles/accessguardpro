// Rotating ticket QR: AG1.<jti>.<30 s window>.<truncated HMAC-SHA256>, derived on the device from
// the per-ticket secret. Mirrors server/crypto.ts (generateDynamicTicketCode).
export const QR_WINDOW_SECONDS = 30;

function b64urlToBytes(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function windowCounter(at: number = Date.now()): number {
  return Math.floor(at / 1000 / QR_WINDOW_SECONDS);
}

export function secondsLeftInWindow(at: number = Date.now()): number {
  return QR_WINDOW_SECONDS - (Math.floor(at / 1000) % QR_WINDOW_SECONDS);
}

export async function dynamicTicketCode(secret: string, jti: string, at: number = Date.now()): Promise<string> {
  const counter = windowCounter(at);
  const key = await crypto.subtle.importKey("raw", b64urlToBytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${jti}.${counter}`));
  return `AG1.${jti}.${counter}.${bytesToB64url(new Uint8Array(sig).slice(0, 16))}`;
}
