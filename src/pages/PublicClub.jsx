import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db } from '@/api/db';
import { getClubBySlug } from '@/lib/clubs';
import { formatEventTimeRange } from '@/lib/format';
import { Calendar, MapPin, Loader2 } from 'lucide-react';

export default function PublicClub() {
  const { clubSlug } = useParams();
  const [club, setClub] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const c = await getClubBySlug(clubSlug);
      if (c) {
        setClub(c);
        const evs = await db.Event.filter({ club_id: c.id, status: 'published' }, 'starts_at', 50);
        const now = new Date();
        setEvents(evs.filter((e) => new Date(e.ends_at) >= now));
      }
      setLoading(false);
    })();
  }, [clubSlug]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (!club) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Club not found.</div>;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <header className="flex items-center gap-4 mb-8">
          {club.logo_url && <img src={club.logo_url} className="w-14 h-14 rounded-lg object-cover border border-border" alt="" />}
          <div>
            <h1 className="text-2xl font-medium">{club.name}</h1>
            <p className="text-sm text-muted-foreground">{club.university_name}</p>
          </div>
        </header>
        {club.description && <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{club.description}</p>}

        <h2 className="text-sm text-muted-foreground mb-3">upcoming events</h2>
        <div className="space-y-2">
          {events.length === 0 && <p className="text-sm text-muted-foreground italic">No upcoming events.</p>}
          {events.map((e) => (
            <Link key={e.id} to={`/rsvp/${e.id}`} className="block c3-card p-4 hover:bg-secondary/30 transition">
              <p className="font-medium">{e.title}</p>
              <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatEventTimeRange(e.starts_at, e.ends_at)}</span>
                <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {e.location_name}</span>
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}