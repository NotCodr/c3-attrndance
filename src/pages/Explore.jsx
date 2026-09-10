import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '@/api/db';
import { formatEventTimeRange } from '@/lib/format';
import Logo from '@/components/Logo';
import { Calendar, Loader2, MapPin, Search } from 'lucide-react';

/**
 * Public directory of clubs and their upcoming events.
 *
 * Until now a student could only reach an event through a link somebody sent
 * them -- the landing page had a "search" button that led to the sign-in form.
 * Reads use the same public policy as the club page: published events only, and
 * committee contact details stripped.
 */
export default function Explore() {
  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      const [cs, evs] = await Promise.all([
        db.Club.filter({}, 'name', 200),
        db.Event.filter({ status: 'published' }, 'starts_at', 200),
      ]);
      setClubs(cs);
      const now = Date.now();
      setEvents(evs.filter((e) => new Date(e.ends_at).getTime() >= now));
      setLoading(false);
    })();
  }, []);

  const clubById = useMemo(
    () => new Map(clubs.map((c) => [c.id, c])),
    [clubs],
  );

  const term = q.trim().toLowerCase();
  const matches = (...fields) => !term || fields.some((f) => (f || '').toLowerCase().includes(term));

  const visibleEvents = events.filter((e) =>
    matches(e.title, e.location_name, clubById.get(e.club_id)?.name));
  const visibleClubs = clubs.filter((c) => matches(c.name, c.description));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo size={30} />
            <span className="font-display font-bold text-lg tracking-tight">connect3</span>
          </Link>
          <Link to="/login" className="text-xs text-muted-foreground hover:text-foreground">
            committee sign in
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="font-display font-bold text-3xl sm:text-4xl mb-2">what's on</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Upcoming events from clubs using connect3.
        </p>

        <div className="relative mb-8">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="c3-input pl-9"
            placeholder="search events, clubs or venues"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search events and clubs"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <h2 className="text-sm text-muted-foreground mb-3">
              upcoming events ({visibleEvents.length})
            </h2>
            <div className="space-y-2 mb-10">
              {visibleEvents.length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  {term ? 'Nothing matches that search.' : 'No upcoming events just yet — check back soon.'}
                </p>
              )}
              {visibleEvents.map((e) => (
                <Link key={e.id} to={`/rsvp/${e.id}`} className="block c3-card p-4 hover:bg-secondary/30 transition">
                  <p className="text-xs text-primary">{clubById.get(e.club_id)?.name || 'A club'}</p>
                  <p className="font-medium mt-0.5">{e.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {formatEventTimeRange(e.starts_at, e.ends_at)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {e.location_name}
                    </span>
                  </p>
                </Link>
              ))}
            </div>

            <h2 className="text-sm text-muted-foreground mb-3">clubs ({visibleClubs.length})</h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {visibleClubs.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No clubs match that search.</p>
              )}
              {visibleClubs.map((c) => (
                <Link key={c.id} to={`/p/${c.slug}`} className="c3-card p-4 hover:bg-secondary/30 transition flex items-center gap-3">
                  {c.logo_url
                    ? <img src={c.logo_url} alt="" className="w-9 h-9 rounded-lg object-cover border border-border shrink-0" />
                    : <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center font-display font-bold text-primary shrink-0">
                        {c.name?.[0]?.toUpperCase() || 'C'}
                      </div>}
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.university_name}</p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        <p className="text-center text-xs text-muted-foreground mt-12">
          Run a club? <Link to="/signup" className="text-primary hover:underline">set it up on connect3</Link>
        </p>
      </div>
    </div>
  );
}
