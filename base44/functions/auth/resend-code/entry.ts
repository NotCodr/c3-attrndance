import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { randomNumericCode, sha256Hex } from "../../../shared/crypto.ts";
import { sendEmail, verificationEmail } from "../../../shared/email.ts";
import { fail, isValidEmail, normaliseEmail, ok, readJson } from "../../../shared/http.ts";

const CODE_TTL_MIN = 15;
/** Minimum gap between sends, so this can't be used to spam an inbox. */
const RESEND_COOLDOWN_MS = 60 * 1000;

export default async function (req: Request): Promise<Response> {
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");

  const svc = createClientFromRequest(req).asServiceRole;
  const email = normaliseEmail((await readJson(req)).email);
  if (!isValidEmail(email)) return fail(400, "invalid_email", "Enter a valid email address.");

  const generic = ok({ ok: true, message: "If that account needs verifying, a new code is on its way." });

  const user = (await svc.entities.AppUser.filter({ email }, undefined, 1))[0];
  if (!user || user.email_verified) return generic;

  // The remaining lifetime tells us when the last code was issued.
  if (user.verification_expires_at) {
    const issuedAt = new Date(user.verification_expires_at).getTime() - CODE_TTL_MIN * 60 * 1000;
    if (Date.now() - issuedAt < RESEND_COOLDOWN_MS) {
      return fail(429, "cooldown", "Please wait a moment before requesting another code.");
    }
  }

  const code = randomNumericCode(6);
  await svc.entities.AppUser.update(user.id, {
    verification_code_hash: await sha256Hex(code),
    verification_expires_at: new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString(),
    verification_attempts: 0,
  });

  const mail = verificationEmail(code);
  const result = await sendEmail(svc, email, mail.subject, mail.html);
  if (!result.sent) return fail(502, "email_send_failed", "We couldn't send that email. Try again shortly.");

  return generic;
}
