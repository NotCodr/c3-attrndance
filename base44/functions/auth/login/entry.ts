import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { dummyVerify, randomToken, verifyPassword } from "../../../shared/crypto.ts";
import { issueSession, publicUser } from "../../../shared/session.ts";
import { fail, isValidEmail, normaliseEmail, ok, readJson } from "../../../shared/http.ts";

/** Online-guessing brake. Generous enough not to lock out a genuine typo streak. */
const MAX_FAILED = 8;
const LOCKOUT_MIN = 15;

export default async function (req: Request): Promise<Response> {
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");

  const svc = createClientFromRequest(req).asServiceRole;
  const body = await readJson(req);
  const email = normaliseEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  if (!isValidEmail(email) || !password) {
    return fail(400, "invalid_credentials", "Enter your email and password.");
  }

  const user = (await svc.entities.AppUser.filter({ email }, undefined, 1))[0];
  const invalid = fail(401, "invalid_credentials", "Email or password is incorrect.");

  if (!user) {
    // Burn the same time a real verification costs, so response latency does not
    // reveal whether the address is registered.
    await dummyVerify();
    return invalid;
  }

  if (user.status === "disabled") {
    return fail(403, "account_disabled", "This account has been disabled.");
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    const mins = Math.max(1, Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000));
    return fail(429, "locked", `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
  }

  if (!(await verifyPassword(password, user.password_hash as string))) {
    const failures = (user.failed_login_attempts || 0) + 1;
    await svc.entities.AppUser.update(user.id, {
      failed_login_attempts: failures,
      locked_until:
        failures >= MAX_FAILED ? new Date(Date.now() + LOCKOUT_MIN * 60 * 1000).toISOString() : null,
    });
    return invalid;
  }

  if (!user.email_verified) {
    // Correct password, but the address is unproven. Say so explicitly: the
    // caller has already demonstrated they own the credentials, so there is no
    // enumeration risk in being specific, and it's the only way they can recover.
    return fail(403, "email_not_verified", "Verify your email address to finish setting up your account.", { email });
  }

  await svc.entities.AppUser.update(user.id, {
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: new Date().toISOString(),
  });

  const token = randomToken();
  await issueSession(svc, user.id, token, req.headers.get("user-agent") || undefined);

  return ok({ ok: true, token, user: publicUser(user) });
}
