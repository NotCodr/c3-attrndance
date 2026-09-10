import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { db } from '@/api/db';
import { canManageAcquittal, getClubBySlug, getMyRoleInClub } from '@/lib/clubs';
import { formatEventTimeRange, formatMoneyCents } from '@/lib/format';
import { Plus, Calendar, MapPin, ArrowRight, FileText, ExternalLink } from 'lucide-react';

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
  const { user } = useOutletContext() || {};
  const navigate = useNavigate();
  const [club, setClub] = useState(null);
  const [events, setEvents] = useState([]);
  const [packedEventIds, setPackedEventIds] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const c = await getClubBySlug(clubSlug);
      if (!c) return navigate('/dashboard');
      setClub(c);
      const evs = await db.Event.filter({ club_id: c.id }, '-starts_at', 200);
      setEvents(evs);

      // Acquittal packs are treasurer-and-above, so only ask for them when the
      // viewer could act on the answer. A scanner just does not see the section.
      const role = user?.email ? await getMyRoleInClub(c.id, user.email) : null;
      if (canManageAcquittal(role)) {
        const packs = await db.AcquittalPack.filter({ club_id: c.id }, undefined, 500);
        setPackedEventIds(new Set(packs.map((p) => p.event_id)));
      }
      setLoading(false);
    })();
  }, [clubSlug, user?.email]);

  if (loading) return <div className="text-sm text-muted-foreground">loading…</div>;

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400 * 1000);
  const past30 = new Date(now.getTime() - 30 * 86400 * 1000);

  const upcoming = events.filter((e) => e.status === 'published' && new Date(e.starts_at) >= now && new Date(e.starts_at) <= in30);
  const past = events.filter((e) => new Date(e.starts_at) < now && new Date(e.starts_at) >= past30 && e.status !== 'draft');
  const drafts = events.filter((e) => e.status === 'draft');

  // Grant money is released against an acquittal pack. Nothing in the app used
  // to say one was outstanding, which left the whole point of connect3 resting
  // on the treasurer remembering.
  const needsAcquittal = packedEventIds === null ? [] : events.filter((e) =>
    e.is_grant_funded
    && e.status !== 'draft'
    && e.status !== 'cancelled'
    && new Date(e.ends_at) < now
    && !packedEventIds.has(e.id));

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

      {needsAcquittal.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm mb-3 flex items-center gap-2 text-amber-500">
            <FileText className="w-4 h-4" /> needs an acquittal pack
            <span className="text-xs">({needsAcquittal.length})</span>
          </h2>
          <div className="space-y-2">
            {needsAcquittal.map((e) => (
              <Link
                key={e.id}
                to={`/c/${clubSlug}/events/${e.id}/acquittal`}
                className="block c3-card p-4 border-amber-400/40 bg-amber-400/5 hover:bg-amber-400/10 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{e.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatEventTimeRange(e.starts_at, e.ends_at)}
                      {e.grant_amount_cents ? ` · ${formatMoneyCents(e.grant_amount_cents)} ${e.grant_category || ''}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-amber-500 shrink-0 whitespace-nowrap">build pack →</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {events.length === 0 ? (
        <FirstRun clubSlug={clubSlug} clubName={club.name} slug={club.slug} />
      ) : (
        <>
          <Section title="upcoming (next 30 days)" count={upcoming.length}>
            {upcoming.length === 0
              ? <Empty msg="Nothing coming up in the next 30 days." />
              : upcoming.map((e) => <EventRow key={e.id} ev={e} clubSlug={clubSlug} />)}
          </Section>

          <Section title="drafts" count={drafts.length}>
            {drafts.length === 0
              ? <Empty msg="No drafts waiting to be published." />
              : drafts.map((e) => <EventRow key={e.id} ev={e} clubSlug={clubSlug} />)}
          </Section>

          <Section title="past (last 30 days)" count={past.length}>
            {past.length === 0
              ? <Empty msg="Nothing in the last 30 days." />
              : past.map((e) => <EventRow key={e.id} ev={e} clubSlug={clubSlug} />)}
          </Section>
        </>
      )}
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
/** What a club sees before it has created anything at all. */
function FirstRun({ clubSlug, clubName, slug }) {
  return (
    <div className="c3-card p-8 text-center">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/15 flex items-center justify-center mb-4">
        <Calendar className="w-6 h-6 text-primary" />
      </div>
      <h2 className="font-display font-bold text-xl mb-2">{clubName} is set up</h2>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
        Create your first event, share the RSVP link, then scan people in at the door.
        If it is grant funded, connect3 builds the acquittal pack for you afterwards.
      </p>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <Link to={`/c/${clubSlug}/events/new`} className="c3-btn-primary">
          <Plus className="w-4 h-4" /> create your first event
        </Link>
        <a href={`/p/${slug}`} target="_blank" rel="noreferrer" className="c3-btn-secondary">
          <ExternalLink className="w-3.5 h-3.5" /> view public page
        </a>
      </div>
      <p className="text-xs text-muted-foreground mt-6">
        Next: add your committee under <Link to={`/c/${clubSlug}/committee`} className="underline">committee</Link>.
      </p>
    </div>
  );
}

function Empty({ msg }) {
  return <p className="text-sm text-muted-foreground italic px-1">{msg}</p>;
}