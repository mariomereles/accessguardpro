// Security / anti-fraud regression tests. They start the real server against a Postgres
// database whose schema is already applied (npm run db:push) and talk to it over HTTP.
//   DATABASE_URL=postgres://... npm test
import "./env";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import postgres from "postgres";
import { io } from "socket.io-client";
import { hashPassword, generateDynamicTicketCode, generateTicketQR } from "../server/crypto";

const PORT = 5650;
const BASE = `http://localhost:${PORT}`;
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("Set DATABASE_URL (or TEST_DATABASE_URL) to run the tests");
const sql = postgres(DATABASE_URL, { ssl: false });
const run = crypto.randomBytes(4).toString("hex");

let server: ChildProcess;
let adminToken = "", staffToken = "", userToken = "", userRefresh = "";
let orgA = "", orgB = "", eventB = "", gateB = "";
let organizerToken = "", orgAdminToken = "", staffBToken = "";
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
    env: { ...process.env, DATABASE_URL, PORT: String(PORT), NODE_ENV: "development", REDIS_URL: "", METRICS_TOKEN: "test-metrics-token" },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }

  const pw = "Admin-pass-123";
  const hash = await hashPassword(pw);
  // Two tenants. `admin` is a platform administrator (no organization); the rest belong to org A or B.
  [{ id: orgA }] = await sql`insert into organizations (name) values (${`A-${run}`}) returning id`;
  [{ id: orgB }] = await sql`insert into organizations (name) values (${`B-${run}`}) returning id`;
  await sql`insert into users (email, password_hash, role, status, org_id) values
    (${`admin${run}@test.local`}, ${hash}, 'ADMIN', 'ACTIVE', null),
    (${`staff${run}@test.local`}, ${hash}, 'STAFF', 'ACTIVE', ${orgA}),
    (${`organizer${run}@test.local`}, ${hash}, 'ORGANIZER', 'ACTIVE', ${orgA}),
    (${`orgadmin${run}@test.local`}, ${hash}, 'ADMIN', 'ACTIVE', ${orgA}),
    (${`staffb${run}@test.local`}, ${hash}, 'STAFF', 'ACTIVE', ${orgB})`;
  adminToken = (await login(`admin${run}@test.local`, pw)).accessToken;
  staffToken = (await login(`staff${run}@test.local`, pw)).accessToken;
  organizerToken = (await login(`organizer${run}@test.local`, pw)).accessToken;
  orgAdminToken = (await login(`orgadmin${run}@test.local`, pw)).accessToken;
  staffBToken = (await login(`staffb${run}@test.local`, pw)).accessToken;
  assert.ok(adminToken && staffToken && organizerToken && orgAdminToken && staffBToken, "seed users must be able to log in");

  const mkEvent = (name: string, org: string) => call("POST", "/api/events", { token: adminToken, body: { name: `${name}-${run}`, venue: "V", startsAt: "2030-01-01T10:00:00Z", endsAt: "2030-01-01T18:00:00Z", status: "ACTIVE", orgId: org } });
  const ev = await mkEvent("T", orgA);
  const ev2 = await mkEvent("T2", orgA);
  const evB = await mkEvent("TB", orgB);
  eventId = ev.json.id; otherEventId = ev2.json.id; eventB = evB.json.id;
  const gate = async (evt: string, extra: object) => (await call("POST", "/api/gates", { token: adminToken, body: { eventId: evt, location: "L", ...extra } })).json.id;
  gateOpen = await gate(eventId, { name: "open", isActive: true });
  gateClosed = await gate(eventId, { name: "closed", isActive: false });
  gateLimited = await gate(eventId, { name: "limited", isActive: true, capacityType: "limited", capacity: 1 });
  gateOtherEvent = await gate(otherEventId, { name: "other", isActive: true });
  gateB = await gate(eventB, { name: "b", isActive: true });

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

// ---------------------------------------------------------------- rotating QR & fraud controls

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(fn: () => Promise<T | undefined | false>, ms = 5000): Promise<T | undefined> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v as T;
    await wait(150);
  }
}
const scanCode = (code: string, gateId: string, token = staffToken) =>
  call("POST", "/api/checkins", { token, body: { mode: "staff", ticketQR: code, gateId } });

test("ticket QR is a short rotating code derived from a per-ticket secret", async () => {
  const a = await attendee(eventId, "dyn");
  assert.ok(a.ticket.secret && a.ticket.qrCode.startsWith("AG1."));
  assert.ok(a.ticket.qrCode.length < 80, "short enough for an easy-to-scan QR");
  // a code the phone would compute from the secret works
  const fresh = generateDynamicTicketCode(a.ticket.secret, a.ticket.jti);
  assert.equal((await scanCode(fresh, gateOpen)).json.result, "OK");
});

test("rotating codes reject tampering, stale codes and static QR images", async () => {
  const a = await attendee(eventId, "stale");
  const { secret, jti } = a.ticket;
  const old = generateDynamicTicketCode(secret, jti, Date.now() - 5 * 60_000);
  assert.equal((await scanCode(old, gateOpen)).json.result, "DENIED", "screenshot older than a few minutes");
  const future = generateDynamicTicketCode(secret, jti, Date.now() + 5 * 60_000);
  assert.equal((await scanCode(future, gateOpen)).json.result, "DENIED", "pre-computed future code");
  const forged = generateDynamicTicketCode("A".repeat(43), jti);
  assert.equal((await scanCode(forged, gateOpen)).json.result, "DENIED", "wrong secret");
  const parts = a.ticket.qrCode.split(".");
  assert.equal((await scanCode([parts[0], parts[1], Number(parts[2]) + 1, parts[3]].join("."), gateOpen)).json.result, "DENIED", "counter changed, mac kept");
  const staticJwt = generateTicketQR(a.attendee.id, eventId, a.attendee.id, jti);
  assert.equal((await scanCode(staticJwt, gateOpen)).json.result, "DENIED", "static JWT for a rotating ticket");
});

test("gates can restrict which ticket types may enter", async () => {
  const vipOnly = (await call("POST", "/api/gates", { token: adminToken, body: { eventId, name: "vip", location: "L", isActive: true, allowedTicketTypes: ["VIP"] } })).json.id;
  const general = await attendee(eventId, "typerule");
  assert.equal((await staffScan(general, vipOnly)).json.result, "DENIED");
  await sql`update attendees set ticket_type = 'VIP' where id = ${general.attendee.id}`;
  assert.equal((await staffScan(general, vipOnly)).json.result, "OK");
});

test("the same person cannot register twice with another email alias or document format", async () => {
  await attendee(eventId, "ident");
  const body = (extra: object) => ({ fullName: "Dup", email: `other${run}@x.com`, phone: "555123", docType: "DNI", docNumber: "99ident", ...extra });
  assert.equal((await call("POST", `/api/events/${eventId}/register`, { body: body({ docNumber: "99-IDENT" }) })).status, 400, "same document, different formatting");
  assert.equal((await call("POST", `/api/events/${eventId}/register`, { body: body({ email: `ident${run}+promo@example.com`, docNumber: "5551111" }) })).status, 400, "plus alias of the same mailbox");
});

test("a ticket used at two gates raises a fraud alert", async () => {
  const gate2 = (await call("POST", "/api/gates", { token: adminToken, body: { eventId, name: "g2", location: "L", isActive: true } })).json.id;
  const a = await attendee(eventId, "shared");
  assert.equal((await staffScan(a, gateOpen)).json.result, "OK");
  assert.equal((await staffScan(a, gate2)).json.result, "DUP");
  const alert = await until(async () => {
    const r = await call("GET", `/api/events/${eventId}/alerts`, { token: adminToken });
    return r.json.find((x: any) => x.type === "DUP_OTHER_GATE");
  });
  assert.ok(alert, "DUP_OTHER_GATE alert");
  assert.equal(alert.severity, "high");
  assert.equal((await call("GET", `/api/events/${eventId}/alerts`, { token: staffToken })).status, 403, "alerts are for managers");
});

test("a burst of rejected scans from one account raises an alert", async () => {
  for (let i = 0; i < 6; i++) await scanCode(`AG1.nonexistent${i}.1.abc`, gateOpen);
  const alert = await until(async () => {
    const r = await call("GET", `/api/events/${eventId}/alerts`, { token: adminToken });
    return r.json.find((x: any) => x.type === "RAPID_DENIALS");
  });
  assert.ok(alert, "RAPID_DENIALS alert");
});

test("managers can revoke a ticket and end an event", async () => {
  const a = await attendee(eventId, "revoke");
  assert.equal((await call("POST", `/api/attendees/${a.attendee.id}/revoke`, { token: staffToken })).status, 403);
  const r = await call("POST", `/api/attendees/${a.attendee.id}/revoke`, { token: adminToken });
  assert.equal(r.json.revoked, 1);
  assert.equal((await staffScan(a, gateOpen)).json.result, "DENIED");

  const b = await attendee(otherEventId, "ending");
  const g = (await call("POST", "/api/gates", { token: adminToken, body: { eventId: otherEventId, name: "og", location: "L", isActive: true } })).json.id;
  await call("PATCH", `/api/events/${otherEventId}/status`, { token: adminToken, body: { status: "ENDED" } });
  assert.equal((await staffScan(b, g)).json.result, "DENIED", "ended event admits nobody");
  await call("PATCH", `/api/events/${otherEventId}/status`, { token: adminToken, body: { status: "ACTIVE" } });
  assert.equal((await staffScan(b, g)).json.result, "OK");
});

test("audit log is hash-chained and tampering is detected", async () => {
  await login(`admin${run}@test.local`, "Admin-pass-123"); // writes a LOGIN row
  await wait(500);
  const ok = await call("GET", "/api/audit/verify", { token: adminToken });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.valid, true, JSON.stringify(ok.json));
  assert.ok(ok.json.checked > 5);
  assert.equal((await call("GET", "/api/audit/verify", { token: staffToken })).status, 403);

  const [victim] = await sql`select seq, metadata from audit_logs where hash is not null order by seq desc offset 2 limit 1`;
  await sql`update audit_logs set metadata = 'tampered' where seq = ${victim.seq}`;
  const bad = await call("GET", "/api/audit/verify", { token: adminToken });
  assert.equal(bad.json.valid, false);
  assert.equal(Number(bad.json.brokenAtSeq), Number(victim.seq));
  await sql`update audit_logs set metadata = ${victim.metadata} where seq = ${victim.seq}`;
  assert.equal((await call("GET", "/api/audit/verify", { token: adminToken })).json.valid, true, "restored");
});

test("security-relevant actions are audited", async () => {
  const actions = (await sql`select distinct action from audit_logs`).map((r) => r.action);
  for (const a of ["LOGIN", "LOGIN_FAILED", "REGISTER", "EVENT_CREATED", "GATE_CREATED", "CHECKIN_DENIED", "TICKET_REVOKED", "FRAUD_ALERT"]) {
    assert.ok(actions.includes(a), `missing audit action ${a}`);
  }
});

// ---------------------------------------------------------------- multi-tenancy

test("organizations are isolated from each other", async () => {
  // org A staff cannot see org B's event data, org B staff cannot see org A's
  for (const path of ["metrics", "checkins", "timeseries", "gates", "gates/metrics"]) {
    assert.equal((await call("GET", `/api/events/${eventB}/${path}`, { token: staffToken })).status, 404, `A -> B ${path}`);
    assert.equal((await call("GET", `/api/events/${eventId}/${path}`, { token: staffBToken })).status, 404, `B -> A ${path}`);
  }
  assert.equal((await call("GET", `/api/events/${eventId}/metrics`, { token: staffToken })).status, 200);
  assert.equal((await call("GET", `/api/events/${eventB}/metrics`, { token: adminToken })).status, 200, "platform admin sees every tenant");
  // listings are scoped
  const gatesA = (await call("GET", "/api/gates", { token: organizerToken })).json;
  assert.ok(gatesA.length > 0 && gatesA.every((g: any) => g.eventId !== eventB), "organizer gate list excludes org B");
  assert.ok((await call("GET", "/api/gates", { token: adminToken })).json.some((g: any) => g.eventId === eventB));
  const eventsA = (await call("GET", "/api/events", { token: organizerToken })).json;
  assert.ok(eventsA.some((e: any) => e.id === eventId) && !eventsA.some((e: any) => e.id === eventB));
  const mine = (await call("GET", "/api/me/events", { token: staffBToken })).json;
  assert.deepEqual(mine.map((e: any) => e.id), [eventB]);
});

test("staff cannot admit people to another organization's event", async () => {
  const a = await attendee(eventId, "xtenant");
  assert.equal((await staffScan(a, gateOpen, staffBToken)).json.result, "DENIED");
  // and cannot manage another organization's resources
  assert.equal((await call("POST", "/api/gates", { token: organizerToken, body: { eventId: eventB, name: "x", location: "L" } })).status, 404);
  assert.equal((await call("PATCH", `/api/gates/${gateB}/status`, { token: organizerToken, body: { isActive: false } })).status, 404);
  assert.equal((await call("GET", `/api/gates/${gateB}/qr`, { token: staffToken })).status, 404);
  assert.equal((await call("POST", `/api/attendees/${a.attendee.id}/revoke`, { token: staffBToken })).status, 403);
  const own = await call("PATCH", `/api/events/${eventId}/status`, { token: orgAdminToken, body: { status: "ACTIVE" } });
  assert.equal(own.status, 200, "own organization is fine");
});

test("organizers create events inside their own organization", async () => {
  const r = await call("POST", "/api/events", { token: organizerToken, body: { name: `Own-${run}`, venue: "V", startsAt: "2030-02-01T10:00:00Z", endsAt: "2030-02-01T18:00:00Z", status: "ACTIVE", orgId: orgB } });
  assert.equal(r.status, 200);
  assert.equal(r.json.orgId, orgA, "orgId in the body is ignored for non-platform users");
});

test("only platform administrators manage organizations; org admins manage their own users", async () => {
  assert.equal((await call("POST", "/api/orgs", { token: orgAdminToken, body: { name: `Nope-${run}` } })).status, 403);
  assert.equal((await call("GET", "/api/orgs", { token: orgAdminToken })).status, 403);
  assert.equal((await call("GET", "/api/orgs", { token: staffToken })).status, 403);
  const created = await call("POST", "/api/orgs", { token: adminToken, body: { name: `New-${run}` } });
  assert.equal(created.status, 200);
  assert.equal((await call("POST", "/api/orgs", { token: adminToken, body: { name: `New-${run}` } })).status, 400, "duplicate name");

  const pw = "A-long-password-1";
  const weak = await call("POST", "/api/users", { token: orgAdminToken, body: { email: `weak${run}@t.local`, password: "short", role: "STAFF" } });
  assert.equal(weak.status, 400);
  const u = await call("POST", "/api/users", { token: orgAdminToken, body: { email: `crew${run}@t.local`, password: pw, role: "STAFF", orgId: orgB } });
  assert.equal(u.status, 200);
  assert.equal(u.json.orgId, orgA, "org admin cannot place users in another organization");
  assert.ok(!("passwordHash" in u.json));
  assert.equal((await call("POST", "/api/users", { token: staffToken, body: { email: `x${run}@t.local`, password: pw, role: "STAFF" } })).status, 403);
  const platform = await call("POST", "/api/users", { token: adminToken, body: { email: `lead${run}@t.local`, password: pw, role: "ORGANIZER", orgId: orgB } });
  assert.equal(platform.json.orgId, orgB);
  assert.equal((await call("POST", "/api/users", { token: adminToken, body: { email: `nobody${run}@t.local`, password: pw, role: "STAFF" } })).status, 400, "staff need an organization");

  const listA = (await call("GET", "/api/users", { token: orgAdminToken })).json;
  assert.ok(listA.length > 0 && listA.every((x: any) => x.orgId === orgA));

  // suspending a user ends their sessions immediately
  const session = await login(`crew${run}@t.local`, pw);
  assert.equal((await call("PATCH", `/api/users/${u.json.id}/status`, { token: orgAdminToken, body: { status: "SUSPENDED" } })).status, 200);
  assert.equal((await call("POST", "/api/auth/refresh", { body: { refreshToken: session.refreshToken } })).status, 401);
  assert.equal((await call("POST", "/api/auth/login", { body: { email: `crew${run}@t.local`, password: pw } })).status, 401);
  assert.equal((await call("PATCH", `/api/users/${platform.json.id}/status`, { token: orgAdminToken, body: { status: "SUSPENDED" } })).status, 404, "other organization's user");
});

// ---------------------------------------------------------------- sessions

test("refresh tokens rotate, reuse revokes the session, logout revokes it", async () => {
  const email = `sess${run}@test.local`;
  await register(email);
  const s1 = await login(email, "password123");
  const r1 = await call("POST", "/api/auth/refresh", { body: { refreshToken: s1.refreshToken } });
  assert.equal(r1.status, 200);
  assert.notEqual(r1.json.refreshToken, s1.refreshToken, "a new refresh token is issued");
  // the retired token was used long ago (outside the race grace window) -> theft: whole family revoked
  await sql`update refresh_tokens set revoked_at = now() - interval '1 minute' where user_id = (select id from users where email = ${email}) and revoked_at is not null`;
  assert.equal((await call("POST", "/api/auth/refresh", { body: { refreshToken: s1.refreshToken } })).status, 401, "reuse rejected");
  assert.equal((await call("POST", "/api/auth/refresh", { body: { refreshToken: r1.json.refreshToken } })).status, 401, "descendant revoked too");

  const s2 = await login(email, "password123");
  assert.equal((await call("POST", "/api/auth/logout", { body: { refreshToken: s2.refreshToken } })).status, 200);
  assert.equal((await call("POST", "/api/auth/refresh", { body: { refreshToken: s2.refreshToken } })).status, 401, "logged-out session");
  assert.equal((await call("POST", "/api/auth/logout", { body: { refreshToken: "garbage" } })).status, 200, "logout never fails");
});

// ---------------------------------------------------------------- retention, health, metrics, startup

test("attendee data can be anonymized only after the event is over, by its own organization", async () => {
  const evId = (await call("POST", "/api/events", { token: adminToken, body: { name: `Gdpr-${run}`, venue: "V", startsAt: "2030-03-01T10:00:00Z", endsAt: "2030-03-01T18:00:00Z", status: "ACTIVE", orgId: orgA } })).json.id;
  const a = await attendee(evId, "gdpr");
  assert.equal((await call("POST", `/api/events/${evId}/anonymize`, { token: organizerToken })).status, 409, "event still active");
  await call("PATCH", `/api/events/${evId}/status`, { token: organizerToken, body: { status: "ENDED" } });
  assert.equal((await call("POST", `/api/events/${evId}/anonymize`, { token: staffToken })).status, 403);
  assert.equal((await call("POST", `/api/events/${evId}/anonymize`, { token: staffBToken })).status, 403);
  const done = await call("POST", `/api/events/${evId}/anonymize`, { token: organizerToken });
  assert.equal(done.json.anonymized, 1);
  const [row] = await sql`select full_name, email, phone, doc_number from attendees where id = ${a.attendee.id}`;
  assert.equal(row.full_name, "Anonymized");
  assert.ok(row.email.endsWith("@anonymized.invalid") && !/gdpr/.test(row.email));
  assert.ok(!/99gdpr/.test(row.doc_number) && row.phone === "anonymized");
  assert.equal((await call("POST", `/api/events/${evId}/anonymize`, { token: organizerToken })).json.anonymized, 0, "idempotent");
});

test("health checks the database; metrics are token-protected", async () => {
  assert.deepEqual((await call("GET", "/health")).json, { status: "ok" });
  const noToken = await fetch(`${BASE}/metrics`);
  assert.equal(noToken.status, 401);
  const wrong = await fetch(`${BASE}/metrics`, { headers: { authorization: "Bearer nope" } });
  assert.equal(wrong.status, 401);
  const ok = await fetch(`${BASE}/metrics`, { headers: { authorization: "Bearer test-metrics-token" } });
  assert.equal(ok.status, 200);
  const text = await ok.text();
  assert.match(text, /http_requests_total\{/);
  assert.match(text, /checkins_total\{result="OK"\}/);
  assert.ok(!/@|password/i.test(text), "no personal data in metrics");
});

test("production refuses to start without JWT keys unless explicitly allowed", () => {
  const run1 = (extra: Record<string, string>) =>
    spawnSync(process.execPath, ["--import", "tsx", "server/index.ts"], {
      env: { ...process.env, JWT_PRIVATE_KEY: "", JWT_PUBLIC_KEY: "", NODE_ENV: "production", PORT: "5651", DATABASE_URL, ...extra },
      encoding: "utf8",
      timeout: 8000,
    });
  const strict = run1({});
  assert.notEqual(strict.status, 0);
  assert.match(strict.stderr, /JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be set in production/);
  const bad = run1({ JWT_PRIVATE_KEY: "not-a-key", JWT_PUBLIC_KEY: "not-a-key" });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /not valid PEM keys/);
});

test("attendee list is for managers of the event's organization, searchable, paginated and without sensitive fields", async () => {
  const tag = `lst${run}`;
  const a1 = await attendee(eventId, `${tag}a`);
  await attendee(eventId, `${tag}b`);
  assert.equal((await staffScan(a1, gateOpen)).json.result, "OK");

  assert.equal((await call("GET", `/api/events/${eventId}/attendees`, { token: staffToken })).status, 403, "staff are not managers");
  assert.equal((await call("GET", `/api/events/${eventId}/attendees`, { token: userToken })).status, 403);
  assert.equal((await call("GET", `/api/events/${eventB}/attendees`, { token: organizerToken })).status, 404, "other organization");

  const found = await call("GET", `/api/events/${eventId}/attendees?q=${tag}`, { token: organizerToken });
  assert.equal(found.status, 200);
  assert.equal(found.json.total, 2);
  assert.ok(!/phone|docNumber|doc_number|passwordHash|secret/i.test(JSON.stringify(found.json)));
  const entered = found.json.items.find((x: any) => x.id === a1.attendee.id);
  assert.equal(entered.entered, true);
  assert.equal(found.json.items.find((x: any) => x.id !== a1.attendee.id).entered, false);

  const page1 = await call("GET", `/api/events/${eventId}/attendees?q=${tag}&limit=1&offset=0`, { token: orgAdminToken });
  const page2 = await call("GET", `/api/events/${eventId}/attendees?q=${tag}&limit=1&offset=1`, { token: orgAdminToken });
  assert.equal(page1.json.items.length, 1);
  assert.equal(page2.json.items.length, 1);
  assert.notEqual(page1.json.items[0].id, page2.json.items[0].id);
  assert.equal(page1.json.total, 2);

  // wildcard characters are literal, not patterns
  assert.equal((await call("GET", `/api/events/${eventId}/attendees?q=%25`, { token: organizerToken })).json.total, 0);

  await call("POST", `/api/attendees/${a1.attendee.id}/revoke`, { token: organizerToken });
  const after = await call("GET", `/api/events/${eventId}/attendees?q=${tag}a`, { token: organizerToken });
  assert.equal(after.json.items[0].revoked, true);
});
