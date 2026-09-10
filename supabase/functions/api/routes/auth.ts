// Sign-up, sign-in, verification and password recovery.
//
// connect3 owns its identity. Supabase Auth is not used, so nothing here depends
// on auth.uid() and the whole flow stays on the app's own domain.

import { Hono } from "jsr:@hono/hono@4";
import {
  dummyVerify, hashPassword, randomNumericCode, randomToken, sha256Hex,
  timingSafeEqualStr, verifyPassword,
} from "../../_shared/crypto.ts";
import { db, isUniqueViolation, one } from "../../_shared/db.ts";
import { accountExistsEmail, resetEmail, sendEmail, verificationEmail } from "../../_shared/email.ts";
import {
  issueSession, publicUser, resolveActor, revokeAllSessions, type AppUserRecord,
} from "../../_shared/session.ts";
import { clampText, isValidEmail, normaliseEmail, passwordProblem } from "../../_shared/http.ts";

const CODE_TTL_MIN = 15;
const RESET_TTL_MIN = 60;
const RESEND_COOLDOWN_MS = 60000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MIN = 15;

export const authRoutes = new Hono();

const findUser = (email: string) =>
  one<AppUserRecord>(db().from("app_users").select("*").ilike("email", email).limit(1));

function appOrigin(req: Request): string {
  const configured = Deno.env.get("APP_ORIGIN");
  if (configured) return configured.replace(/\/$/, "");
  const origin = req.headers.get("origin") || req.headers.get("referer");
  if (origin) {
    try { return new URL(origin).origin; } catch { /* fall through */ }
  }
  return "http://localhost:5173";
}

/**
 * Starts a signup. The response is identical whether or not the address already
 * has an account, so this cannot be used to enumerate registered club emails;
 * the difference goes into the mail, which only the address owner can read.
 */
authRoutes.post("/register", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normaliseEmail(body.email);
  const fullName = clampText(body.full_name, 100);

  if (!isValidEmail(email)) return c.json({ error: "invalid_email", message: "Enter a valid email address." }, 400);
  const pw = passwordProblem(body.password);
  if (pw) return c.json({ error: "weak_password", message: pw }, 400);

  const generic = { ok: true, email, message: "Check your email for a 6-digit verification code." };
  const existing = await findUser(email);

  if (existing?.email_verified) {
    const mail = accountExistsEmail();
    await sendEmail(email, mail.subject, mail.html);
    return c.json(generic);
  }

  const code = randomNumericCode(6);
  const codeFields = {
    verification_code_hash: await sha256Hex(code),
    verification_expires_at: new Date(Date.now() + CODE_TTL_MIN * 60000).toISOString(),
    verification_attempts: 0,
  };

  if (existing) {
    // Unverified: treat a repeat signup as "send me a new code", and let them
    // correct the password or name they set the first time.
    await db().from("app_users").update({
      ...codeFields,
      password_hash: await hashPassword(body.password),
      full_name: fullName ?? existing.full_name,
    }).eq("id", existing.id);
  } else {
    const { error } = await db().from("app_users").insert({
      email, full_name: fullName,
      password_hash: await hashPassword(body.password),
      email_verified: false, status: "active", failed_login_attempts: 0,
      ...codeFields,
    });
    // Two simultaneous signups for one address: the loser reports the same
    // generic success, and the winner's code is the one that works.
    if (error && !isUniqueViolation(error)) throw new Error(error.message);
  }

  const mail = verificationEmail(code);
  if (!(await sendEmail(email, mail.subject, mail.html)).sent) {
    return c.json({ error: "email_send_failed", message: "We could not send your verification email. Please try again shortly." }, 502);
  }
  return c.json(generic);
});

/** Confirms the emailed code, then signs the user straight in. */
authRoutes.post("/verify-email", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normaliseEmail(body.email);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!isValidEmail(email) || !code) {
    return c.json({ error: "invalid_request", message: "Email and code are required." }, 400);
  }

  const user = await findUser(email);
  // One message for every failure below, so a wrong code and an unknown address
  // are indistinguishable.
  const invalid = () => c.json({ error: "invalid_code", message: "That code is incorrect or has expired." }, 400);

  if (!user) return invalid();
  if (user.email_verified) {
    return c.json({ error: "already_verified", message: "This email is already verified. Please sign in." }, 409);
  }
  if (!user.verification_code_hash || !user.verification_expires_at) return invalid();
  if (new Date(user.verification_expires_at as string).getTime() <= Date.now()) return invalid();
  if ((user.verification_attempts as number || 0) >= MAX_CODE_ATTEMPTS) {
    return c.json({ error: "too_many_attempts", message: "Too many incorrect codes. Request a new one." }, 429);
  }

  if (!timingSafeEqualStr(await sha256Hex(code), user.verification_code_hash as string)) {
    await db().from("app_users")
      .update({ verification_attempts: (user.verification_attempts as number || 0) + 1 })
      .eq("id", user.id);
    return invalid();
  }

  await db().from("app_users").update({
    email_verified: true,
    verification_code_hash: null, verification_expires_at: null, verification_attempts: 0,
    failed_login_attempts: 0, locked_until: null,
    last_login_at: new Date().toISOString(),
  }).eq("id", user.id);

  const token = randomToken();
  await issueSession(user.id, token, c.req.header("user-agent"));
  return c.json({ ok: true, token, user: publicUser({ ...user, email_verified: true }) });
});

authRoutes.post("/resend-code", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normaliseEmail(body.email);
  if (!isValidEmail(email)) return c.json({ error: "invalid_email", message: "Enter a valid email address." }, 400);

  const generic = { ok: true, message: "If that account needs verifying, a new code is on its way." };
  const user = await findUser(email);
  if (!user || user.email_verified) return c.json(generic);

  // Remaining lifetime tells us when the last code was issued.
  if (user.verification_expires_at) {
    const issuedAt = new Date(user.verification_expires_at as string).getTime() - CODE_TTL_MIN * 60000;
    if (Date.now() - issuedAt < RESEND_COOLDOWN_MS) {
      return c.json({ error: "cooldown", message: "Please wait a moment before requesting another code." }, 429);
    }
  }

  const code = randomNumericCode(6);
  await db().from("app_users").update({
    verification_code_hash: await sha256Hex(code),
    verification_expires_at: new Date(Date.now() + CODE_TTL_MIN * 60000).toISOString(),
    verification_attempts: 0,
  }).eq("id", user.id);

  const mail = verificationEmail(code);
  if (!(await sendEmail(email, mail.subject, mail.html)).sent) {
    return c.json({ error: "email_send_failed", message: "We could not send that email. Try again shortly." }, 502);
  }
  return c.json(generic);
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normaliseEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!isValidEmail(email) || !password) {
    return c.json({ error: "invalid_credentials", message: "Enter your email and password." }, 400);
  }

  const user = await findUser(email);
  const invalid = () => c.json({ error: "invalid_credentials", message: "Email or password is incorrect." }, 401);

  if (!user) {
    // Burn the time a real verification costs, so latency does not reveal
    // whether the address is registered.
    await dummyVerify();
    return invalid();
  }
  if (user.status === "disabled") {
    return c.json({ error: "account_disabled", message: "This account has been disabled." }, 403);
  }
  if (user.locked_until && new Date(user.locked_until as string).getTime() > Date.now()) {
    const mins = Math.max(1, Math.ceil((new Date(user.locked_until as string).getTime() - Date.now()) / 60000));
    const plural = mins === 1 ? "" : "s";
    return c.json({ error: "locked", message: "Too many failed attempts. Try again in " + mins + " minute" + plural + "." }, 429);
  }

  if (!(await verifyPassword(password, user.password_hash))) {
    const failures = (user.failed_login_attempts as number || 0) + 1;
    await db().from("app_users").update({
      failed_login_attempts: failures,
      locked_until: failures >= MAX_FAILED_LOGINS
        ? new Date(Date.now() + LOCKOUT_MIN * 60000).toISOString() : null,
    }).eq("id", user.id);
    return invalid();
  }

  if (!user.email_verified) {
    // Correct password but an unproven address. Being specific is safe here: the
    // caller already proved they hold the credentials, and it is the only way
    // they can recover.
    return c.json({ error: "email_not_verified", message: "Verify your email address to finish setting up your account.", email }, 403);
  }

  await db().from("app_users").update({
    failed_login_attempts: 0, locked_until: null, last_login_at: new Date().toISOString(),
  }).eq("id", user.id);

  const token = randomToken();
  await issueSession(user.id, token, c.req.header("user-agent"));
  return c.json({ ok: true, token, user: publicUser(user) });
});

/** The signed-in user plus their clubs and role in each, in one round trip. */
authRoutes.get("/me", async (c) => {
  const actor = await resolveActor(c.req.raw);
  if (!actor) return c.json({ error: "unauthenticated", message: "Sign in to continue." }, 401);

  const clubIds = [...new Set(actor.memberships.map((m) => m.club_id))];
  const clubs = clubIds.length
    ? (await db().from("clubs").select("*").in("id", clubIds).is("deleted_at", null)).data || []
    : [];

  const roleByClub = new Map(actor.memberships.map((m) => [m.club_id, m.role]));
  return c.json({
    user: publicUser(actor.user),
    clubs: clubs.map((club) => ({ ...club, role: roleByClub.get(club.id) })),
  });
});

/** Always reports success: the client discards its token regardless. */
authRoutes.post("/logout", async (c) => {
  const actor = await resolveActor(c.req.raw);
  if (actor) {
    await db().from("app_sessions")
      .update({ revoked_at: new Date().toISOString() }).eq("id", actor.sessionId);
  }
  return c.json({ ok: true });
});

authRoutes.post("/forgot-password", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normaliseEmail(body.email);
  if (!isValidEmail(email)) return c.json({ error: "invalid_email", message: "Enter a valid email address." }, 400);

  // Unconditional success: whether an account exists is not the caller's business.
  const generic = { ok: true, message: "If an account exists for that address, we have sent a reset link." };
  const user = await findUser(email);
  if (!user || user.status === "disabled") return c.json(generic);

  const token = randomToken();
  await db().from("app_users").update({
    reset_token_hash: await sha256Hex(token),
    reset_expires_at: new Date(Date.now() + RESET_TTL_MIN * 60000).toISOString(),
  }).eq("id", user.id);

  const link = appOrigin(c.req.raw) + "/reset-password?token=" + encodeURIComponent(token);
  const mail = resetEmail(link);
  await sendEmail(email, mail.subject, mail.html);
  return c.json(generic);
});

/**
 * Consumes a reset token and sets a new password, then revokes every session.
 * If the reset happened because the account was compromised, leaving the
 * attacker signed in would defeat the point.
 */
authRoutes.post("/reset-password", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const invalid = () => c.json({ error: "invalid_token", message: "This reset link is invalid or has expired." }, 400);

  if (!token) return invalid();
  const pw = passwordProblem(body.password);
  if (pw) return c.json({ error: "weak_password", message: pw }, 400);

  const tokenHash = await sha256Hex(token);
  const user = await one<AppUserRecord>(
    db().from("app_users").select("*").eq("reset_token_hash", tokenHash).limit(1),
  );
  if (!user?.reset_token_hash) return invalid();
  if (!timingSafeEqualStr(tokenHash, user.reset_token_hash as string)) return invalid();
  if (!user.reset_expires_at || new Date(user.reset_expires_at as string).getTime() <= Date.now()) return invalid();

  await db().from("app_users").update({
    password_hash: await hashPassword(body.password),
    reset_token_hash: null, reset_expires_at: null,
    failed_login_attempts: 0, locked_until: null,
    // Completing a reset proves control of the inbox, which is exactly what
    // signup verification checks.
    email_verified: true, verification_code_hash: null, verification_expires_at: null,
  }).eq("id", user.id);

  await revokeAllSessions(user.id);
  return c.json({ ok: true, message: "Password updated. You can sign in now." });
});

/** Signs out other devices but keeps the caller's own session alive. */
authRoutes.post("/change-password", async (c) => {
  const actor = await resolveActor(c.req.raw);
  if (!actor) return c.json({ error: "unauthenticated", message: "Sign in to continue." }, 401);

  const body = await c.req.json().catch(() => ({}));
  const pw = passwordProblem(body.new_password);
  if (pw) return c.json({ error: "weak_password", message: pw }, 400);

  const current = typeof body.current_password === "string" ? body.current_password : "";
  if (!(await verifyPassword(current, actor.user.password_hash))) {
    return c.json({ error: "wrong_password", message: "Your current password is incorrect." }, 400);
  }

  await db().from("app_users")
    .update({ password_hash: await hashPassword(body.new_password) }).eq("id", actor.user.id);
  await revokeAllSessions(actor.user.id, actor.sessionId);
  return c.json({ ok: true });
});
