import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { db } from '@/api/db';
import { useAuth } from '@/lib/AuthContext';
import { canEditEvents, getMyRoleInClub } from '@/lib/clubs';
import { contactFor, eventFields, eventToForm, rememberContactPhone, validateEventForm } from '@/lib/events';
import EventFormFields from '@/components/EventFormFields';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Edit an existing event.
 *
 * Until now events were immutable once created: a typo in the venue meant
 * cancelling and recreating, which invalidates the RSVP link already shared and
 * throws away the RSVPs collected against it.
 */
export default function EventEdit() {
  const { clubSlug, eventId } = useParams();
  const { user } = useOutletContext() || {};
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [event, setEvent] = useState(null);
  const [role, setRole] = useState(null);
  const [form, setForm] = useState(null);
  const [rsvpCount, setRsvpCount] = useState(0);
  const [pastEvents, setPastEvents] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const ev = await db.Event.get(eventId);
      setEvent(ev);
      const initial = eventToForm(ev);
      // Events from before contacts existed: whoever edits it is the best guess.
      const noContact = !initial.contactName && !initial.contactEmail && !initial.contactPhone;
      setForm(noContact ? { ...initial, ...contactFor(user) } : initial);
      db.Event.filter({ club_id: ev.club_id }, '-starts_at', 50)
        .then((events) => setPastEvents(events.filter((e) => e.id !== ev.id)))
        .catch(() => {});
      if (user?.email) setRole(await getMyRoleInClub(ev.club_id, user.email));
      if (ev.status === 'published') {
        const rsvps = await db.RSVP.filter({ event_id: eventId, status: 'confirmed' });
        setRsvpCount(rsvps.length);
      }
    })().catch(() => toast.error('Could not load that event.'));
  }, [eventId, user?.email]);

  if (!event || !form) return <div className="text-sm text-muted-foreground">loading…</div>;
  if (!canEditEvents(role)) {
    return <div className="text-sm text-destructive">You need admin or owner access to edit events.</div>;
  }

  const save = async () => {
    // Not requireFuture: an event already under way should still be fixable.
    const problem = validateEventForm(form);
    if (problem) return toast.error(problem);

    setSaving(true);
    try {
      await db.Event.update(event.id, eventFields(form));
      if (await rememberContactPhone(form, user)) refresh();
      await db.AuditLog.create({
        club_id: event.club_id,
        event_id: event.id,
        action: 'event.updated',
        metadata: { title: form.title.trim() },
      });
      toast.success('Event updated');
      navigate(`/c/${clubSlug}/events/${event.id}`);
    } catch (err) {
      toast.error(err.message || 'Could not save your changes.');
      setSaving(false);
    }
  };

  const timeChanged = form.startsLocal !== eventToForm(event).startsLocal
    || form.endsLocal !== eventToForm(event).endsLocal;
  const placeChanged = form.locationName !== (event.location_name || '');

  return (
    <div className="max-w-2xl">
      <Link to={`/c/${clubSlug}/events/${event.id}`} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> back to event
      </Link>
      <h1 className="font-display font-bold text-3xl mt-3 mb-1">edit event</h1>
      <p className="text-sm text-muted-foreground mb-6">{event.title}</p>

      {/* People who already said yes were told a time and a place. Changing
          either after publishing is worth a deliberate pause. */}
      {event.status === 'published' && rsvpCount > 0 && (timeChanged || placeChanged) && (
        <div className="c3-card border-amber-400/40 bg-amber-400/5 p-4 mb-5 flex gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">
              {rsvpCount} {rsvpCount === 1 ? 'person has' : 'people have'} already RSVPed
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              You are changing the {timeChanged && placeChanged ? 'time and location' : timeChanged ? 'time' : 'location'}.
              connect3 will not notify them, so let them know yourself.
            </p>
          </div>
        </div>
      )}

      <EventFormFields form={form} onChange={setForm} clubId={event.club_id} user={user} pastEvents={pastEvents} />

      <div className="sticky bottom-3 z-10 mt-4">
        <div className="c3-card-soft p-2.5 flex items-center justify-end gap-2 shadow-sm [&>*]:whitespace-nowrap">
          <Link to={`/c/${clubSlug}/events/${event.id}`} className="c3-btn-ghost">cancel</Link>
          <button onClick={save} disabled={saving} className="c3-btn-primary">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} save changes
          </button>
        </div>
      </div>
    </div>
  );
}
