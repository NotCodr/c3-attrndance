import React, { useEffect, useState } from 'react';
import { Link, useParams, useOutletContext, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { getClubBySlug } from '@/lib/clubs';
import { formatEventTimeRange } from '@/lib/format';
import { Plus, Calendar, MapPin, ArrowRight, CircleDot } from 'lucide-react';

function StatusDot({ status }) {
  const map = {
    draft: 'bg-muted-foreground',
    published: 'bg-primary',
    cancelled: 'bg-destructive',
    completed: 'bg-foreground/40',
  };
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${map[status] || 'bg-muted-foreground'}`} />;
}

function EventRow({ ev, clubSlug }) {
  return (
    <Link to={`/c/${clubSlug}/events/${ev.id}`} className="block c3-card p-4 hover:bg-secondary/30 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <StatusDot status={ev.status} /> {ev.status}
            {ev.is_grant_funded && <span className="c3-badge">grant: {ev.grant_category}</span>}
          </div>
          <p className="font-medium truncate">{ev.title}</p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatEventTimeRange(ev.starts_at, ev.ends_at)}</span>
            <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {ev.location_name}</span>
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
      </div>
    </Link>
  );
}

export default function ClubHome() {
  const { clubSlug } = useParams();
  const navigate = useNavigate();
  const [club, setClub] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const c = await getClubBySlug(clubSlug);
      if (!c) return navigate('/dashboard');
      setClub(c);
      const evs = await base44.entities.Event.filter({ club_id: c.id }, '-starts_at', 200);
      setEvents(evs);
      setLoading(false);
    })();
  }, [clubSlug]);

  if (loading) return <div className="text-sm text-muted-foreground">loading…</div>;

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400 * 1000);
  const past30 = new Date(now.getTime() - 30 * 86400 * 1000);

  const upcoming = events.filter((e) => e.status === 'published' && new Date(e.starts_at) >= now && new Date(e.starts_at) <= in30);
  const past = events.filter((e) => new Date(e.starts_at) < now && new Date(e.starts_at) >= past30 && e.status !== 'draft');
  const drafts = events.filter((e) => e.status === 'draft');

  return (
    <div>
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-medium">{club.name}</h1>
          <p className="text-sm text-muted-foreground">{club.university_name}</p>
        </div>
        <Link to={`/c/${clubSlug}/events/new`} className="c3-btn-primary">
          <Plus className="w-4 h-4" /> create event
        </Link>
      </div>

      <Section title="upcoming (next 30 days)" count={upcoming.length}>
        {upcoming.length === 0 ? <Empty msg="No upcoming events." /> : upcoming.map((e) => <EventRow key={e.id} ev={e} clubSlug={clubSlug} />)}
      </Section>

      <Section title="drafts" count={drafts.length}>
        {drafts.length === 0 ? <Empty msg="No drafts." /> : drafts.map((e) => <EventRow key={e.id} ev={e} clubSlug={clubSlug} />)}
      </Section>

      <Section title="past (last 30 days)" count={past.length}>
        {past.length === 0 ? <Empty msg="No recent past events." /> : past.map((e) => <EventRow key={e.id} ev={e} clubSlug={clubSlug} />)}
      </Section>
    </div>
  );
}

function Section({ title, count, children }) {
  return (
    <section className="mb-10">
      <h2 className="text-sm text-muted-foreground mb-3 flex items-center gap-2">{title} <span className="text-xs">({count})</span></h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
function Empty({ msg }) {
  return <p className="text-sm text-muted-foreground italic px-1">{msg}</p>;
}