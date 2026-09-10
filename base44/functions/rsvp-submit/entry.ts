import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { randomToken } from "../../shared/crypto.ts";
import { clampText, fail, isValidEmail, normaliseEmail, ok, readJson } from "../../shared/http.ts";

/**
 * Public RSVP submission. Deliberately unauthenticated: attendees are not users.
 *
 * This exists as its own function rather than going through the data gateway
 * because it is the one write anonymous callers may perform, and it needs server
 * side rules the client cannot be trusted with: which fields are mandatory, and
 * whether a seat is actually available.
 */
export default async function (req: Request): Promise<Response> {
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");

  const svc = createClientFromRequest(req).asServiceRole;
  const body = await readJson<any>(req);

  // Honeypot: a real browser leaves this hidden field empty. Report success so a
  // bot cannot tell it was caught.
  if (body.website) return ok({ ok: true, status: "confirmed", rsvp_token: randomToken(8) });

  const event = await svc.entities.Event.get(body.event_id).catch(() => null);
  if (!event) return fail(404, "event_not_found", "Event not found.");
  if (event.status !== "published") return fail(409, "not_open", "This event isn't open for RSVPs.");
  if (event.rsvp_required === false) return fail(409, "not_open", "This event doesn't take RSVPs.");
  if (event.ends_at && new Date(event.ends_at).getTime() < Date.now()) {
    return fail(409, "event_ended", "This event has already ended.");
  }

  const email = normaliseEmail(body.email);
  const fullName = clampText(body.full_name, 100);
  if (!fullName) return fail(400, "invalid_name", "Your name is required.");
  if (!isValidEmail(email)) return fail(400, "invalid_email", "Enter a valid email address.");

  const studentNumber = clampText(body.student_number, 20);
  const course = clampText(body.course, 120);
  // UMSU requires name, student number, course and arrival time on the
  // attendance record for grant-funded events, so refuse to take an RSVP that
  // could not appear on a compliant one.
  if (event.is_grant_funded && (!studentNumber || !course)) {
    return fail(400, "missing_grant_fields", "Student number and course are required for this event.");
  }

  const fields = {
    full_name: fullName,
    student_number: studentNumber,
    course,
    university_name: clampText(body.university_name, 120),
    dietary_requirements: event.collect_dietary ? clampText(body.dietary_requirements, 300) : undefined,
    accessibility_requirements: event.collect_accessibility
      ? clampText(body.accessibility_requirements, 300)
      : undefined,
  };

  const existing = (await svc.entities.RSVP.filter({ event_id: event.id, email }, undefined, 1))[0];
  if (existing) {
    const revived = existing.status === "cancelled" ? await seatStatus(svc, event, null) : existing.status;
    const updated = await svc.entities.RSVP.update(existing.id, { ...fields, status: revived });
    return ok({ ok: true, status: updated.status, rsvp_token: existing.rsvp_token, updated: true });
  }

  const rsvpToken = randomToken(24);
  const created = await svc.entities.RSVP.create({
    event_id: event.id,
    club_id: event.club_id,
    email,
    ...fields,
    status: await seatStatus(svc, event, null),
    rsvp_token: rsvpToken,
  });

  // Re-check after the write. Two simultaneous submissions for the last seat can
  // both read "space available" before either has committed; ordering the
  // confirmed rows by creation time afterwards resolves that deterministically,
  // so the later one is moved to the waitlist instead of overfilling the room.
  const status = await reconcileSeat(svc, event, created);
  return ok({ ok: true, status, rsvp_token: rsvpToken });
}

async function seatStatus(svc: any, event: any, _ignored: unknown): Promise<"confirmed" | "waitlisted"> {
  if (!event.capacity) return "confirmed";
  const confirmed = await svc.entities.RSVP.filter({ event_id: event.id, status: "confirmed" });
  return confirmed.length >= event.capacity ? "waitlisted" : "confirmed";
}

async function reconcileSeat(svc: any, event: any, created: any): Promise<string> {
  if (!event.capacity || created.status !== "confirmed") return created.status;
  const confirmed = await svc.entities.RSVP.filter({ event_id: event.id, status: "confirmed" }, "created_date");
  const index = confirmed.findIndex((r: any) => r.id === created.id);
  if (index >= 0 && index >= event.capacity) {
    await svc.entities.RSVP.update(created.id, { status: "waitlisted" });
    return "waitlisted";
  }
  return "confirmed";
}
