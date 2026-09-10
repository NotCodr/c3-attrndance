import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { publicUser, resolveActor } from "../../../shared/session.ts";
import { fail, ok } from "../../../shared/http.ts";

/**
 * Returns the signed-in user together with their clubs and role in each.
 *
 * The shell needs all three on every page load, so they are served in one round
 * trip rather than the three the old client-side code made.
 */
export default async function (req: Request): Promise<Response> {
  const svc = createClientFromRequest(req).asServiceRole;
  const actor = await resolveActor(svc, req);
  if (!actor) return fail(401, "unauthenticated", "Sign in to continue.");

  const clubIds = [...new Set(actor.memberships.map((m) => m.club_id))];
  const clubs = clubIds.length
    ? await svc.entities.Club.filter({ id: { $in: clubIds } })
    : [];

  const roleByClub = new Map(actor.memberships.map((m) => [m.club_id, m.role]));

  return ok({
    user: publicUser(actor.user),
    clubs: clubs
      .filter((c: any) => !c.deleted_at)
      .map((c: any) => ({ ...c, role: roleByClub.get(c.id) })),
  });
}
