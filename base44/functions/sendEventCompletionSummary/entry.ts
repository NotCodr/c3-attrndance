import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { sendEmail } from "../../shared/email.ts";
import { ok, readJson } from "../../shared/http.ts";

/**
 * Emails a club's owners and admins a summary when an event is marked completed.
 *
 * Invoked by the "Email admins when event completes" workflow. That workflow has
 * been referencing this function by name while it did not exist anywhere, so
 * every completed event failed silently; this is the missing implementation.
 */
export default async function (req: Request): Promise<Response> {
  const svc = createClientFromRequest(req).asServiceRole;
  const body = await readJson<any>(req);

  // Entity triggers deliver the changed record under a few shapes depending on
  // how the workflow was migrated, so accept any of them.
  const eventId = body?.event_id || body?.id || body?.data?.id || body?.trigger?.data?.id;
  if (!eventId) return ok({ ok: false, reason: "no event id in payload" });

  const event = await svc.entities.Event.get(eventId).catch(() => null);
  if (!event) return ok({ ok: false, reason: "event not found" });
  if (event.status !== "completed") return ok({ ok: false, reason: "event is not completed" });

  const club = await svc.entities.Club.get(event.club_id).catch(() => null);

  const [rsvps, checkIns, receipts] = await Promise.all([
    svc.entities.RSVP.filter({ event_id: event.id }),
    svc.entities.CheckIn.filter({ event_id: event.id }),
    svc.entities.EventReceipt.filter({ event_id: event.id }),
  ]);

  const confirmed = rsvps.filter((r: any) => r.status === "confirmed").length;
  const totalCents = receipts.reduce((s: number, r: any) => s + (r.amount_cents || 0), 0);
  const showRate = confirmed > 0 ? Math.round((checkIns.length / confirmed) * 100) : 0;
  const money = (cents: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);

  const memberships = await svc.entities.ClubMembership.filter({ club_id: event.club_id });
  const recipients = [
    ...new Set(
      memberships
        .filter((m: any) => m.role === "owner" || m.role === "admin")
        .map((m: any) => String(m.user_email).toLowerCase()),
    ),
  ];
  if (recipients.length === 0) return ok({ ok: false, reason: "no owner or admin to notify" });

  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#6b6b76;font-size:13px">${label}</td><td style="padding:6px 0;text-align:right;font-weight:600;font-size:13px">${value}</td></tr>`;

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0a0a0f">
  <p style="font-size:20px;font-weight:700;margin:0 0 4px">connect3</p>
  <p style="font-size:13px;color:#6b6b76;margin:0 0 24px">${club?.name || "Your club"}</p>
  <p style="font-size:16px;font-weight:600;margin:0 0 4px">${event.title}</p>
  <p style="font-size:13px;color:#6b6b76;margin:0 0 20px">Marked completed. Here's how it went.</p>
  <table style="width:100%;border-collapse:collapse;border-top:1px solid #e5e5e8">
    ${row("RSVPs confirmed", String(confirmed))}
    ${row("Checked in", String(checkIns.length))}
    ${row("Show rate", `${showRate}%`)}
    ${row("Receipts", `${receipts.length} &middot; ${money(totalCents)}`)}
    ${event.is_grant_funded ? row("Grant category", event.grant_category || "-") : ""}
  </table>
  ${
    event.is_grant_funded
      ? `<p style="font-size:13px;color:#6b6b76;margin:24px 0 0">This event was grant funded, so an acquittal pack is due to ${club?.union_name || "your union"}.</p>`
      : ""
  }
</div>`;

  const results = await Promise.all(
    recipients.map((to) => sendEmail(svc, to as string, `${event.title} - event summary`, html)),
  );

  return ok({ ok: true, notified: results.filter((r) => r.sent).length, recipients: recipients.length });
}
