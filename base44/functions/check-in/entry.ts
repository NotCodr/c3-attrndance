import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { resolveActor, roleInClub, hasAtLeastRole } from "../../shared/session.ts";
import { clampText, fail, normaliseEmail, ok, readJson } from "../../shared/http.ts";

/**
 * Records attendance at the door.
 *
 * Kept out of the generic gateway because the duplicate check and the write must
 * happen together: attendance counts feed the UMSU grant acquittal, so a double
 * scan that inflates the number is a compliance problem, not a cosmetic one.
 *
 * Accepts either an RSVP token (QR scan), an RSVP id (manual lookup), or raw
 * details (walk-in).
 */
export default async function (req: Request): Promise<Response> {
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");

  const svc = createClientFromRequest(req).asServiceRole;
  const actor = await resolveActor(svc, req);
  if (!actor) return fail(401, "unauthenticated", "Sign in to continue.");

  const body = await readJson<any>(req);
  const event = await svc.entities.Event.get(body.event_id).catch(() => null);
  if (!event) return fail(404, "event_not_found", "Event not found.");

  if (!hasAtLeastRole(roleInClub(actor, event.club_id), "scanner")) {
    return fail(403, "forbidden", "You don't have scanner access for this club.");
  }
  if (event.status !== "published") return fail(409, "not_published", "This event isn't published.");

  let rsvp: any = null;
  if (body.rsvp_token) {
    rsvp = (await svc.entities.RSVP.filter(
      { event_id: event.id, rsvp_token: String(body.rsvp_token) },
      undefined,
      1,
    ))[0];
    if (!rsvp) return fail(404, "invalid_qr", "That QR code isn't valid for this event.");
  } else if (body.rsvp_id) {
    rsvp = await svc.entities.RSVP.get(body.rsvp_id).catch(() => null);
    if (!rsvp || rsvp.event_id !== event.id) return fail(404, "not_found", "RSVP not found.");
  }

  if (rsvp) {
    const already = (await svc.entities.CheckIn.filter(
      { event_id: event.id, rsvp_id: rsvp.id },
      undefined,
      1,
    ))[0];
    if (already) {
      return ok({
        ok: true,
        duplicate: true,
        full_name: rsvp.full_name,
        checked_in_at: already.checked_in_at,
      });
    }
  }

  const fullName = rsvp ? rsvp.full_name : clampText(body.full_name, 100);
  if (!fullName) return fail(400, "invalid_name", "A name is required.");

  const studentNumber = rsvp ? rsvp.student_number : clampText(body.student_number, 20);
  const course = rsvp ? rsvp.course : clampText(body.course, 120);
  if (event.is_grant_funded && (!studentNumber || !course)) {
    return fail(400, "missing_grant_fields", "Student number and course are required for this event.");
  }

  const checkIn = await svc.entities.CheckIn.create({
    event_id: event.id,
    club_id: event.club_id,
    rsvp_id: rsvp?.id,
    full_name: fullName,
    email: rsvp ? rsvp.email : normaliseEmail(body.email) || undefined,
    student_number: studentNumber,
    course,
    university: rsvp ? rsvp.university : clampText(body.university, 120),
    checked_in_at: new Date().toISOString(),
    checked_in_by_email: actor.user.email,
    method: body.method === "walk_in_add" || body.method === "manual_lookup" ? body.method : "qr_scan",
  });

  return ok({ ok: true, duplicate: false, full_name: fullName, checked_in_at: checkIn.checked_in_at });
}
