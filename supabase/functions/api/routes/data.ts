// The data gateway: the only way the browser reaches the database.
//
// Every table is deny-by-default under RLS and the API holds the only key, so
// this handler plus policy.ts is the whole access-control story. The request
// shape ({ entity, op, query, ... }) is the one the React client already spoke,
// which is why the frontend needed no changes when the backend moved.

import { Hono } from "jsr:@hono/hono@4";
import { db, isUniqueViolation } from "../../_shared/db.ts";
import { hasAtLeastRole, resolveActor, roleInClub, type Actor, type ClubRole } from "../../_shared/session.ts";
import {
  canActOnClub, clubIdsWithRole, isPubliclyVisible, redactForOutsider, ruleFor, stripServerOwned,
} from "../../_shared/policy.ts";
import { notifyEventCompleted } from "./notify.ts";
import { committeeInviteEmail, sendEmail } from "../../_shared/email.ts";
import { appOrigin } from "../../_shared/http.ts";

const MAX_LIMIT = 500;

export const dataRoutes = new Hono();

/** The club a row belongs to. For Club itself that is the row's own id. */
function clubIdOf(entity: string, row: Record<string, any> | null): string | undefined {
  if (!row) return undefined;
  return entity === "Club" ? row.id : row.club_id;
}

/** Whether the caller may see this row, and in what form. */
function visibility(entity: string, row: Record<string, any>, actor: Actor | null, readRole: ClubRole | "public") {
  const clubId = clubIdOf(entity, row);
  const asMember = readRole === "public"
    ? !!roleInClub(actor, clubId)
    : hasAtLeastRole(roleInClub(actor, clubId), readRole);

  if (asMember) return { visible: true, redact: false };
  if (readRole !== "public") return { visible: false, redact: false };
  return { visible: isPubliclyVisible(entity, row), redact: true };
}

/**
 * Translates the client's query object into PostgREST filters.
 *
 * Only equality and $in are accepted. Anything else is ignored rather than
 * passed through, so a client cannot smuggle an operator the policy layer has
 * not reasoned about.
 */
function applyQuery(builder: any, query: Record<string, unknown>) {
  for (const [field, value] of Object.entries(query || {})) {
    if (value === null) builder = builder.is(field, null);
    else if (Array.isArray(value)) builder = builder.in(field, value);
    else if (typeof value === "object" && value !== null && Array.isArray((value as any).$in)) {
      builder = builder.in(field, (value as any).$in);
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      builder = builder.eq(field, value);
    }
  }
  return builder;
}

/** Sort strings are "starts_at", or "-created_date" for descending. */
function applySort(builder: any, sort: unknown) {
  if (typeof sort !== "string" || !sort) return builder;
  const desc = sort.startsWith("-");
  return builder.order(desc ? sort.slice(1) : sort, { ascending: !desc });
}

dataRoutes.post("/data", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const entity = typeof body.entity === "string" ? body.entity : "";
  const op = typeof body.op === "string" ? body.op : "";

  const rule = ruleFor(entity);
  if (!rule) return c.json({ error: "unknown_entity", message: "Unknown or protected entity." }, 400);
  if (!["filter", "get", "create", "update", "delete"].includes(op)) {
    return c.json({ error: "unknown_op", message: "Unknown operation." }, 400);
  }

  const table = rule.table;
  const actor = await resolveActor(c.req.raw);
  const supabase = db();

  // ---- reads ---------------------------------------------------------------
  if (op === "filter" || op === "get") {
    if (rule.read !== "public" && !actor) {
      return c.json({ error: "unauthenticated", message: "Sign in to continue." }, 401);
    }

    if (op === "get") {
      const { data: row } = await supabase.from(table).select("*").eq("id", body.id).maybeSingle();
      if (!row) return c.json({ error: "not_found", message: "Not found." }, 404);
      const v = visibility(entity, row, actor, rule.read);
      // 404 rather than 403: whether the row exists is itself not public.
      if (!v.visible) return c.json({ error: "not_found", message: "Not found." }, 404);
      return c.json({ data: v.redact ? redactForOutsider(entity, row) : row });
    }

    const query: Record<string, unknown> = { ...(body.query || {}) };

    if (rule.read !== "public") {
      // A client cannot widen its own scope: for member-only entities the club
      // filter is overwritten, never merged.
      const allowed = clubIdsWithRole(actor, rule.read as ClubRole);
      if (allowed.length === 0) return c.json({ data: [] });
      const requested = query.club_id;
      const scope = typeof requested === "string"
        ? (allowed.includes(requested) ? [requested] : [])
        : allowed;
      if (scope.length === 0) return c.json({ data: [] });
      query.club_id = { $in: scope };
    } else if (!actor && entity === "Club") {
      query.deleted_at = null;
    }

    let builder = supabase.from(table).select("*");
    builder = applyQuery(builder, query);
    builder = applySort(builder, body.sort);
    builder = builder.limit(Math.min(Number(body.limit) || MAX_LIMIT, MAX_LIMIT));
    if (body.skip) builder = builder.range(Number(body.skip), Number(body.skip) + MAX_LIMIT);

    const { data: rows, error } = await builder;
    if (error) throw new Error(error.message);

    const out: unknown[] = [];
    for (const row of rows || []) {
      const v = visibility(entity, row, actor, rule.read);
      if (!v.visible) continue;
      out.push(v.redact ? redactForOutsider(entity, row) : row);
    }
    return c.json({ data: out });
  }

  // ---- writes --------------------------------------------------------------
  if (!actor) return c.json({ error: "unauthenticated", message: "Sign in to continue." }, 401);

  if (op === "create") {
    const data = stripServerOwned(entity, body.data || {});

    if (entity === "Club") {
      // Anyone signed in may found a club, and they become its owner in the same
      // request, so a club can never exist without one.
      const slug = String(data.slug || "").toLowerCase();
      if (!/^[a-z0-9-]{3,40}$/.test(slug)) {
        return c.json({ error: "invalid_slug", message: "Slug must be 3-40 characters: lowercase letters, digits or hyphens." }, 400);
      }

      const { data: club, error } = await supabase.from("clubs")
        .insert({ ...data, slug, created_by: actor.user.email }).select().single();
      // The unique index decides the winner of two simultaneous claims; no
      // read-then-write race to lose.
      if (isUniqueViolation(error)) {
        return c.json({ error: "slug_taken", message: "That slug is already taken." }, 409);
      }
      if (error) throw new Error(error.message);

      await supabase.from("club_memberships").insert({
        club_id: club.id,
        user_email: String(actor.user.email).toLowerCase(),
        full_name: actor.user.full_name,
        role: "owner",
        accepted_at: new Date().toISOString(),
      });
      return c.json({ data: club });
    }

    // Everything else must name its club. When a row hangs off an event the club
    // comes from that event and the caller's own club_id is discarded: otherwise
    // a member of club A could pass club_id=A alongside an event owned by club B,
    // satisfy the role check against A, and attach a row to B's event.
    let clubId = data.club_id as string | undefined;
    if (data.event_id) {
      const { data: ev } = await supabase.from("events").select("club_id").eq("id", data.event_id).maybeSingle();
      if (!ev) return c.json({ error: "event_not_found", message: "Event not found." }, 404);
      clubId = ev.club_id;
      data.club_id = clubId;
    }
    if (!canActOnClub(actor, clubId, rule.write)) {
      return c.json({ error: "forbidden", message: "You do not have permission to do that." }, 403);
    }
    if (entity === "AuditLog") data.actor_email = actor.user.email;
    // Emails are compared with equality everywhere, so normalise on the way in
    // rather than relying on the client to have done it.
    for (const field of ["user_email", "email"]) {
      if (typeof data[field] === "string") data[field] = data[field].trim().toLowerCase();
    }

    const { data: created, error } = await supabase.from(table).insert(data).select().single();
    if (isUniqueViolation(error)) {
      return c.json({ error: "duplicate", message: "That already exists." }, 409);
    }
    if (error) throw new Error(error.message);

    // Adding someone to a committee used to be silent: a row appeared and the
    // person was never told, so they had no way to know they should sign up.
    if (entity === "ClubMembership" && created.user_email !== actor.user.email) {
      await notifyInvitee(created, actor, c.req.raw).catch((e) => console.error("[invite] failed:", e));
    }

    return c.json({ data: created });
  }

  // update and delete both need the existing row to know which club governs it.
  const { data: existing } = await supabase.from(table).select("*").eq("id", body.id).maybeSingle();
  if (!existing) return c.json({ error: "not_found", message: "Not found." }, 404);

  const clubId = clubIdOf(entity, existing);
  if (!canActOnClub(actor, clubId, rule.write)) {
    return c.json({ error: "forbidden", message: "You do not have permission to do that." }, 403);
  }

  if (op === "delete") {
    if (entity === "ClubMembership") {
      if (existing.role === "owner") {
        return c.json({ error: "cannot_remove_owner", message: "The club owner cannot be removed." }, 400);
      }
      if (!canActOnClub(actor, clubId, "admin")) {
        return c.json({ error: "forbidden", message: "Admins only." }, 403);
      }
    }
    const { error } = await supabase.from(table).delete().eq("id", body.id);
    if (error) throw new Error(error.message);
    return c.json({ data: { id: body.id } });
  }

  const patch = stripServerOwned(entity, body.data || {});
  // Re-homing a row would sidestep the check that just passed, so neither the
  // owning club nor the owning event may be reassigned after creation.
  delete patch.club_id;
  delete patch.event_id;

  if (entity === "ClubMembership") {
    const isOwnerRow = existing.role === "owner";
    const targetsOwner = patch.role === "owner";
    if ((isOwnerRow || targetsOwner) && roleInClub(actor, clubId) !== "owner") {
      return c.json({ error: "owner_only", message: "Only the club owner can change ownership." }, 403);
    }
  }

  const { data: updated, error } = await supabase.from(table).update(patch).eq("id", body.id).select().single();
  if (error) throw new Error(error.message);

  // An earlier backend fired this from a workflow pointing at a function that
  // had never been deployed, so completed events notified nobody. Firing it from
  // the transition itself removes that whole class of failure.
  if (entity === "Event" && existing.status !== "completed" && updated.status === "completed") {
    await notifyEventCompleted(updated.id).catch((e) => console.error("[notify] failed:", e));
  }

  return c.json({ data: updated });
});

/**
 * Tells someone they have been added to a club.
 *
 * The message differs depending on whether they already have an account,
 * because the action they need to take differs: sign up with this exact address
 * versus simply sign in. Never reveals account existence to anyone but the
 * address owner, who is the only recipient.
 */
async function notifyInvitee(membership: Record<string, any>, actor: Actor, req: Request) {
  const supabase = db();

  const [{ data: club }, { data: existingUser }] = await Promise.all([
    supabase.from("clubs").select("name").eq("id", membership.club_id).maybeSingle(),
    supabase.from("app_users").select("id").eq("email", membership.user_email).maybeSingle(),
  ]);
  if (!club) return;

  const origin = appOrigin(req);
  const isNewUser = !existingUser;
  const mail = committeeInviteEmail({
    clubName: club.name,
    role: membership.role,
    invitedBy: (actor.user.full_name as string) || (actor.user.email as string),
    signInUrl: origin + (isNewUser ? "/signup" : "/login"),
    isNewUser,
  });
  await sendEmail(membership.user_email, mail.subject, mail.html);
}
