// Event-completion summary.
//
// An earlier backend drove this from a workflow pointing at a function that had
// never been deployed, so every completed event silently notified nobody. It now
// runs inline from the status transition in the data gateway, so there is no
// separate artefact to fall out of sync.

import { db } from "../../_shared/db.ts";
import { eventSummaryEmail, sendEmail } from "../../_shared/email.ts";

export async function notifyEventCompleted(eventId: string): Promise<void> {
  const supabase = db();

  const { data: event } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
  if (!event || event.status !== "completed") return;

  const { data: club } = await supabase.from("clubs").select("*").eq("id", event.club_id).maybeSingle();

  const [rsvps, checkIns, receipts, memberships] = await Promise.all([
    supabase.from("rsvps").select("status").eq("event_id", eventId),
    supabase.from("check_ins").select("id").eq("event_id", eventId),
    supabase.from("event_receipts").select("amount_cents").eq("event_id", eventId),
    supabase.from("club_memberships").select("user_email,role").eq("club_id", event.club_id),
  ]);

  const confirmed = (rsvps.data || []).filter((r) => r.status === "confirmed").length;
  const checkedIn = (checkIns.data || []).length;
  const totalCents = (receipts.data || []).reduce((s, r) => s + (r.amount_cents || 0), 0);

  const recipients = [...new Set(
    (memberships.data || [])
      .filter((m) => m.role === "owner" || m.role === "admin")
      .map((m) => String(m.user_email).toLowerCase()),
  )];
  if (recipients.length === 0) return;

  const mail = eventSummaryEmail({
    clubName: club?.name || "Your club",
    title: event.title,
    confirmed,
    checkedIn,
    showRate: confirmed > 0 ? Math.round((checkedIn / confirmed) * 100) : 0,
    receipts: (receipts.data || []).length,
    totalCents,
    grantCategory: event.is_grant_funded ? event.grant_category : null,
    unionName: club?.union_name,
  });

  await Promise.all(recipients.map((to) => sendEmail(to, mail.subject, mail.html)));
}
