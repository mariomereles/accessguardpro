import { storage } from "./storage";

// Behavioural fraud signals computed on top of the audit log. Alerts are stored as audit rows
// (action FRAUD_ALERT, hash-chained like everything else) and pushed to staff in real time.
// They are throttled per (type, key) so one incident does not flood the dashboard.

export interface FraudAlert {
  type: "RAPID_DENIALS" | "DUP_OTHER_GATE" | "REPEATED_REUSE";
  severity: "medium" | "high";
  eventId: string | null;
  key: string; // what the alert is about (account id, attendee id...)
  message: string;
}

const THROTTLE_MS = 5 * 60 * 1000;

async function raise(alert: FraudAlert, emit: (eventId: string, payload: any) => void) {
  const entityId = `${alert.type}:${alert.key}`;
  if ((await storage.countAuditLogsSince("FRAUD_ALERT", new Date(Date.now() - THROTTLE_MS), { entityId })) > 0) return;
  await storage.createAuditLog({
    actorUserId: null,
    action: "FRAUD_ALERT",
    entity: "alert",
    entityId,
    metadata: JSON.stringify({ eventId: alert.eventId, type: alert.type, severity: alert.severity, message: alert.message }),
  } as any);
  if (alert.eventId) {
    emit(alert.eventId, { type: "alert", data: { type: alert.type, severity: alert.severity, message: alert.message } });
  }
}

// Many rejected scans from one account in a minute: QR guessing, forged codes or a stolen staff login
export async function afterDenied(
  actorUserId: string,
  eventId: string | null,
  emit: (eventId: string, payload: any) => void
) {
  const since = new Date(Date.now() - 60_000);
  const n = await storage.countAuditLogsSince("CHECKIN_DENIED", since, { actorUserId });
  if (n >= 5) {
    await raise(
      { type: "RAPID_DENIALS", severity: "high", eventId, key: actorUserId, message: `${n} rejected scans from one account in the last minute` },
      emit
    );
  }
}

// A ticket that already entered is presented again: more serious if it is at a different gate
// (the same ticket is being used by two people), or if it keeps being retried.
export async function afterDuplicate(
  attendeeId: string,
  eventId: string,
  gateId: string,
  firstEntry: { gateId: string } | undefined,
  emit: (eventId: string, payload: any) => void
) {
  if (firstEntry && firstEntry.gateId !== gateId) {
    await raise(
      { type: "DUP_OTHER_GATE", severity: "high", eventId, key: attendeeId, message: "A ticket that already entered was presented at a different gate (shared or copied ticket)" },
      emit
    );
  }
  const dups = await storage.countCheckinsSince(attendeeId, eventId, "DUP", new Date(Date.now() - 5 * 60_000));
  if (dups >= 3) {
    await raise(
      { type: "REPEATED_REUSE", severity: "medium", eventId, key: attendeeId, message: `Same ticket re-presented ${dups} times in 5 minutes` },
      emit
    );
  }
}
