// Transactional email for signup verification and password resets.
//
// Two providers, in priority order:
//
//   1. Resend, if RESEND_API_KEY is set. Preferred, because Base44's built-in
//      integration documents itself as sending "to registered users" — and a
//      brand-new connect3 signup is by definition not a registered Base44 user,
//      so relying on it for the verification email is a gamble.
//   2. Base44 Core.SendEmail, as a fallback so the app still functions before
//      any mail provider is configured.
//
// If neither can send, the caller is told the code could not be delivered rather
// than being left waiting for an email that will never arrive.

import { secrets } from "base44:runtime";

export interface SendResult {
  sent: boolean;
  provider: "resend" | "base44" | "none";
  error?: string;
}

function fromAddress(): string {
  return secrets.get("MAIL_FROM") || "connect3 <onboarding@resend.dev>";
}

async function sendViaResend(apiKey: string, to: string, subject: string, html: string): Promise<SendResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: fromAddress(), to: [to], subject, html }),
  });
  if (!res.ok) {
    return { sent: false, provider: "resend", error: `Resend responded ${res.status}: ${await res.text()}` };
  }
  return { sent: true, provider: "resend" };
}

export async function sendEmail(svc: any, to: string, subject: string, html: string): Promise<SendResult> {
  const resendKey = secrets.get("RESEND_API_KEY");
  if (resendKey) {
    try {
      const result = await sendViaResend(resendKey, to, subject, html);
      if (result.sent) return result;
      console.error("[email] resend failed, falling back to Base44:", result.error);
    } catch (e) {
      console.error("[email] resend threw, falling back to Base44:", (e as Error).message);
    }
  }

  try {
    await svc.integrations.Core.SendEmail({ to, subject, body: html, from_name: "connect3" });
    return { sent: true, provider: "base44" };
  } catch (e) {
    const error = (e as Error).message || "unknown error";
    console.error("[email] Base44 SendEmail failed:", error);
    return { sent: false, provider: "none", error };
  }
}

const SHELL = (body: string) => `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0a0a0f">
  <p style="font-size:20px;font-weight:700;margin:0 0 24px">connect3</p>
  ${body}
  <hr style="border:none;border-top:1px solid #e5e5e8;margin:32px 0 16px" />
  <p style="font-size:12px;color:#6b6b76;margin:0">
    You received this because someone used this address to sign up for connect3.
    If that wasn't you, you can ignore this email.
  </p>
</div>`;

export function verificationEmail(code: string): { subject: string; html: string } {
  return {
    subject: `${code} is your connect3 verification code`,
    html: SHELL(`
      <p style="font-size:15px;margin:0 0 8px">Confirm your email to finish setting up your club.</p>
      <p style="font-size:13px;color:#6b6b76;margin:0 0 20px">Enter this code in the app:</p>
      <p style="font-size:34px;font-weight:700;letter-spacing:7px;margin:0 0 20px">${code}</p>
      <p style="font-size:13px;color:#6b6b76;margin:0">This code expires in 15 minutes.</p>
    `),
  };
}

export function resetEmail(link: string): { subject: string; html: string } {
  return {
    subject: "Reset your connect3 password",
    html: SHELL(`
      <p style="font-size:15px;margin:0 0 20px">Someone asked to reset the password for this connect3 account.</p>
      <p style="margin:0 0 20px">
        <a href="${link}" style="display:inline-block;background:#b5a8f0;color:#0a0a0f;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px">Choose a new password</a>
      </p>
      <p style="font-size:12px;color:#6b6b76;margin:0 0 8px">Or paste this link into your browser:</p>
      <p style="font-size:12px;color:#6b6b76;word-break:break-all;margin:0 0 20px">${link}</p>
      <p style="font-size:13px;color:#6b6b76;margin:0">This link expires in 1 hour and can only be used once.</p>
    `),
  };
}
