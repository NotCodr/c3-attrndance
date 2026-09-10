import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '@/api/db';
import { getClubBySlug } from '@/lib/clubs';
import { buildCreatePayload, emptyEventForm, validateEventForm } from '@/lib/events';
import EventFormFields from '@/components/EventFormFields';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function EventNew() {
  const { clubSlug } = useParams();
  const navigate = useNavigate();
  const [club, setClub] = useState(null);
  const [form, setForm] = useState(emptyEventForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => setClub(await getClubBySlug(clubSlug)))();
  }, [clubSlug]);

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
      <p className="text-sm text-muted-foreground mb-6">Save a draft now, publish later.</p>

      <EventFormFields form={form} onChange={setForm} clubId={club?.id} />

      <div className="flex justify-end gap-2 pt-4">
        <button onClick={() => save(false)} disabled={saving} className="c3-btn-secondary">
          save as draft
        </button>
        <button onClick={() => save(true)} disabled={saving} className="c3-btn-primary">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} publish
        </button>
      </div>
    </div>
  );
}
