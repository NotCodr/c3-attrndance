import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { db } from '@/api/db';
import { useAuth } from '@/lib/AuthContext';
import { getClubBySlug } from '@/lib/clubs';
import { formatDate } from '@/lib/format';
import {
  buildCreatePayload, emptyEventForm, formFromPastEvent, rememberContactPhone, validateEventForm,
} from '@/lib/events';
import EventFormFields from '@/components/EventFormFields';
import { CopyPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function EventNew() {
  const { clubSlug } = useParams();
  const navigate = useNavigate();
  const { user } = useOutletContext() || {};
  const { refresh } = useAuth();
  const [club, setClub] = useState(null);
  const [pastEvents, setPastEvents] = useState([]);
  const [form, setForm] = useState(() => emptyEventForm({ user }));
  const [saving, setSaving] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const c = await getClubBySlug(clubSlug);
      if (!live || !c) return;
      setClub(c);
      const events = await db.Event.filter({ club_id: c.id }, '-starts_at', 50);
      if (!live) return;
      setPastEvents(events);
      // Better guesses now we know how this club usually runs things.
      if (!touched.current) setForm(emptyEventForm({ user, pastEvents: events }));
    })().catch(() => {});
    return () => { live = false; };
  }, [clubSlug]);

  const change = (next) => {
    touched.current = true;
    setForm(next);
  };

  const reuse = (id) => {
    const ev = pastEvents.find((e) => e.id === id);
    if (!ev) return;
    change(formFromPastEvent(ev, form));
    toast.success(`Copied from "${ev.title}". Check the date and details.`);
  };

  const save = async (publish) => {
    const problem = validateEventForm(form, { requireFuture: publish });
    if (problem) return toast.error(problem);
    if (!club) return;

    setSaving(true);
    try {
      const ev = await db.Event.create(buildCreatePayload(form, club, publish));
      await db.AuditLog.create({
        club_id: club.id,
        event_id: ev.id,
        action: publish ? 'event.published' : 'event.created',
        metadata: { title: ev.title },
      });
      if (await rememberContactPhone(form, user)) refresh();
      toast.success(publish ? 'Published' : 'Saved as draft');
      navigate(`/c/${clubSlug}/events/${ev.id}`);
    } catch (err) {
      toast.error(err.message || 'Could not save the event.');
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="font-display font-bold text-3xl mb-1">create event</h1>
      <p className="text-sm text-muted-foreground mb-6">Save a draft now, publish when you're ready.</p>

      {pastEvents.length > 0 && (
        <div className="c3-card-soft p-3 mb-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <label htmlFor="ev-reuse" className="flex items-center gap-2 text-sm font-medium shrink-0 sm:pl-1">
            <CopyPlus className="w-4 h-4 text-muted-foreground" /> start from a past event
          </label>
          <select id="ev-reuse" className="c3-input py-2 sm:ml-auto sm:max-w-xs" value=""
            onChange={(e) => reuse(e.target.value)}>
            <option value="">choose one</option>
            {pastEvents.slice(0, 20).map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title} · {formatDate(ev.starts_at, { weekday: undefined })}
              </option>
            ))}
          </select>
        </div>
      )}

      <EventFormFields form={form} onChange={change} clubId={club?.id} user={user} pastEvents={pastEvents} autoFocus />

      <div className="sticky bottom-3 z-10 mt-4">
        <div className="c3-card-soft p-2.5 flex items-center justify-end gap-2 shadow-sm [&>*]:whitespace-nowrap">
          <button onClick={() => save(false)} disabled={saving} className="c3-btn-secondary">
            save as draft
          </button>
          <button onClick={() => save(true)} disabled={saving} className="c3-btn-primary">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} publish
          </button>
        </div>
      </div>
    </div>
  );
}
