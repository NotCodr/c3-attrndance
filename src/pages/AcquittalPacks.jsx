import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db } from '@/api/db';
import { getClubBySlug } from '@/lib/clubs';
import { formatMoneyCents, formatDate } from '@/lib/format';
import { FileText } from 'lucide-react';

export default function AcquittalPacks() {
  const { clubSlug } = useParams();
  const [club, setClub] = useState(null);
  const [packs, setPacks] = useState([]);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    (async () => {
      const c = await getClubBySlug(clubSlug);
      if (!c) return;
      setClub(c);
      setPacks(await db.AcquittalPack.filter({ club_id: c.id }, '-created_date'));
      setEvents(await db.Event.filter({ club_id: c.id }, '-starts_at', 500));
    })();
  }, [clubSlug]);

  if (!club) return <div className="text-sm text-muted-foreground">loading…</div>;
  const eventById = (id) => events.find((e) => e.id === id);

  return (
    <div>
      <h1 className="text-2xl font-medium mb-1">acquittal packs</h1>
      <p className="text-sm text-muted-foreground mb-6">All packs generated for {club.name}.</p>

      {packs.length === 0 && <p className="text-sm text-muted-foreground italic">No packs yet.</p>}
      <div className="space-y-2">
        {packs.map((p) => {
          const e = eventById(p.event_id);
          return (
            <div key={p.id} className="c3-card p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{e?.title || 'Event'}</p>
                <p className="text-xs text-muted-foreground">
                  v{p.version} · {p.attendee_count} attendees · {formatMoneyCents(p.total_receipts_cents)}
                  {e && ` · ${formatDate(e.starts_at)}`}
                  {p.submitted_to_union && ' · submitted ✓'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {e && <Link to={`/c/${clubSlug}/events/${e.id}/acquittal`} className="c3-btn-ghost text-xs">manage</Link>}
                <a href={p.pdf_url} target="_blank" rel="noreferrer" className="c3-btn-secondary text-xs"><FileText className="w-3.5 h-3.5" /> open</a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}