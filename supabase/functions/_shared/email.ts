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

const SIGNUP_FOOTER =
  "You received this because someone used this address to sign up for connect3. " +
  "If that was not you, you can ignore this email.";

const SHELL = (body: string, footer: string = SIGNUP_FOOTER) => `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0a0a0f">
  <p style="font-size:20px;font-weight:700;margin:0 0 24px">connect3</p>
  ${body}
  <hr style="border:none;border-top:1px solid #e5e5e8;margin:32px 0 16px" />
  <p style="font-size:12px;color:#6b6b76;margin:0">${footer}</p>
</div>`;

const button = (href: string, label: string) =>
  `<p style="margin:0 0 20px"><a href="${href}" style="display:inline-block;background:#b5a8f0;color:#0a0a0f;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px">${label}</a></p>`;

const detailRow = (label: string, value: string) =>
  `<tr><td style="padding:5px 0;color:#6b6b76;font-size:13px;white-space:nowrap;padding-right:16px">${label}</td><td style="padding:5px 0;font-size:13px">${value}</td></tr>`;

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

const ATTENDEE_FOOTER =
  "You received this because you RSVPed to this event with connect3.";

/**
 * The attendee's ticket.
 *
 * Links to a page rather than embedding the QR as an image: most mail clients
 * block inline base64 images, and a link also gives the attendee somewhere to
 * come back to when they inevitably close the tab.
 */
export function ticketEmail(v: {
  title: string; clubName: string; whenText: string; location: string;
  ticketUrl: string; waitlisted: boolean;
}): { subject: string; html: string } {
  const details = `
    <table style="border-collapse:collapse;margin:0 0 20px">
      ${detailRow("When", v.whenText)}
      ${detailRow("Where", v.location)}
      ${detailRow("Club", v.clubName)}
    </table>`;

  if (v.waitlisted) {
    return {
      subject: "You are on the waitlist for " + v.title,
      html: SHELL(`
        <p style="font-size:17px;font-weight:600;margin:0 0 4px">${v.title}</p>
        <p style="font-size:14px;color:#6b6b76;margin:0 0 20px">This event is full, so you are on the waitlist. We will email you if a place opens up.</p>
        ${details}
        ${button(v.ticketUrl, "View your place")}
        <p style="font-size:12px;color:#6b6b76;margin:0">Keep this link. You can check your place or withdraw from it here.</p>
      `, ATTENDEE_FOOTER),
    };
  }

  return {
    subject: "You are going to " + v.title,
    html: SHELL(`
      <p style="font-size:17px;font-weight:600;margin:0 0 4px">${v.title}</p>
      <p style="font-size:14px;color:#6b6b76;margin:0 0 20px">You are on the list. Show your QR code at the door.</p>
      ${details}
      ${button(v.ticketUrl, "Open your ticket")}
      <p style="font-size:12px;color:#6b6b76;margin:0">Keep this link. It has your QR code, and you can cancel from there if your plans change.</p>
    `, ATTENDEE_FOOTER),
  };
}

/** Sent when a cancellation frees a seat and the next person is promoted. */
export function waitlistPromotedEmail(v: {
  title: string; whenText: string; location: string; ticketUrl: string;
}): { subject: string; html: string } {
  return {
    subject: "A place opened up at " + v.title,
    html: SHELL(`
      <p style="font-size:17px;font-weight:600;margin:0 0 4px">${v.title}</p>
      <p style="font-size:14px;color:#6b6b76;margin:0 0 20px">Someone cancelled, so you are off the waitlist and on the list.</p>
      <table style="border-collapse:collapse;margin:0 0 20px">
        ${detailRow("When", v.whenText)}
        ${detailRow("Where", v.location)}
      </table>
      ${button(v.ticketUrl, "Open your ticket")}
      <p style="font-size:12px;color:#6b6b76;margin:0">If you can no longer make it, please cancel so the place can go to someone else.</p>
    `, ATTENDEE_FOOTER),
  };
}

/** Sent when a committee member adds someone to a club. */
export function committeeInviteEmail(v: {
  clubName: string; role: string; invitedBy: string; signInUrl: string; isNewUser: boolean;
}): { subject: string; html: string } {
  return {
    subject: v.invitedBy + " added you to " + v.clubName + " on connect3",
    html: SHELL(`
      <p style="font-size:15px;margin:0 0 8px"><strong>${v.invitedBy}</strong> added you to <strong>${v.clubName}</strong> as <strong>${v.role}</strong>.</p>
      <p style="font-size:13px;color:#6b6b76;margin:0 0 20px">connect3 runs the club's events, door check-in and grant acquittals.</p>
      ${button(v.signInUrl, v.isNewUser ? "Create your account" : "Sign in")}
      <p style="font-size:12px;color:#6b6b76;margin:0">
        ${v.isNewUser
          ? "Use this email address when you sign up, so your access connects automatically."
          : "You already have a connect3 account. Sign in and the club will be waiting."}
      </p>
    `, "You received this because a connect3 club committee added this address."),
  };
}
