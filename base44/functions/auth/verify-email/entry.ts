import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { randomToken, sha256Hex, timingSafeEqualStr } from "../../../shared/crypto.ts";
import { issueSession, publicUser } from "../../../shared/session.ts";
import { fail, isValidEmail, normaliseEmail, ok, readJson } from "../../../shared/http.ts";

const MAX_ATTEMPTS = 5;

/**
 * Completes signup by checking the emailed code, then logs the user straight in.
 *
 * Attempts are counted on the user record so a 6-digit code can't be brute
 * forced: 5 wrong guesses burns the code and a new one must be requested.
 */
export default async function (req: Request): Promise<Response> {
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");

  const svc = createClientFromRequest(req).asServiceRole;
  const body = await readJson(req);

  const email = normaliseEmail(body.email);
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!isValidEmail(email) || !code) {
    return fail(400, "invalid_request", "Email and code are required.");
  }

  const user = (await svc.entities.AppUser.filter({ email }, undefined, 1))[0];
  // Same message for every failure mode below, so a wrong code and an unknown
  // address are indistinguishable to the caller.
  const invalid = fail(400, "invalid_code", "That code is incorrect or has expired.");

  if (!user) return invalid;
  if (user.email_verified) {
    return fail(409, "already_verified", "This email is already verified. Please sign in.");
  }
  if (!user.verification_code_hash || !user.verification_expires_at) return invalid;
  if (new Date(user.verification_expires_at).getTime() <= Date.now()) return invalid;
  if ((user.verification_attempts || 0) >= MAX_ATTEMPTS) {
    return fail(429, "too_many_attempts", "Too many incorrect codes. Request a new one.");
  }

  const matches = timingSafeEqualStr(await sha256Hex(code), user.verification_code_hash);
  if (!matches) {
    await svc.entities.AppUser.update(user.id, {
      verification_attempts: (user.verification_attempts || 0) + 1,
    });
    return invalid;
  }

  await svc.entities.AppUser.update(user.id, {
    email_verified: true,
    verification_code_hash: null,
    verification_expires_at: null,
    verification_attempts: 0,
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: new Date().toISOString(),
  });

  const token = randomToken();
  await issueSession(svc, user.id, token, req.headers.get("user-agent") || undefined);

  return ok({ ok: true, token, user: publicUser({ ...user, email_verified: true }) });
}
