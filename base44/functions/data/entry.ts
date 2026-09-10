import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { resolveActor, roleInClub, hasAtLeastRole } from "../../shared/session.ts";
import type { Actor, ClubRole } from "../../shared/session.ts";
import {
  canActOnClub,
  clubIdsWithRole,
  isPubliclyVisible,
  publicQuery,
  redactForOutsider,
  ruleFor,
  stripServerOwned,
} from "../../shared/policy.ts";
import { fail, ok, readJson } from "../../shared/http.ts";

const MAX_LIMIT = 500;

/** The club a record belongs to. For Club itself that is the record's own id. */
function clubIdOf(entity: string, row: Record<string, any> | null | undefined): string | undefined {
  if (!row) return undefined;
  return entity === "Club" ? row.id : row.club_id;
}

/** Whether the caller may see this row, and in what form. */
function visibility(
  entity: string,
  row: Record<string, any>,
  actor: Actor | null,
  readRole: ClubRole | "public",
): { visible: boolean; redact: boolean } {
  const clubId = clubIdOf(entity, row);
  const asMember = readRole === "public"
    ? !!roleInClub(actor, clubId)
    : hasAtLeastRole(roleInClub(actor, clubId), readRole);

  if (asMember) return { visible: true, redact: false };
  if (readRole !== "public") return { visible: false, redact: false };

  // Outsider reading a publicly readable entity.
  return { visible: isPubliclyVisible(entity, row), redact: true };
}

export default async function (req: Request): Promise<Response> {
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");

  const svc = createClientFromRequest(req).asServiceRole;
  const body = await readJson<any>(req);

  const entity = typeof body.entity === "string" ? body.entity : "";
  const op = typeof body.op === "string" ? body.op : "";

  const rule = ruleFor(entity);
  if (!rule) return fail(400, "unknown_entity", "Unknown or protected entity.");
  if (!["filter", "get", "create", "update", "delete"].includes(op)) {
    return fail(400, "unknown_op", "Unknown operation.");
  }

  const actor = await resolveActor(svc, req);

  // ---- reads -------------------------------------------------------------
  if (op === "filter" || op === "get") {
    if (rule.read !== "public" && !actor) {
      return fail(401, "unauthenticated", "Sign in to continue.");
    }

    if (op === "get") {
      const row = await svc.entities[entity].get(body.id).catch(() => null);
      if (!row) return fail(404, "not_found", "Not found.");
      const v = visibility(entity, row, actor, rule.read);
      if (!v.visible) return fail(404, "not_found", "Not found.");
      return ok({ data: v.redact ? redactForOutsider(entity, row) : row });
    }

    const query: Record<string, any> = { ...(body.query || {}) };
    // A client cannot widen its own scope: for member-only entities the club
    // filter is overwritten, never merged.
    if (rule.read !== "public") {
      const allowed = clubIdsWithRole(actor, rule.read);
      if (allowed.length === 0) return ok({ data: [] });
      const requested = query.club_id;
      const scope = typeof requested === "string"
        ? (allowed.includes(requested) ? [requested] : [])
        : allowed;
      if (scope.length === 0) return ok({ data: [] });
      query.club_id = { $in: scope };
    } else if (!actor) {
      Object.assign(query, publicQuery(entity));
    }

    const limit = Math.min(Number(body.limit) || MAX_LIMIT, MAX_LIMIT);
    const rows: any[] = await svc.entities[entity].filter(query, body.sort, limit, body.skip);

    const out: any[] = [];
    for (const row of rows) {
      const v = visibility(entity, row, actor, rule.read);
      if (!v.visible) continue;
      out.push(v.redact ? redactForOutsider(entity, row) : row);
    }
    return ok({ data: out });
  }

  // ---- writes ------------------------------------------------------------
  if (!actor) return fail(401, "unauthenticated", "Sign in to continue.");

  if (op === "create") {
    const data = stripServerOwned(entity, body.data || {});

    if (entity === "Club") {
      // Anyone signed in may found a club; they become its owner in the same
      // call, so a club can never exist without one.
      const slug = String(data.slug || "").toLowerCase();
      if (!/^[a-z0-9-]{3,40}$/.test(slug)) {
        return fail(400, "invalid_slug", "Slug must be 3-40 characters: lowercase letters, digits or hyphens.");
      }
      const taken = await svc.entities.Club.filter({ slug }, undefined, 1);
      if (taken.length) return fail(409, "slug_taken", "That slug is already taken.");

      const club = await svc.entities.Club.create({ ...data, slug });
      await svc.entities.ClubMembership.create({
        club_id: club.id,
        user_email: String(actor.user.email).toLowerCase(),
        user_name: actor.user.full_name,
        role: "owner",
        accepted_at: new Date().toISOString(),
      });
      return ok({ data: club });
    }

    // Everything else must name its club. When the row hangs off an event, the
    // club is taken from that event and the caller's own club_id is discarded:
    // otherwise a member of club A could pass club_id=A alongside an event
    // belonging to club B, satisfy the role check against A, and attach a row to
    // B's event.
    let clubId = data.club_id as string | undefined;
    if (data.event_id) {
      const ev = await svc.entities.Event.get(data.event_id).catch(() => null);
      if (!ev) return fail(404, "event_not_found", "Event not found.");
      clubId = ev.club_id;
      data.club_id = clubId;
    }
    if (!canActOnClub(actor, clubId, rule.write)) {
      return fail(403, "forbidden", "You don't have permission to do that.");
    }
    if (entity === "AuditLog") data.actor_email = actor.user.email;

    return ok({ data: await svc.entities[entity].create(data) });
  }

  // update / delete both need the existing row to know which club governs it.
  const existing = await svc.entities[entity].get(body.id).catch(() => null);
  if (!existing) return fail(404, "not_found", "Not found.");
  const clubId = clubIdOf(entity, existing);
  if (!canActOnClub(actor, clubId, rule.write)) {
    return fail(403, "forbidden", "You don't have permission to do that.");
  }

  if (op === "delete") {
    if (entity === "ClubMembership") {
      if (existing.role === "owner") return fail(400, "cannot_remove_owner", "The club owner can't be removed.");
      if (!canActOnClub(actor, clubId, "admin")) return fail(403, "forbidden", "Admins only.");
    }
    await svc.entities[entity].delete(body.id);
    return ok({ data: { id: body.id } });
  }

  const patch = stripServerOwned(entity, body.data || {});
  // Re-homing a record would sidestep the check that just passed, so neither the
  // owning club nor the owning event may be reassigned after creation.
  delete patch.club_id;
  delete patch.event_id;

  if (entity === "ClubMembership") {
    const isOwnerRow = existing.role === "owner";
    const targetsOwner = patch.role === "owner";
    if ((isOwnerRow || targetsOwner) && roleInClub(actor, clubId) !== "owner") {
      return fail(403, "owner_only", "Only the club owner can change ownership.");
    }
  }

  return ok({ data: await svc.entities[entity].update(body.id, patch) });
}
