import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { secrets } from "base44:runtime";
import { randomToken, sha256Hex } from "../../../shared/crypto.ts";
import { resetEmail, sendEmail } from "../../../shared/email.ts";
import { fail, isValidEmail, normaliseEmail, ok, readJson } from "../../../shared/http.ts";

const RESET_TTL_MIN = 60;

function appOrigin(req: Request): string {
  const configured = secrets.get("APP_ORIGIN");
  if (configured) return configured.replace(/\/$/, "");
  // Fall back to where the request came from, so this works in local dev and on
  // preview deploys without extra configuration.
  const origin = req.headers.get("origin") || req.headers.get("referer");
  if (origin) {
    try {
      return new URL(origin).origin;
    } catch { /* fall through */ }
  }
  return "https://connect3.base44.app";
}

export default async function (req: Request): Promise<Response> {
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");

  const svc = createClientFromRequest(req).asServiceRole;
  const email = normaliseEmail((await readJson(req)).email);
  if (!isValidEmail(email)) return fail(400, "invalid_email", "Enter a valid email address.");

  // Unconditional success: whether an account exists is not the caller's business.
  const generic = ok({
    ok: true,
    message: "If an account exists for that address, we've sent a reset link.",
  });

  const user = (await svc.entities.AppUser.filter({ email }, undefined, 1))[0];
  if (!user || user.status === "disabled") return generic;

  const token = randomToken();
  await svc.entities.AppUser.update(user.id, {
    reset_token_hash: await sha256Hex(token),
    reset_expires_at: new Date(Date.now() + RESET_TTL_MIN * 60 * 1000).toISOString(),
  });

  const link = `${appOrigin(req)}/reset-password?token=${encodeURIComponent(token)}`;
  const mail = resetEmail(link);
  await sendEmail(svc, email, mail.subject, mail.html);

  return generic;
}
