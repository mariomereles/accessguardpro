// Security / anti-fraud regression tests. They start the real server against a Postgres
// database whose schema is already applied (npm run db:push) and talk to it over HTTP.
//   DATABASE_URL=postgres://... npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import postgres from "postgres";
import { io } from "socket.io-client";
import { hashPassword } from "../server/crypto";

const PORT = 5650;
const BASE = `http://localhost:${PORT}`;
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("Set DATABASE_URL (or TEST_DATABASE_URL) to run the tests");
const sql = postgres(DATABASE_URL, { ssl: false });
const run = crypto.randomBytes(4).toString("hex");

let server: ChildProcess;
let adminToken = "", staffToken = "", userToken = "", userRefresh = "";
let eventId = "", otherEventId = "";
let gateOpen = "", gateClosed = "", gateLimited = "", gateOtherEvent = "";

async function call(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await r.text();
  let json: any = text;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json };
}

const register = (email: string, password = "password123") => call("POST", "/api/auth/register", { body: { email, password } });
const login = async (email: string, password: string) => (await call("POST", "/api/auth/login", { body: { email, password } })).json;

async function attendee(evt: string, tag: string, token?: string) {
  const r = await call("POST", `/api/events/${evt}/register`, {
    token,
    body: { fullName: `=cmd ${tag}`, email: `${tag}${run}@Example.com`, phone: "555123", docType: "DNI", docNumber: `99${tag}`, ticketType: "VIP" },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json;
}
const staffScan = (t: any, gateId: string, token = staffToken) =>
  call("POST", "/api/checkins", { token, body: { mode: "staff", ticketQR: t.ticket.qrCode, gateId } });

before(async () => {
  // Run node directly (not via npx) so kill() really stops the server
  server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    env: { ...process.env, DATABASE_URL, PORT: String(PORT), NODE_ENV: "development", REDIS_URL: "" },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }

  const pw = "Admin-pass-123";
  const hash = await hashPassword(pw);
  await sql`insert into users (email, password_hash, role, status) values
    (${`admin${run}@test.local`}, ${hash}, 'ADMIN', 'ACTIVE'),
    (${`staff${run}@test.local`}, ${hash}, 'STAFF', 'ACTIVE')`;
  adminToken = (await login(`admin${run}@test.local`, pw)).accessToken;
  staffToken = (await login(`staff${run}@test.local`, pw)).accessToken;
  assert.ok(adminToken && staffToken, "seed users must be able to log in");

  const ev = await call("POST", "/api/events", { token: adminToken, body: { name: `T-${run}`, venue: "V", startsAt: "2030-01-01T10:00:00Z", endsAt: "2030-01-01T18:00:00Z", status: "ACTIVE" } });
  const ev2 = await call("POST", "/api/events", { token: adminToken, body: { name: `T2-${run}`, venue: "V", startsAt: "2030-01-01T10:00:00Z", endsAt: "2030-01-01T18:00:00Z", status: "ACTIVE" } });
  eventId = ev.json.id; otherEventId = ev2.json.id;
  const gate = async (evt: string, extra: object) => (await call("POST", "/api/gates", { token: adminToken, body: { eventId: evt, location: "L", ...extra } })).json.id;
  gateOpen = await gate(eventId, { name: "open", isActive: true });
  gateClosed = await gate(eventId, { name: "closed", isActive: false });
  gateLimited = await gate(eventId, { name: "limited", isActive: true, capacityType: "limited", capacity: 1 });
  gateOtherEvent = await gate(otherEventId, { name: "other", isActive: true });

  const u = (await register(`user${run}@test.local`)).json;
  userToken = u.accessToken; userRefresh = u.refreshToken;
});

after(async () => {
  server?.kill();
  await sql.end();
});

test("registration cannot choose a role", async () => {
  const r = await call("POST", "/api/auth/register", { body: { email: `evil${run}@test.local`, password: "password123", role: "ADMIN" } });
  assert.equal(r.json.user.role, "USER");
});

test("weak passwords are rejected", async () => {
  assert.equal((await register(`weak${run}@test.local`, "abc")).status, 400);
});

test("endpoints require authentication and the right role", async () => {
  assert.equal((await call("GET", "/api/gates")).status, 401);
  assert.equal((await call("GET", "/api/gates", { token: userToken })).status, 403);
  assert.equal((await call("GET", `/api/events/${eventId}/checkins`, { token: userToken })).status, 403);
  assert.equal((await call("GET", `/api/events/${eventId}/metrics`, { token: userToken })).status, 403);
  assert.equal((await call("POST", "/api/events", { token: userToken, body: {} })).status, 403);
  assert.equal((await call("POST", "/api/checkins", { body: { mode: "staff", ticketQR: "x", gateId: "y" } })).status, 401);
  assert.equal((await call("GET", `/api/gates/${gateOpen}/qr`)).status, 401);
});

test("token types are not interchangeable", async () => {
  assert.equal((await call("GET", "/api/events", { token: userRefresh })).status, 401, "refresh token as bearer");
  assert.equal((await call("POST", "/api/auth/refresh", { body: { refreshToken: userToken } })).status, 401, "access token as refresh");
  assert.equal((await call("POST", "/api/auth/refresh", { body: { refreshToken: userRefresh } })).status, 200);
});

test("registration forces GENERAL tickets, normalises email and rejects oversized input", async () => {
  const a = await attendee(eventId, "norm");
  assert.equal(a.attendee.ticketType, "GENERAL");
  assert.equal(a.attendee.email, `norm${run}@example.com`);
  const big = await call("POST", `/api/events/${eventId}/register`, { body: { fullName: "x".repeat(5000), email: `big${run}@x.com`, phone: "555123", docType: "DNI", docNumber: "12345" } });
  assert.equal(big.status, 400);
  const dup = await call("POST", `/api/events/${eventId}/register`, { body: { fullName: "N", email: `norm${run}@example.com`, phone: "555123", docType: "DNI", docNumber: "12345" } });
  assert.equal(dup.status, 400, "same email twice");
});

test("active events are public and expose no personal data", async () => {
  const r = await call("GET", "/api/events/active");
  assert.equal(r.status, 200);
  assert.ok(r.json.some((e: any) => e.id === eventId));
  assert.deepEqual(Object.keys(r.json[0]).sort(), ["endsAt", "id", "name", "startsAt", "venue"]);
});

test("a ticket is admitted exactly once", async () => {
  const a = await attendee(eventId, "once");
  const first = await staffScan(a, gateOpen);
  assert.equal(first.json.result, "OK");
  assert.ok(!("phone" in first.json.attendee) && !("docNumber" in first.json.attendee) && !("email" in first.json.attendee));
  assert.equal((await staffScan(a, gateOpen)).json.result, "DUP");
  assert.equal((await staffScan(a, gateOpen)).json.result, "DUP");
});

test("simultaneous scans of one ticket admit it once", async () => {
  const a = await attendee(eventId, "race");
  const results = await Promise.all([1, 2, 3, 4].map(() => staffScan(a, gateOpen)));
  assert.equal(results.filter((r) => r.json.result === "OK").length, 1);
  const [{ n }] = await sql`select count(*)::int n from checkins where attendee_id = ${a.attendee.id} and result = 'OK'`;
  assert.equal(n, 1);
});

test("check-in validates ticket, gate and event", async () => {
  const a = await attendee(eventId, "rules");
  assert.equal((await staffScan(a, gateOtherEvent)).json.result, "DENIED", "gate of another event");
  assert.equal((await staffScan(a, gateClosed)).json.result, "DENIED", "closed gate");
  const other = await attendee(otherEventId, "foreign");
  assert.equal((await staffScan(other, gateOpen)).json.result, "DENIED", "ticket of another event");
  const garbage = await call("POST", "/api/checkins", { token: staffToken, body: { mode: "staff", ticketQR: "garbage.token.here", gateId: gateOpen } });
  assert.equal(garbage.json.result, "DENIED");
  const wrongType = await call("POST", "/api/checkins", { token: staffToken, body: { mode: "staff", ticketQR: staffToken, gateId: gateOpen } });
  assert.equal(wrongType.json.result, "DENIED", "access token presented as a ticket");
  const revoked = await attendee(eventId, "revoked");
  await sql`update tickets set revoked_at = now() where attendee_id = ${revoked.attendee.id}`;
  assert.equal((await staffScan(revoked, gateOpen)).json.result, "DENIED");
  assert.equal((await staffScan(await attendee(eventId, "nouser"), gateOpen, userToken)).status, 403, "non-staff cannot use staff mode");
});

test("limited gates enforce their capacity", async () => {
  assert.equal((await staffScan(await attendee(eventId, "cap1"), gateLimited)).json.result, "OK");
  assert.equal((await staffScan(await attendee(eventId, "cap2"), gateLimited)).json.result, "DENIED");
});

test("denied attempts are recorded", async () => {
  const [{ d }] = await sql`select count(*)::int d from checkins where event_id = ${eventId} and result = 'DENIED'`;
  const [{ a }] = await sql`select count(*)::int a from audit_logs where action = 'CHECKIN_DENIED'`;
  assert.ok(d > 0 && a > 0);
});

test("gate mode only works with the holder's own ticket", async () => {
  const holderEmail = `holder${run}@test.local`;
  const holder = (await register(holderEmail)).json;
  const mine = await attendee(eventId, "holder", holder.accessToken);
  await sql`update attendees set email = ${holderEmail} where id = ${mine.attendee.id}`;
  const qr = (await call("GET", `/api/gates/${gateOpen}/qr`, { token: staffToken })).json.qrCode;
  const scan = (token: string) => call("POST", "/api/checkins", { token, body: { mode: "gate", gateQR: qr, ticketQR: mine.ticket.qrCode } });
  assert.equal((await scan(userToken)).json.result, "DENIED", "another account");
  assert.equal((await scan(holder.accessToken)).json.result, "OK", "the holder");
  const bogus = await call("POST", "/api/checkins", { token: holder.accessToken, body: { mode: "gate", gateQR: "x.y.z", ticketQR: mine.ticket.qrCode } });
  assert.equal(bogus.json.result, "DENIED");
});

test("tickets cannot be claimed by email alone", async () => {
  // victim registers anonymously; attacker signs up with the same email
  const email = `victim${run}@test.local`;
  await call("POST", `/api/events/${eventId}/register`, { body: { fullName: "Victim", email, phone: "555123", docType: "DNI", docNumber: "123456" } });
  const attacker = (await register(email)).json;
  const r = await call("GET", `/api/me/ticket?eventId=${eventId}`, { token: attacker.accessToken });
  assert.equal(r.status, 404);
});

test("lists hide personal data and are capped", async () => {
  const staffList = await call("GET", `/api/events/${eventId}/checkins?limit=100000`, { token: staffToken });
  assert.ok(staffList.json.length <= 200);
  assert.ok(!/docNumber|phone|ipAddress|userAgent|"email"/.test(JSON.stringify(staffList.json)));
  const adminList = await call("GET", `/api/events/${eventId}/checkins?limit=5`, { token: adminToken });
  assert.ok(/email/.test(JSON.stringify(adminList.json)) && !/docNumber|phone/.test(JSON.stringify(adminList.json)));
});

test("CSV export is admin-only and neutralises formulas", async () => {
  const get = (token: string) => fetch(`${BASE}/api/events/${eventId}/exports/checkins.csv`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal((await get(staffToken)).status, 403);
  const csv = await (await get(adminToken)).text();
  assert.ok(csv.includes(`"'=cmd`) && !/(^|,)"=cmd/m.test(csv));
});

test("metrics count entries once and report duplicates and denials", async () => {
  const m = (await call("GET", `/api/events/${eventId}/metrics`, { token: staffToken })).json;
  const [{ ok }] = await sql`select count(*)::int ok from checkins where event_id = ${eventId} and result = 'OK'`;
  assert.equal(m.totalCheckins, ok);
  assert.ok(m.duplicates > 0 && m.denied > 0);
});

test("suspended users cannot log in or refresh", async () => {
  const s = (await register(`susp${run}@test.local`)).json;
  await sql`update users set status = 'SUSPENDED' where email = ${`susp${run}@test.local`}`;
  assert.equal((await call("POST", "/api/auth/login", { body: { email: `susp${run}@test.local`, password: "password123" } })).status, 401);
  assert.equal((await call("POST", "/api/auth/refresh", { body: { refreshToken: s.refreshToken } })).status, 401);
});

test("real-time channel needs a staff token and carries no personal data", async () => {
  const connect = (token?: string) => new Promise<any>((resolve) => {
    const s = io(BASE, { auth: { token }, reconnection: false, transports: ["websocket"] });
    s.on("connect", () => resolve(s));
    s.on("connect_error", () => { s.close(); resolve(null); });
  });
  assert.equal(await connect(undefined), null);
  assert.equal(await connect(userToken), null);
  const s = await connect(staffToken);
  assert.ok(s, "staff can connect");
  const update = new Promise<any>((resolve) => { s.on("update", resolve); setTimeout(() => resolve(null), 5000); });
  s.emit("subscribe:event", eventId);
  await new Promise((r) => setTimeout(r, 300));
  await staffScan(await attendee(eventId, "live"), gateOpen);
  const payload = await update;
  s.close();
  assert.ok(payload, "update received");
  assert.ok(!/docNumber|phone|email/.test(JSON.stringify(payload)));
});

test("security headers are present", async () => {
  const r = await fetch(`${BASE}/health`);
  assert.ok(r.headers.get("x-content-type-options"));
  assert.equal(r.headers.get("x-powered-by"), null);
});
