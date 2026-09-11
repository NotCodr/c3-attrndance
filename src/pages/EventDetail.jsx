import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { db } from '@/api/db';
import { getMyRoleInClub, canEditEvents, canScan, canManageAcquittal } from '@/lib/clubs';
import { formatEventTimeRange, formatMoneyCents, randomToken, slugify } from '@/lib/format';
import { Calendar, MapPin, Users, ScanLine, FileText, ExternalLink, Copy, AlertTriangle, X, Receipt, Pencil } from 'lucide-react';
import { toast } from 'sonner';

export default function EventDetail() {
  const { clubSlug, eventId } = useParams();
  const { user } = useOutletContext() || {};
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [club, setClub] = useState(null);
  const [role, setRole] = useState(null);
  const [rsvps, setRsvps] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [receipts, setReceipts] = useState([]);

  const reload = async () => {
    const evs = await db.Event.filter({ id: eventId });
    setEvent(evs[0]);
    const clubs = await db.Club.filter({ id: evs[0].club_id });
    setClub(clubs[0]);
    if (user?.email) setRole(await getMyRoleInClub(evs[0].club_id, user.email));
    setRsvps(await db.RSVP.filter({ event_id: eventId }));
    setCheckIns(await db.CheckIn.filter({ event_id: eventId }, 'checked_in_at'));
    setPhotos(await db.EventPhoto.filter({ event_id: eventId }));
    setReceipts(await db.EventReceipt.filter({ event_id: eventId }));
  };
  useEffect(() => { reload(); }, [eventId, user?.email]);

  if (!event || !club) return <div className="text-sm text-muted-foreground">loading…</div>;

  const publicUrl = `${window.location.origin}/rsvp/${event.id}`;
  const confirmedRsvps = rsvps.filter((r) => r.status === 'confirmed');
  const waitlisted = rsvps.filter((r) => r.status === 'waitlisted');

  const publish = async () => {
    if (event.status === 'published') return;
    await db.Event.update(event.id, {
      status: 'published',
      published_at: new Date().toISOString(),
      public_slug: event.public_slug || `${slugify(event.title)}-${randomToken(6)}`,
      qr_token: event.qr_token || randomToken(32),
    });
    await db.AuditLog.create({ club_id: club.id, event_id: event.id, action: 'event.published', actor_email: user?.email });
    toast.success('Published');
    reload();
  };
  const cancel = async () => {
    const reason = prompt('Cancellation reason (optional):') || undefined;
    await db.Event.update(event.id, { status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: reason });
    await db.AuditLog.create({ club_id: club.id, event_id: event.id, action: 'event.cancelled', actor_email: user?.email, metadata: { reason } });
    toast.success('Cancelled');
    reload();
  };
  const markCompleted = async () => {
    await db.Event.update(event.id, { status: 'completed' });
    toast.success('Marked completed');
    reload();
  };
  const copyLink = async () => {
    await navigator.clipboard.writeText(publicUrl);
    toast.success('Copied');
  };
  const downloadAttendance = async () => {
    try {
      // Loaded on demand: the PDF library is large and most visits never need it.
      const { generateAttendancePdf } = await import('@/lib/pdf');
      await generateAttendancePdf({ event, club, checkIns });
    } catch (err) {
      toast.error(err.message || 'Could not build the attendance PDF.');
    }
  };

  const eventEnded = new Date(event.ends_at) < new Date();

  return (
    <div>
      <Link to={`/c/${clubSlug}/events`} className="text-xs text-muted-foreground hover:text-foreground">← all events</Link>

      <div className="flex items-start justify-between mt-3 mb-6 gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>{event.status}</span>
            {event.is_grant_funded && <span className="c3-badge">grant · {event.grant_category} · {formatMoneyCents(event.grant_amount_cents)}</span>}
          </div>
          <h1 className="text-2xl font-medium">{event.title}</h1>
          <p className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {formatEventTimeRange(event.starts_at, event.ends_at)}</span>
            <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {event.location_name}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {canEditEvents(role) && event.status !== 'cancelled' && (
            <Link to={`/c/${clubSlug}/events/${event.id}/edit`} className="c3-btn-secondary">
              <Pencil className="w-3.5 h-3.5" /> edit
            </Link>
          )}
          {event.status === 'draft' && canEditEvents(role) && (
            <button onClick={publish} className="c3-btn-primary">publish</button>
          )}
          {event.status === 'published' && eventEnded && canEditEvents(role) && (
            <button onClick={markCompleted} className="c3-btn-secondary">mark completed</button>
          )}
          {event.status !== 'cancelled' && event.status !== 'completed' && canEditEvents(role) && (
            <button onClick={cancel} className="c3-btn-ghost text-destructive"><X className="w-3.5 h-3.5" /> cancel</button>
          )}
        </div>
      </div>

      {event.status === 'cancelled' && (
        <div className="c3-card border-destructive/50 p-4 mb-6 text-sm flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
          <div>
            <p className="text-foreground">Event cancelled</p>
            {event.cancellation_reason && <p className="text-muted-foreground text-xs mt-1">{event.cancellation_reason}</p>}
          </div>
        </div>
      )}

      {/* Public link */}
      {event.status === 'published' && (
        <div className="c3-card p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <p className="text-xs text-muted-foreground">public rsvp page</p>
          <code className="text-xs flex-1 truncate font-mono text-foreground/80">{publicUrl}</code>
          <div className="flex gap-2">
            <button onClick={copyLink} className="c3-btn-secondary text-xs"><Copy className="w-3.5 h-3.5" /> copy</button>
            <a href={publicUrl} target="_blank" rel="noreferrer" className="c3-btn-secondary text-xs"><ExternalLink className="w-3.5 h-3.5" /> open</a>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="RSVPs" value={confirmedRsvps.length} sub={waitlisted.length ? `${waitlisted.length} waitlisted` : null} />
        <Stat label="checked in" value={checkIns.length} />
        <Stat label="photos" value={photos.length} />
        <Stat label="receipts" value={receipts.length} sub={formatMoneyCents(receipts.reduce((s, r) => s + (r.amount_cents || 0), 0))} />
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        {canScan(role) && event.status === 'published' && (
          <Link to={`/c/${clubSlug}/events/${event.id}/scan`} className="c3-card p-4 hover:bg-secondary/30 transition">
            <ScanLine className="w-5 h-5 text-primary mb-2" />
            <p className="font-medium text-sm">scanner</p>
            <p className="text-xs text-muted-foreground mt-0.5">QR check-in at the door</p>
          </Link>
        )}
        {canManageAcquittal(role) && (
          <Link to={`/c/${clubSlug}/events/${event.id}/grant`} className="c3-card p-4 hover:bg-secondary/30 transition">
            <FileText className="w-5 h-5 text-primary mb-2" />
            <p className="font-medium text-sm">grant pack</p>
            <p className="text-xs text-muted-foreground mt-0.5">{event.is_grant_funded ? 'photos, receipts, AFP' : 'photos & report'}</p>
          </Link>
        )}
        {canManageAcquittal(role) && checkIns.length > 0 && (
          <button onClick={downloadAttendance} className="c3-card p-4 hover:bg-secondary/30 transition text-left">
            <Receipt className="w-5 h-5 text-primary mb-2" />
            <p className="font-medium text-sm">attendance pdf</p>
            <p className="text-xs text-muted-foreground mt-0.5">{checkIns.length} checked in</p>
          </button>
        )}
      </div>

      {/* RSVP list */}
      <section className="mb-8">
        <h2 className="text-sm text-muted-foreground mb-3 flex items-center gap-2"><Users className="w-3.5 h-3.5" /> RSVPs ({confirmedRsvps.length})</h2>
        {confirmedRsvps.length === 0 ? <p className="text-sm text-muted-foreground italic">No RSVPs yet.</p> : (
          <div className="c3-card divide-y divide-border">
            {confirmedRsvps.map((r) => {
              const ci = checkIns.find((c) => c.rsvp_id === r.id);
              return (
                <div key={r.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.email}{r.student_number && ` · ${r.student_number}`}{r.course && ` · ${r.course}`}</p>
                  </div>
                  {ci ? (
                    <span className="text-xs text-primary shrink-0">✓ checked in</span>
                  ) : (
                    <span className="text-xs text-muted-foreground shrink-0">waiting</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="c3-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-medium mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}