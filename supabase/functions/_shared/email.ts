// Transactional email for signup verification and password resets.
//
// Resend only. The Base44 build had a fallback to that platform's built-in
// mailer, which documented itself as sending "to registered users" - a brand new
// connect3 signup is not one, so it was never a dependable path. With that gone
// there is one provider and one failure mode: if RESEND_API_KEY is missing or a
// send fails, the caller is told the code could not be delivered rather than
// being left waiting for mail that will never arrive.

export interface SendResult {
  sent: boolean;
  error?: string;
}

function fromAddress(): string {
  return Deno.env.get("MAIL_FROM") || "connect3 <onboarding@resend.dev>";
}

export async function sendEmail(to: string, subject: string, html: string): Promise<SendResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("[email] RESEND_API_KEY is not set; cannot send to", to);
    return { sent: false, error: "email is not configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromAddress(), to: [to], subject, html }),
    });
    if (!res.ok) {
      console.error("[email] resend responded", res.status, await res.text());
      return { sent: false, error: "resend " + res.status };
    }
    return { sent: true };
  } catch (e) {
    console.error("[email] resend threw:", (e as Error).message);
    return { sent: false, error: (e as Error).message };
  }
}

const SHELL = (body: string) => `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0a0a0f">
  <p style="font-size:20px;font-weight:700;margin:0 0 24px">connect3</p>
  ${body}
  <hr style="border:none;border-top:1px solid #e5e5e8;margin:32px 0 16px" />
  <p style="font-size:12px;color:#6b6b76;margin:0">
    You received this because someone used this address to sign up for connect3.
    If that was not you, you can ignore this email.
  </p>
</div>`;

export function verificationEmail(code: string): { subject: string; html: string } {
  return {
    subject: code + " is your connect3 verification code",
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

export function accountExistsEmail(): { subject: string; html: string } {
  return {
    subject: "You already have a connect3 account",
    html: SHELL(`
      <p style="font-size:15px;margin:0 0 12px">Someone tried to create a connect3 account with this address, but one already exists.</p>
      <p style="font-size:13px;color:#6b6b76;margin:0">Sign in instead, or use "forgot password" if you cannot get in.</p>
    `),
  };
}

export function eventSummaryEmail(v: {
  clubName: string; title: string; confirmed: number; checkedIn: number;
  showRate: number; receipts: number; totalCents: number;
  grantCategory?: string | null; unionName?: string | null;
}): { subject: string; html: string } {
  const money = (c: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(c / 100);
  const row = (l: string, val: string) =>
    `<tr><td style="padding:6px 0;color:#6b6b76;font-size:13px">${l}</td><td style="padding:6px 0;text-align:right;font-weight:600;font-size:13px">${val}</td></tr>`;
  return {
    subject: v.title + " - event summary",
    html: SHELL(`
      <p style="font-size:13px;color:#6b6b76;margin:0 0 20px">${v.clubName}</p>
      <p style="font-size:16px;font-weight:600;margin:0 0 4px">${v.title}</p>
      <p style="font-size:13px;color:#6b6b76;margin:0 0 20px">Marked completed. Here is how it went.</p>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #e5e5e8">
        ${row("RSVPs confirmed", String(v.confirmed))}
        ${row("Checked in", String(v.checkedIn))}
        ${row("Show rate", v.showRate + "%")}
        ${row("Receipts", v.receipts + " &middot; " + money(v.totalCents))}
        ${v.grantCategory ? row("Grant category", v.grantCategory) : ""}
      </table>
      ${v.grantCategory ? `<p style="font-size:13px;color:#6b6b76;margin:24px 0 0">This event was grant funded, so an acquittal pack is due to ${v.unionName || "your union"}.</p>` : ""}
    `),
  };
}
