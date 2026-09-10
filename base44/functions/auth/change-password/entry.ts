import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { hashPassword, verifyPassword } from "../../../shared/crypto.ts";
import { resolveActor } from "../../../shared/session.ts";
import { fail, ok, passwordProblem, readJson } from "../../../shared/http.ts";

/**
 * Changes the password of the signed-in user.
 *
 * Every other session is revoked but the caller's own is kept, so changing your
 * password signs out the other devices without signing you out of the one you
 * are currently using.
 */
export default async function (req: Request): Promise<Response> {
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");

  const svc = createClientFromRequest(req).asServiceRole;
  const actor = await resolveActor(svc, req);
  if (!actor) return fail(401, "unauthenticated", "Sign in to continue.");

  const body = await readJson<any>(req);
  const current = typeof body.current_password === "string" ? body.current_password : "";
  const next = body.new_password;

  const pwProblem = passwordProblem(next);
  if (pwProblem) return fail(400, "weak_password", pwProblem);

  const user = await svc.entities.AppUser.get(actor.user.id).catch(() => null);
  if (!user) return fail(401, "unauthenticated", "Sign in to continue.");

  if (!(await verifyPassword(current, user.password_hash as string))) {
    return fail(400, "wrong_password", "Your current password is incorrect.");
  }

  await svc.entities.AppUser.update(user.id, { password_hash: await hashPassword(next as string) });

  const sessions = await svc.entities.AppSession.filter({ user_id: user.id });
  const now = new Date().toISOString();
  await Promise.all(
    sessions
      .filter((s: any) => !s.revoked_at && s.id !== actor.sessionId)
      .map((s: any) => svc.entities.AppSession.update(s.id, { revoked_at: now }).catch(() => {})),
  );

  return ok({ ok: true, signed_out_others: sessions.length - 1 });
}
