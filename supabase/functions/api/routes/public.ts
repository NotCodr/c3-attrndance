// Endpoints that do not go through the data gateway.
//
// RSVP submission is public, and check-in needs rules the generic gateway cannot
// express, so both live here with their own validation.

import { Hono } from "jsr:@hono/hono@4";
import { randomToken } from "../../_shared/crypto.ts";
import { db, isUniqueViolation } from "../../_shared/db.ts";
import { clampText, isValidEmail, normaliseEmail } from "../../_shared/http.ts";
import { hasAtLeastRole, resolveActor, roleInClub } from "../../_shared/session.ts";

export const publicRoutes = new Hono();

/**
 * Public RSVP submission. Unauthenticated by design: attendees are not users.
 *
 * Capacity, dedupe and the UMSU-required fields are all decided here. They used
 * to be decided in the browser, where two people could take the last seat and
 * the "required for grant events" rule was enforced only by the form.
 */
publicRoutes.post("/rsvp-submit", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const supabase = db();

  // Honeypot: a real browser leaves this hidden field empty. Report success so a
  // bot cannot tell it was caught.
  if (body.website) return c.json({ ok: true, status: "confirmed", rsvp_token: randomToken(8) });

  const { data: event } = await supabase.from("events").select("*").eq("id", body.event_id).maybeSingle();
  if (!event) return c.json({ error: "event_not_found", message: "Event not found." }, 404);
  if (event.status !== "published") return c.json({ error: "not_open", message: "This event is not open for RSVPs." }, 409);
  if (event.rsvp_required === false) return c.json({ error: "not_open", message: "This event does not take RSVPs." }, 409);
  if (event.ends_at && new Date(event.ends_at).getTime() < Date.now()) {
    return c.json({ error: "event_ended", message: "This event has already ended." }, 409);
  }

  const email = normaliseEmail(body.email);
  const fullName = clampText(body.full_name, 100);
  if (!fullName) return c.json({ error: "invalid_name", message: "Your name is required." }, 400);
  if (!isValidEmail(email)) return c.json({ error: "invalid_email", message: "Enter a valid email address." }, 400);

  const studentNumber = clampText(body.student_number, 20);
  const course = clampText(body.course, 120);
  // UMSU requires name, student number, course and arrival time on the
  // attendance record for grant-funded events, so refuse an RSVP that could not
  // appear on a compliant one.
  if (event.is_grant_funded && (!studentNumber || !course)) {
    return c.json({ error: "missing_grant_fields", message: "Student number and course are required for this event." }, 400);
  }

  const fields = {
    full_name: fullName,
    student_number: studentNumber,
    course,
    university: clampText(body.university, 120),
    dietary_requirements: event.collect_dietary ? clampText(body.dietary_requirements, 300) : null,
    accessibility_requirements: event.collect_accessibility ? clampText(body.accessibility_requirements, 300) : null,
  };

  const seatStatus = async (): Promise<"confirmed" | "waitlisted"> => {
    if (!event.capacity) return "confirmed";
    const { count } = await supabase.from("rsvps")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id).eq("status", "confirmed");
    return (count || 0) >= event.capacity ? "waitlisted" : "confirmed";
  };

  const { data: existing } = await supabase.from("rsvps")
    .select("*").eq("event_id", event.id).eq("email", email).maybeSingle();

  if (existing) {
    const status = existing.status === "cancelled" ? await seatStatus() : existing.status;
    const { data: updated } = await supabase.from("rsvps")
      .update({ ...fields, status }).eq("id", existing.id).select().single();
    return c.json({ ok: true, status: updated.status, rsvp_token: existing.rsvp_token, updated: true });
  }

  const rsvpToken = randomToken(24);
  const { data: created, error } = await supabase.from("rsvps").insert({
    event_id: event.id, club_id: event.club_id, email,
    ...fields, status: await seatStatus(), rsvp_token: rsvpToken,
  }).select().single();

  // Someone submitted the same address twice at once; the unique index caught
  // the loser. Return the existing row rather than an error.
  if (isUniqueViolation(error)) {
    const { data: row } = await supabase.from("rsvps")
      .select("*").eq("event_id", event.id).eq("email", email).maybeSingle();
    return c.json({ ok: true, status: row?.status || "confirmed", rsvp_token: row?.rsvp_token, updated: true });
  }
  if (error) throw new Error(error.message);

  // Re-check after the write. Two submissions for the last seat can both read
  // "space available" before either commits; ordering the confirmed rows by
  // creation time afterwards settles it, so the later one moves to the waitlist
  // instead of overfilling the room.
  if (event.capacity && created.status === "confirmed") {
    const { data: confirmed } = await supabase.from("rsvps")
      .select("id").eq("event_id", event.id).eq("status", "confirmed")
      .order("created_date", { ascending: true });
    const index = (confirmed || []).findIndex((r) => r.id === created.id);
    if (index >= 0 && index >= event.capacity) {
      await supabase.from("rsvps").update({ status: "waitlisted" }).eq("id", created.id);
      return c.json({ ok: true, status: "waitlisted", rsvp_token: rsvpToken });
    }
  }

  return c.json({ ok: true, status: created.status, rsvp_token: rsvpToken });
});

/**
 * Records attendance at the door.
 *
 * Outside the generic gateway because the duplicate check and the write must be
 * one operation: attendance counts feed the UMSU acquittal, so a double scan is
 * a compliance problem rather than a cosmetic one. The unique index on
 * (event_id, rsvp_id) is what actually enforces it, and a violation is reported
 * as a friendly "already checked in" rather than an error.
 *
 * Accepts an RSVP token (QR), an RSVP id (manual lookup), or raw details (walk-in).
 */
publicRoutes.post("/check-in", async (c) => {
  const actor = await resolveActor(c.req.raw);
  if (!actor) return c.json({ error: "unauthenticated", message: "Sign in to continue." }, 401);

  const body = await c.req.json().catch(() => ({}));
  const supabase = db();

  const { data: event } = await supabase.from("events").select("*").eq("id", body.event_id).maybeSingle();
  if (!event) return c.json({ error: "event_not_found", message: "Event not found." }, 404);
  if (!hasAtLeastRole(roleInClub(actor, event.club_id), "scanner")) {
    return c.json({ error: "forbidden", message: "You do not have scanner access for this club." }, 403);
  }
  if (event.status !== "published") {
    return c.json({ error: "not_published", message: "This event is not published." }, 409);
  }

  let rsvp: Record<string, any> | null = null;
  if (body.rsvp_token) {
    const { data } = await supabase.from("rsvps").select("*")
      .eq("event_id", event.id).eq("rsvp_token", String(body.rsvp_token)).maybeSingle();
    if (!data) return c.json({ error: "invalid_qr", message: "That QR code is not valid for this event." }, 404);
    rsvp = data;
  } else if (body.rsvp_id) {
    const { data } = await supabase.from("rsvps").select("*").eq("id", body.rsvp_id).maybeSingle();
    if (!data || data.event_id !== event.id) return c.json({ error: "not_found", message: "RSVP not found." }, 404);
    rsvp = data;
  }

  const fullName = rsvp ? rsvp.full_name : clampText(body.full_name, 100);
  if (!fullName) return c.json({ error: "invalid_name", message: "A name is required." }, 400);

  const studentNumber = rsvp ? rsvp.student_number : clampText(body.student_number, 20);
  const course = rsvp ? rsvp.course : clampText(body.course, 120);
  if (event.is_grant_funded && (!studentNumber || !course)) {
    return c.json({ error: "missing_grant_fields", message: "Student number and course are required for this event." }, 400);
  }

  const method = ["walk_in_add", "manual_lookup", "qr_scan"].includes(body.method) ? body.method : "qr_scan";

  const { data: checkIn, error } = await supabase.from("check_ins").insert({
    event_id: event.id,
    club_id: event.club_id,
    rsvp_id: rsvp?.id ?? null,
    full_name: fullName,
    email: rsvp ? rsvp.email : (normaliseEmail(body.email) || null),
    student_number: studentNumber,
    course,
    university: rsvp ? rsvp.university : clampText(body.university, 120),
    checked_in_at: new Date().toISOString(),
    checked_in_by_email: actor.user.email,
    method,
  }).select().single();

  if (isUniqueViolation(error) && rsvp) {
    const { data: already } = await supabase.from("check_ins")
      .select("checked_in_at").eq("event_id", event.id).eq("rsvp_id", rsvp.id).maybeSingle();
    return c.json({
      ok: true, duplicate: true,
      full_name: rsvp.full_name,
      checked_in_at: already?.checked_in_at,
    });
  }
  if (error) throw new Error(error.message);

  return c.json({ ok: true, duplicate: false, full_name: fullName, checked_in_at: checkIn.checked_in_at });
});
