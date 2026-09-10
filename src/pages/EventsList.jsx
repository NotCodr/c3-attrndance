import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db } from '@/api/db';
import { getClubBySlug } from '@/lib/clubs';
import { formatEventTimeRange } from '@/lib/format';
import { Plus, Calendar, MapPin, ArrowRight } from 'lucide-react';

export default function EventsList() {
  const { clubSlug } = useParams();
  const [club, setClub] = useState(null);
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    (async () => {
      const c = await getClubBySlug(clubSlug);
      setClub(c);
      if (c) setEvents(await db.Event.filter({ club_id: c.id }, '-starts_at', 500));
    })();
  }, [clubSlug]);

  const filtered = events.filter((e) => filter === 'all' ? true : e.status === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-medium">events</h1>
        <Link to={`/c/${clubSlug}/events/new`} className="c3-btn-primary"><Plus className="w-4 h-4" /> create event</Link>
      </div>

      <div className="flex gap-2 mb-4">
        {['all', 'draft', 'published', 'completed', 'cancelled'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs rounded-md border transition ${filter === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
          >{s}</button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            {events.length === 0
              ? 'No events yet. Create one to get started.'
              : `No ${filter === 'all' ? '' : filter + ' '}events.`}
          </p>
        )}
        {filtered.map((e) => (
          <Link key={e.id} to={`/c/${clubSlug}/events/${e.id}`} className="block c3-card p-4 hover:bg-secondary/30 transition">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <span>{e.status}</span>
                  {e.is_grant_funded && <span className="c3-badge">grant</span>}
                </div>
                <p className="font-medium truncate">{e.title}</p>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatEventTimeRange(e.starts_at, e.ends_at)}</span>
                  <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {e.location_name}</span>
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}