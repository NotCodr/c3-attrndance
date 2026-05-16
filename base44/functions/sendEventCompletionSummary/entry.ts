import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Triggered by an entity automation when an Event transitions to status="completed".
// Emails owner+admin members a short summary of how the event went.
//
// Payload (from entity automation):
//   event: { type: "update", entity_name, entity_id }
//   data: current event
//   old_data: previous event
//   changed_fields: [...]
//   payload_too_large?: boolean

const MEL_TZ = 'Australia/Melbourne';

function fmtMoneyCents(c) {
  if (c == null) return '—';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(c / 100);
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-AU', { timeZone: MEL_TZ, dateStyle: 'medium', timeStyle: 'short' });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { event: trigger, data, old_data, payload_too_large } = body || {};

    if (!trigger || trigger.type !== 'update') {
      return Response.json({ skipped: 'not an update event' });
    }

    // Fetch fresh event if payload was too large
    let evt = data;
    if (payload_too_large || !evt) {
      const rows = await base44.asServiceRole.entities.Event.filter({ id: trigger.entity_id });
      evt = rows[0];
    }
    if (!evt) return Response.json({ skipped: 'event not found' });

    // Only fire when status flips TO completed (defensive — trigger_conditions also enforce this)
    if (evt.status !== 'completed') {
      return Response.json({ skipped: 'status is not completed' });
    }
    if (old_data && old_data.status === 'completed') {
      return Response.json({ skipped: 'already completed' });
    }

    // Pull related data via service role (admin-level reads)
    const [clubRows, rsvps, checkIns, photos, receipts, members] = await Promise.all([
      base44.asServiceRole.entities.Club.filter({ id: evt.club_id }),
      base44.asServiceRole.entities.RSVP.filter({ event_id: evt.id }),
      base44.asServiceRole.entities.CheckIn.filter({ event_id: evt.id }),
      base44.asServiceRole.entities.EventPhoto.filter({ event_id: evt.id }),
      base44.asServiceRole.entities.EventReceipt.filter({ event_id: evt.id }),
      base44.asServiceRole.entities.ClubMembership.filter({ club_id: evt.club_id }),
    ]);
    const club = clubRows[0];
    if (!club) return Response.json({ skipped: 'club not found' });

    const recipients = Array.from(new Set(
      members
        .filter((m) => m.role === 'owner' || m.role === 'admin')
        .map((m) => (m.user_email || '').trim().toLowerCase())
        .filter(Boolean)
    ));
    if (recipients.length === 0) {
      return Response.json({ skipped: 'no admin recipients' });
    }

    const confirmedRsvps = rsvps.filter((r) => r.status === 'confirmed').length;
    const totalCheckIns = checkIns.length;
    const showRate = confirmedRsvps > 0 ? Math.round((totalCheckIns / confirmedRsvps) * 100) : 0;
    const totalReceiptsCents = receipts.reduce((s, r) => s + (r.amount_cents || 0), 0);
    const grantUsedPct = evt.grant_amount_cents
      ? Math.round((totalReceiptsCents / evt.grant_amount_cents) * 100)
      : null;

    const subject = `[${club.name}] Event summary: ${evt.title}`;
    const body_html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#15102B;max-width:560px;margin:0 auto;padding:24px;">
        <div style="background:linear-gradient(135deg,#8E6FE8 0%,#C9B8F5 100%);color:#fff;padding:20px;border-radius:16px;margin-bottom:20px;">
          <p style="margin:0;font-size:12px;opacity:0.85;letter-spacing:0.08em;text-transform:uppercase;">${club.name}</p>
          <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;">${evt.title}</h1>
          <p style="margin:6px 0 0;font-size:13px;opacity:0.9;">${fmtDate(evt.starts_at)} · ${evt.location_name || ''}</p>
        </div>

        <h2 style="font-size:14px;margin:0 0 12px;color:#15102B;">How it went</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;color:#666;">Confirmed RSVPs</td><td style="padding:8px 0;text-align:right;font-weight:600;">${confirmedRsvps}</td></tr>
          <tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee;">Checked in</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #eee;">${totalCheckIns}</td></tr>
          <tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee;">Show rate</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #eee;color:#8E6FE8;">${showRate}%</td></tr>
          <tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee;">Photos uploaded</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #eee;">${photos.length}</td></tr>
          <tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee;">Receipts</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #eee;">${receipts.length} · ${fmtMoneyCents(totalReceiptsCents)}</td></tr>
          ${evt.is_grant_funded ? `
          <tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee;">Grant (${evt.grant_category || '—'})</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #eee;">${fmtMoneyCents(evt.grant_amount_cents)}${grantUsedPct != null ? ` · ${grantUsedPct}% used` : ''}</td></tr>` : ''}
        </table>

        ${evt.is_grant_funded ? `
        <div style="background:#FFF6E5;border:1px solid #F6D67A;border-radius:12px;padding:14px;margin-top:20px;font-size:13px;color:#7A5A10;">
          <strong>Next step:</strong> finalise the acquittal pack and submit to UMSU.
        </div>` : ''}

        <p style="font-size:12px;color:#888;margin-top:24px;line-height:1.6;">
          Sent automatically by connect3 because <strong>${evt.title}</strong> was marked completed.
          You're receiving this as an admin or owner of <strong>${club.name}</strong>.
        </p>
      </div>
    `;

    // Send to each recipient (no built-in BCC support, send individually)
    const sent = [];
    for (const to of recipients) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to,
          subject,
          body: body_html,
          from_name: 'connect3',
        });
        sent.push(to);
      } catch (err) {
        console.error('SendEmail failed for', to, err?.message || err);
      }
    }

    // Audit log
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        club_id: club.id,
        event_id: evt.id,
        action: 'event.summary_emailed',
        metadata: { recipients: sent, confirmedRsvps, totalCheckIns, showRate },
      });
    } catch (err) {
      console.error('AuditLog write failed', err?.message || err);
    }

    return Response.json({ ok: true, recipients: sent, stats: { confirmedRsvps, totalCheckIns, showRate } });
  } catch (error) {
    console.error('sendEventCompletionSummary error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});