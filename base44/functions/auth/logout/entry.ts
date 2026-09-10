import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { resolveActor } from "../../../shared/session.ts";
import { ok } from "../../../shared/http.ts";

/**
 * Revokes the caller's session.
 *
 * Always reports success: a logout that "fails" is confusing and useless, and
 * the client discards its token regardless.
 */
export default async function (req: Request): Promise<Response> {
  const svc = createClientFromRequest(req).asServiceRole;
  const actor = await resolveActor(svc, req);
  if (actor) {
    await svc.entities.AppSession.update(actor.sessionId, {
      revoked_at: new Date().toISOString(),
    }).catch(() => {});
  }
  return ok({ ok: true });
}
