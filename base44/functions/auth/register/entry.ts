import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { hashPassword, randomNumericCode, sha256Hex } from "../../../shared/crypto.ts";
import { sendEmail, verificationEmail } from "../../../shared/email.ts";
import { fail, isValidEmail, normaliseEmail, ok, passwordProblem, readJson, clampText } from "../../../shared/http.ts";

const CODE_TTL_MIN = 15;

/**
 * Starts a signup: creates an unverified AppUser and emails a 6-digit code.
 *
 * The response is deliberately identical whether or not the address already has
 * an account, so this endpoint cannot be used to enumerate registered club
 * emails. The differentiation happens in the mail that is sent, which only the
 * address owner can read.
 */
export default async function (req: Request): Promise<Response> {
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");

  const svc = createClientFromRequest(req).asServiceRole;
  const body = await readJson(req);

  const email = normaliseEmail(body.email);
  const password = body.password;
  const fullName = clampText(body.full_name, 100);

  if (!isValidEmail(email)) return fail(400, "invalid_email", "Enter a valid email address.");
  const pwProblem = passwordProblem(password);
  if (pwProblem) return fail(400, "weak_password", pwProblem);

  const generic = ok({
    ok: true,
    email,
    message: "Check your email for a 6-digit verification code.",
  });

  const existing = (await svc.entities.AppUser.filter({ email }, undefined, 1))[0];

  if (existing && existing.email_verified) {
    // Tell the owner of the address, not the caller.
    await sendEmail(
      svc,
      email,
      "You already have a connect3 account",
      `<div style="font-family:sans-serif"><p>Someone tried to create a connect3 account with this address, but one already exists.</p><p>Sign in instead, or use "forgot password" if you can't get in.</p></div>`,
    );
    return generic;
  }

  const code = randomNumericCode(6);
  const codeFields = {
    verification_code_hash: await sha256Hex(code),
    verification_expires_at: new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString(),
    verification_attempts: 0,
  };

  if (existing) {
    // Unverified account: treat a repeat signup as "send me a new code", and let
    // the caller correct the password/name they set the first time.
    await svc.entities.AppUser.update(existing.id, {
      ...codeFields,
      password_hash: await hashPassword(password as string),
      full_name: fullName ?? existing.full_name,
    });
  } else {
    await svc.entities.AppUser.create({
      email,
      full_name: fullName,
      password_hash: await hashPassword(password as string),
      email_verified: false,
      status: "active",
      failed_login_attempts: 0,
      ...codeFields,
    });
  }

  const mail = verificationEmail(code);
  const result = await sendEmail(svc, email, mail.subject, mail.html);
  if (!result.sent) {
    return fail(
      502,
      "email_send_failed",
      "We couldn't send your verification email. Please try again shortly.",
    );
  }

  return generic;
}
