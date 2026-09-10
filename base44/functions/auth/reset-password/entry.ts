import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { hashPassword, sha256Hex, timingSafeEqualStr } from "../../../shared/crypto.ts";
import { fail, ok, passwordProblem, readJson } from "../../../shared/http.ts";

/**
 * Consumes a reset token and sets a new password.
 *
 * On success every existing session is revoked. If the reset was triggered
 * because the account was compromised, leaving the attacker's session alive
 * would defeat the point.
 */
export default async function (req: Request): Promise<Response> {
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");

  const svc = createClientFromRequest(req).asServiceRole;
  const body = await readJson(req);
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = body.password;

  if (!token) return fail(400, "invalid_token", "This reset link is invalid or has expired.");
  const pwProblem = passwordProblem(password);
  if (pwProblem) return fail(400, "weak_password", pwProblem);

  const tokenHash = await sha256Hex(token);
  const user = (await svc.entities.AppUser.filter({ reset_token_hash: tokenHash }, undefined, 1))[0];

  const invalid = fail(400, "invalid_token", "This reset link is invalid or has expired.");
  if (!user || !user.reset_token_hash) return invalid;
  if (!timingSafeEqualStr(tokenHash, user.reset_token_hash)) return invalid;
  if (!user.reset_expires_at || new Date(user.reset_expires_at).getTime() <= Date.now()) return invalid;

  await svc.entities.AppUser.update(user.id, {
    password_hash: await hashPassword(password as string),
    reset_token_hash: null,
    reset_expires_at: null,
    failed_login_attempts: 0,
    locked_until: null,
    // Completing a reset proves control of the inbox, which is exactly what
    // signup verification checks — so an unverified account becomes verified.
    email_verified: true,
    verification_code_hash: null,
    verification_expires_at: null,
  });

  const sessions = await svc.entities.AppSession.filter({ user_id: user.id });
  const now = new Date().toISOString();
  await Promise.all(
    sessions
      .filter((s: any) => !s.revoked_at)
      .map((s: any) => svc.entities.AppSession.update(s.id, { revoked_at: now }).catch(() => {})),
  );

  return ok({ ok: true, message: "Password updated. You can sign in now." });
}
