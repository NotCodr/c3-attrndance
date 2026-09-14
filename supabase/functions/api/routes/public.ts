// Endpoints that do not go through the data gateway.
//
// RSVP submission is public, and check-in needs rules the generic gateway cannot
// express, so both live here with their own validation.

import { Hono } from "jsr:@hono/hono@4";
import { randomToken } from "../../_shared/crypto.ts";
import { db, isUniqueViolation } from "../../_shared/db.ts";
import {
  appOrigin, clampText, formatEventWhen, isValidEmail, normaliseEmail, ticketUrl,
} from "../../_shared/http.ts";
import { sendEmail, ticketEmail, waitlistPromotedEmail } from "../../_shared/email.ts";
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
    await mailTicket(c.req.raw, event, email, existing.rsvp_token, updated.status);
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
    if (row?.rsvp_token) await mailTicket(c.req.raw, event, email, row.rsvp_token, row.status);
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
      await mailTicket(c.req.raw, event, email, rsvpToken, "waitlisted");
      return c.json({ ok: true, status: "waitlisted", rsvp_token: rsvpToken });
    }
  }

  await mailTicket(c.req.raw, event, email, rsvpToken, created.status);
  return c.json({ ok: true, status: created.status, rsvp_token: rsvpToken });
});

/**
 * Emails the attendee a link back to their ticket.
 *
 * The RSVP page used to claim "Confirmation sent to ..." while sending nothing,
 * and the QR existed only on screen -- close the tab and it was gone. This makes
 * that claim true and gives them a durable way back to it.
 *
 * Failure is logged, not surfaced: the RSVP itself succeeded, and telling
 * someone their place did not register because a mail server was slow would be
 * worse than a missing email.
 */
async function mailTicket(
  req: Request, event: Record<string, any>, email: string,
  token: string, status: string,
) {
  if (status === "cancelled") return;
  const { data: club } = await db().from("clubs").select("name").eq("id", event.club_id).maybeSingle();
  const mail = ticketEmail({
    title: event.title,
    clubName: club?.name || "the club",
    whenText: formatEventWhen(event.starts_at, event.ends_at),
    location: event.location_name,
    ticketUrl: ticketUrl(appOrigin(req), token),
    waitlisted: status === "waitlisted",
  });
  const result = await sendEmail(email, mail.subject, mail.html);
  if (!result.sent) console.error("[rsvp] ticket email failed for", email, result.error);
}

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

/**
 * Looks up an RSVP by its token. Public, because attendees are not users.
 *
 * The token is a 256-bit random string that only ever reaches the person who
 * RSVPed, so it acts as the credential for this one record. The response is
 * deliberately narrow: enough to render the ticket, nothing about anyone else.
 */
publicRoutes.post("/rsvp-lookup", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return c.json({ error: "invalid_token", message: "This ticket link is not valid." }, 400);

  const supabase = db();
  const { data: rsvp } = await supabase.from("rsvps")
    .select("id,event_id,full_name,email,status,rsvp_token,created_date").eq("rsvp_token", token).maybeSingle();
  if (!rsvp) return c.json({ error: "not_found", message: "This ticket link is not valid." }, 404);

  const { data: event } = await supabase.from("events")
    .select("id,title,starts_at,ends_at,location_name,location_address,status,cover_image_url,club_id")
    .eq("id", rsvp.event_id).maybeSingle();
  if (!event) return c.json({ error: "not_found", message: "This ticket link is not valid." }, 404);

  const { data: club } = await supabase.from("clubs")
    .select("name,slug,logo_url").eq("id", event.club_id).maybeSingle();

  // Whether they were checked in, so the ticket can say so rather than showing
  // a QR that has already been used.
  const { data: checkIn } = await supabase.from("check_ins")
    .select("checked_in_at").eq("rsvp_id", rsvp.id).maybeSingle();

  // What makes a ticket feel like theirs: its number in the order people signed
  // up, their place in the waitlist, and how many of this club's other events
  // they have been to. Counts only, nothing about anyone else.
  const [numbered, ahead, visits] = await Promise.all([
    supabase.from("rsvps").select("id", { count: "exact", head: true })
      .eq("event_id", event.id).lte("created_date", rsvp.created_date),
    rsvp.status === "waitlisted"
      ? supabase.from("rsvps").select("id", { count: "exact", head: true })
        .eq("event_id", event.id).eq("status", "waitlisted").lt("created_date", rsvp.created_date)
      : Promise.resolve({ count: null }),
    supabase.from("check_ins").select("id", { count: "exact", head: true })
      .eq("club_id", event.club_id).eq("email", String(rsvp.email).toLowerCase()).neq("event_id", event.id),
  ]);

  return c.json({
    rsvp: {
      full_name: rsvp.full_name,
      email: rsvp.email,
      status: rsvp.status,
      rsvp_token: rsvp.rsvp_token,
      checked_in_at: checkIn?.checked_in_at || null,
      // When they booked, printed on the ticket like a till receipt's time.
      created_date: rsvp.created_date,
    },
    event,
    club: club ? { name: club.name, slug: club.slug, logo_url: club.logo_url } : null,
    ticket: {
      number: numbered.count || 1,
      waitlist_position: rsvp.status === "waitlisted" ? (ahead.count || 0) + 1 : null,
      club_visits: visits.count ?? 0,
    },
  });
});

/**
 * How full an event is, for the "spots left" line on its public page. Events
 * without a capacity have nothing to count and say so.
 */
publicRoutes.post("/event-availability", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const eventId = typeof body.event_id === "string" ? body.event_id.trim() : "";
  if (!eventId) return c.json({ error: "event_not_found", message: "Event not found." }, 404);

  const supabase = db();
  const { data: event } = await supabase.from("events")
    .select("id,capacity,status").eq("id", eventId).maybeSingle();
  if (!event || event.status === "draft") return c.json({ error: "event_not_found", message: "Event not found." }, 404);
  if (!event.capacity) return c.json({ capacity: null, spots_left: null });

  const { count } = await supabase.from("rsvps")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id).eq("status", "confirmed");
  return c.json({ capacity: event.capacity, spots_left: Math.max(0, event.capacity - (count || 0)) });
});

/**
 * Lets an attendee withdraw, and promotes the next person off the waitlist.
 *
 * Without this the headcount drifts: people who cannot come simply do not turn
 * up, the seat is never released, and the waitlist promise ("we will email you
 * if a place opens up") stays hypothetical.
 */
publicRoutes.post("/rsvp-cancel", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return c.json({ error: "invalid_token", message: "This ticket link is not valid." }, 400);

  const supabase = db();
  const { data: rsvp } = await supabase.from("rsvps").select("*").eq("rsvp_token", token).maybeSingle();
  if (!rsvp) return c.json({ error: "not_found", message: "This ticket link is not valid." }, 404);
  if (rsvp.status === "cancelled") return c.json({ ok: true, status: "cancelled", already: true });

  const { data: event } = await supabase.from("events").select("*").eq("id", rsvp.event_id).maybeSingle();
  if (event && event.ends_at && new Date(event.ends_at).getTime() < Date.now()) {
    return c.json({ error: "event_ended", message: "This event has already ended." }, 409);
  }

  // Refuse once they are through the door: the attendance record is what the
  // grant acquittal is built from, and it should reflect who actually came.
  const { data: checkIn } = await supabase.from("check_ins")
    .select("id").eq("rsvp_id", rsvp.id).maybeSingle();
  if (checkIn) {
    return c.json({ error: "already_checked_in", message: "You have already checked in to this event." }, 409);
  }

  const freedASeat = rsvp.status === "confirmed";
  await supabase.from("rsvps").update({ status: "cancelled" }).eq("id", rsvp.id);

  if (freedASeat && event?.capacity) {
    await promoteFromWaitlist(c.req.raw, event);
  }
  return c.json({ ok: true, status: "cancelled" });
});

/** Moves the longest-waiting person into the freed seat and tells them. */
async function promoteFromWaitlist(req: Request, event: Record<string, any>) {
  const supabase = db();
  const { count } = await supabase.from("rsvps")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id).eq("status", "confirmed");
  if ((count || 0) >= event.capacity) return;

  const { data: next } = await supabase.from("rsvps")
    .select("*").eq("event_id", event.id).eq("status", "waitlisted")
    .order("created_date", { ascending: true }).limit(1).maybeSingle();
  if (!next) return;

  await supabase.from("rsvps").update({ status: "confirmed" }).eq("id", next.id);

  const mail = waitlistPromotedEmail({
    title: event.title,
    whenText: formatEventWhen(event.starts_at, event.ends_at),
    location: event.location_name,
    ticketUrl: ticketUrl(appOrigin(req), next.rsvp_token),
  });
  const result = await sendEmail(next.email, mail.subject, mail.html);
  if (!result.sent) console.error("[rsvp] promotion email failed for", next.email, result.error);
}
