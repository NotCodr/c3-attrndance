import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Copy, ExternalLink, Plus, ScanLine } from 'lucide-react';
import { canEditEvents, getClubBySlug, getMyRoleInClub } from '@/lib/clubs';
import { buildDashboard, daysUntil, greeting, loadDashboard, whenLabel } from '@/lib/dashboard';
import { formatDate, formatMoneyCents, formatTime, MEL_TZ } from '@/lib/format';
import { ordinal } from '@/lib/ticket';
import { copyText } from '@/lib/clipboard';
import InitialsAvatar from '@/components/InitialsAvatar';

const EASE = [0.16, 1, 0.3, 1];
const INK = 'border-[hsl(var(--c3-ink))]';

const dollars = (cents) => formatMoneyCents(cents).replace(/\.00$/, '');
const joinWords = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

/**
 * The club overview. It answers, in order: what's next and what does it need,
 * how the club is doing, what's waiting on you, and how the last event went.
 */
export default function ClubHome() {
  const { clubSlug } = useParams();
  const { user, activeClub } = useOutletContext() || {};
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [club, setClub] = useState(null);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    setData(null);
    setFailed(false);
    (async () => {
      const c = await getClubBySlug(clubSlug);
      if (!c) { navigate('/dashboard', { replace: true }); return; }
      const role = activeClub?.slug === clubSlug && activeClub?.role
        ? activeClub.role
        : await getMyRoleInClub(c.id, user?.email);
      const loaded = await loadDashboard(c, role);
      if (!live) return;
      setClub({ ...c, role });
      setData(loaded);
      setNow(Date.now());
    })().catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [clubSlug, user?.email]);

  // Keep "starts in" and the greeting honest while the tab sits open.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const model = useMemo(() => (data ? buildDashboard(data, { now }) : null), [data, now]);

  // During an event, keep the door numbers moving.
  const liveNow = !!(model?.next?.live || model?.door?.live);
  useEffect(() => {
    if (!liveNow || !club) return undefined;
    const t = setInterval(() => { loadDashboard(club, club.role).then(setData).catch(() => {}); }, 30_000);
    return () => clearInterval(t);
  }, [liveNow, club]);

  if (failed) {
    return <p className="text-sm text-destructive">Could not load this club's overview. Refresh to try again.</p>;
  }
  if (!model || !club) return <DashboardSkeleton />;

  const canEdit = canEditEvents(club.role);
  const rise = (i) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, delay: reduce ? 0 : i * 0.06, ease: EASE },
  });
  const hasTodo = model.pendingPacks.length > 0 || (canEdit && model.drafts.length > 0);

  return (
    <div className="max-w-[1060px] space-y-6">
      <motion.header {...rise(0)}>
        <h1 className="font-display text-[1.9rem] font-bold leading-tight tracking-tight sm:text-[2.15rem]">{greeting(user, now)}</h1>
        <p className="mt-1 text-sm text-[#4A4270]"><Summary model={model} now={now} /></p>
      </motion.header>

      {!model.hasEvents ? (
        <motion.div {...rise(1)}><FirstRun club={club} canEdit={canEdit} /></motion.div>
      ) : (
        <>
          <motion.div {...rise(1)}>
            <NextUp model={model} clubSlug={clubSlug} canEdit={canEdit} now={now} />
          </motion.div>
          <motion.div {...rise(2)}><Stats stats={model.stats} /></motion.div>
          <motion.div {...rise(3)} className="grid items-start gap-5 lg:grid-cols-[1.05fr_1fr]">
            <div className="space-y-5">
              {model.pendingPacks.length > 0 && <GrantPacks packs={model.pendingPacks} clubSlug={clubSlug} />}
              {canEdit && model.drafts.length > 0 && <Drafts drafts={model.drafts} clubSlug={clubSlug} now={now} />}
              {!hasTodo && <AllCaughtUp />}
            </div>
            {model.door ? <Door door={model.door} clubSlug={clubSlug} /> : <HowTheDoorWorks />}
          </motion.div>
        </>
      )}
    </div>
  );
}

function Summary({ model, now }) {
  const b = (text) => <strong className="font-semibold text-[hsl(var(--c3-ink))]">{text}</strong>;
  const people = (count) => `${count} ${count === 1 ? 'person' : 'people'}`;
  const n = model.next;
  const packs = model.pendingPacks.length;

  if (n?.live) return <>{b(n.event.title)} is on right now, with {b(`${n.checkedIn} checked in`)} so far.</>;
  if (n && daysUntil(n.event.starts_at, now) <= 1) {
    const day = daysUntil(n.event.starts_at, now) === 0 ? 'today' : 'tomorrow';
    return <>{b(n.event.title)} is {day} and {b(people(n.going))} {n.going === 1 ? 'is' : 'are'} coming.</>;
  }
  if (packs) return <>{b(`${packs} grant pack${packs === 1 ? '' : 's'}`)} {packs === 1 ? 'is' : 'are'} waiting to be finished.</>;
  if (n) {
    return <>Next up is {b(n.event.title)} on {formatDate(n.event.starts_at, { year: undefined })}, with {b(people(n.going))} going so far.</>;
  }
  if (model.drafts.length) {
    return <>Nothing published yet, but {b(`${model.drafts.length} draft${model.drafts.length === 1 ? ' is' : 's are'}`)} ready to go.</>;
  }
  return model.hasEvents ? <>Nothing on the calendar right now.</> : <>Welcome in. Here's how the club gets going.</>;
}

// -------------------------------------------------------------- next event --

function StatusChip({ children, dot }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--c3-ink))] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-white">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

function NextUp({ model, clubSlug, canEdit, now }) {
  const n = model.next;
  if (!n) return <NothingScheduled clubSlug={clubSlug} canEdit={canEdit} hasDrafts={model.drafts.length > 0} />;

  const { event, going, waitlisted, checkedIn, live } = n;
  const when = whenLabel(event, now);
  const doorTime = live || new Date(event.starts_at).getTime() - now < 12 * 36e5;
  const rsvpUrl = `${window.location.origin}/rsvp/${event.id}`;
  const cap = event.capacity;

  let meter;
  if (live) {
    meter = {
      label: 'checked in',
      value: checkedIn,
      total: going || null,
      note: going ? `${Math.min(100, Math.round((checkedIn / going) * 100))}% of RSVPs are in` : 'no RSVPs, walk-ins only',
    };
  } else if (cap) {
    const left = cap - going;
    meter = {
      label: 'going',
      value: going,
      total: cap,
      note: left <= 0
        ? `full${waitlisted ? ` · ${waitlisted} on the waitlist` : ''}`
        : `${Math.round((going / cap) * 100)}% full · ${left} ${left === 1 ? 'place' : 'places'} left`,
    };
  } else {
    meter = { label: 'going', value: going, total: null, note: 'no limit on places' };
  }

  const time = event.ends_at ? `${formatTime(event.starts_at)} to ${formatTime(event.ends_at)}` : formatTime(event.starts_at);
  const meta = [formatDate(event.starts_at, { year: undefined }), time, event.location_name].filter(Boolean).join(' · ');

  return (
    <section className={`ink-card overflow-hidden bg-[#DFD6FF] shadow-[0_6px_0_0_hsl(var(--c3-ink))]`}>
      <div className="flex">
        <div className="min-w-0 flex-1 p-5 sm:p-7">
          <StatusChip dot={live ? 'animate-pulse bg-[#7CE0B0]' : when.soon ? 'bg-[#7CE0B0]' : 'bg-[#C9BCFF]'}>{when.text}</StatusChip>
          <h2 className="mt-3.5 max-w-[34rem] text-balance font-display text-[1.9rem] font-bold leading-[1.05] tracking-tight sm:text-[2.4rem]">
            <Link to={`/c/${clubSlug}/events/${event.id}`} className="decoration-[3px] underline-offset-4 hover:underline">{event.title}</Link>
          </h2>
          <p className="mt-2 text-sm font-medium text-[#3A3260]">{meta}</p>

          <Meter {...meter} />

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            {doorTime ? (
              <>
                <Link to={`/c/${clubSlug}/events/${event.id}/scan`} className="ink-btn ink-btn-dark px-5 py-2.5">
                  <ScanLine className="h-4 w-4" /> open the scanner
                </Link>
                <button type="button" onClick={() => copyText(rsvpUrl, 'RSVP link copied')} className="ink-btn ink-btn-light px-5 py-2.5">
                  <Copy className="h-4 w-4" /> copy RSVP link
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => copyText(rsvpUrl, 'RSVP link copied')} className="ink-btn ink-btn-dark px-5 py-2.5">
                  <Copy className="h-4 w-4" /> copy RSVP link
                </button>
                <Link to={`/c/${clubSlug}/events/${event.id}`} className="ink-btn ink-btn-light px-5 py-2.5">manage event</Link>
              </>
            )}
            <a href={`/rsvp/${event.id}`} target="_blank" rel="noreferrer" className="ink-link">
              <ExternalLink className="h-4 w-4" /> view public page
            </a>
          </div>
        </div>

        <div className={`relative hidden w-[270px] shrink-0 border-l-2 ${INK} bg-[#C9BCFF] lg:block`}>
          {event.cover_image_url
            ? <img src={event.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            : <StickerScene />}
        </div>
      </div>

      {model.later.length > 0 && (
        <div className={`flex flex-wrap items-center gap-2 border-t-2 ${INK} bg-white/70 px-5 py-3 sm:px-7`}>
          <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#4A4270]">after that</span>
          {model.later.map(({ event: e, going: g }) => (
            <Link
              key={e.id}
              to={`/c/${clubSlug}/events/${e.id}`}
              className={`inline-flex max-w-full items-center gap-2 rounded-full border-2 ${INK} bg-white py-1 pl-1 pr-3 text-sm font-semibold transition hover:bg-[#EDE7FF]`}
            >
              <DateBadge iso={e.starts_at} compact />
              <span className="max-w-[11rem] truncate">{e.title}</span>
              <span className="shrink-0 text-xs font-medium text-[#4A4270]">{g} going</span>
            </Link>
          ))}
          <Link to={`/c/${clubSlug}/events`} className="ink-link ml-auto text-xs">
            all events <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </section>
  );
}

function Meter({ label, value, total, note }) {
  const pct = total ? Math.min(100, Math.round((value / total) * 100)) : null;
  return (
    <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#4A4270]">{label}</p>
        <p className="font-display text-[2.6rem] font-bold leading-none tabular-nums">
          {value}
          {total ? <span className="text-xl text-[#4A4270]">/{total}</span> : null}
        </p>
      </div>
      <div className="min-w-[11rem] flex-1 pb-1">
        {pct != null && (
          <div className={`flex h-4 overflow-hidden rounded-full border-2 ${INK} bg-white`}>
            <span
              className={`h-full bg-[#8E6FE8] ${pct > 0 && pct < 100 ? `border-r-2 ${INK}` : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        <p className="mt-1.5 text-xs text-[#4A4270]">{note}</p>
      </div>
    </div>
  );
}

/** The brand stickers drifting in the hero when the event has no cover photo. */
function StickerScene() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 grid place-items-center">
        <img src="/brand/logo-sticker.webp" alt="" className="float-slow w-44" style={{ '--rot': '-6deg' }} />
      </div>
      <img src="/brand/sticker-sparkle.webp" alt="" className="float-slower absolute left-5 top-6 w-14" style={{ '--rot': '-12deg' }} />
      <img src="/brand/sticker-star.webp" alt="" className="float-slow float-delay absolute bottom-7 right-6 w-12" style={{ '--rot': '14deg' }} />
      <img src="/brand/sticker-cloud.webp" alt="" className="float-slower float-delay absolute bottom-10 left-7 w-10" style={{ '--rot': '8deg' }} />
    </div>
  );
}

function DateBadge({ iso, compact = false }) {
  const f = (o) => new Date(iso).toLocaleDateString('en-AU', { timeZone: MEL_TZ, ...o });
  return (
    <span className={`inline-flex shrink-0 flex-col overflow-hidden rounded-lg border-2 ${INK} bg-white text-center leading-none ${compact ? 'w-8' : 'w-11'}`}>
      <span className={`bg-[#8E6FE8] font-bold uppercase tracking-wider text-white ${compact ? 'py-0.5 text-[7px]' : 'py-1 text-[9px]'}`}>
        {f({ month: 'short' }).replace('.', '')}
      </span>
      <span className={`font-display font-bold ${compact ? 'py-0.5 text-xs' : 'py-1 text-base'}`}>{f({ day: 'numeric' })}</span>
    </span>
  );
}

function NothingScheduled({ clubSlug, canEdit, hasDrafts }) {
  return (
    <section className="ink-card overflow-hidden bg-[#DFD6FF] shadow-[0_6px_0_0_hsl(var(--c3-ink))]">
      <div className="flex">
        <div className="min-w-0 flex-1 p-5 sm:p-7">
          <StatusChip dot="bg-[#C9BCFF]">nothing scheduled</StatusChip>
          <h2 className="mt-3.5 font-display text-[1.9rem] font-bold leading-[1.05] tracking-tight sm:text-[2.4rem]">Nothing on the calendar</h2>
          <p className="mt-2 max-w-md text-sm text-[#3A3260]">
            {hasDrafts
              ? 'You have drafts ready below. Publish one and people can RSVP straight away.'
              : 'Put the next event on. People can RSVP the moment you publish it.'}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            {canEdit && (
              <Link to={`/c/${clubSlug}/events/new`} className="ink-btn ink-btn-dark px-5 py-2.5">
                <Plus className="h-4 w-4" /> new event
              </Link>
            )}
            <Link to={`/c/${clubSlug}/events`} className="ink-btn ink-btn-light px-5 py-2.5">all events</Link>
          </div>
        </div>
        <div className={`relative hidden w-[270px] shrink-0 place-items-center border-l-2 ${INK} bg-[#C9BCFF] p-4 lg:grid`}>
          <img src="/brand/characters-cheers.webp" alt="" className="w-56" />
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------- stats --

function Stats({ stats }) {
  const { rsvpsThisMonth: count, rsvpsLastMonthSoFar: before, lastMonthName, turnout, firstTimers, peopleThisMonth, grant } = stats;

  let trend = { text: 'none yet this month', up: false };
  if (count && !before) trend = { text: `up from none in ${lastMonthName}`, up: true };
  else if (before) {
    const d = Math.round(((count - before) / before) * 100);
    trend = {
      text: d === 0 ? `level with ${lastMonthName} so far` : `${d > 0 ? '+' : ''}${d}% on ${lastMonthName} so far`,
      up: d > 0,
    };
  }

  const cards = [
    { label: 'RSVPs this month', value: count, note: trend.text, up: trend.up, sticker: '/brand/sticker-blue.png' },
    {
      label: 'turned up',
      value: turnout == null ? null : `${turnout}%`,
      note: turnout == null ? 'shows after your next event' : 'of RSVPs, last 90 days',
      sticker: '/brand/sticker-green.png',
    },
    {
      label: 'first-timers',
      value: firstTimers,
      note: peopleThisMonth ? `of ${peopleThisMonth} ${peopleThisMonth === 1 ? 'person' : 'people'} this month` : 'no check-ins this month yet',
      sticker: '/brand/sticker-yellow.png',
    },
    grant
      ? {
        label: 'grant spent',
        value: dollars(grant.spentCents),
        note: grant.approvedCents ? `of ${dollars(grant.approvedCents)} approved this year` : 'no grants approved this year',
        sticker: '/brand/sticker-orange.png',
      }
      : {
        label: 'events this month',
        value: stats.eventsThisMonth,
        note: stats.stillToCome ? `${stats.stillToCome} still to come` : 'none left this month',
        sticker: '/brand/sticker-orange.png',
      },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="ink-card relative overflow-hidden p-4">
          <img src={c.sticker} alt="" className="pointer-events-none absolute right-3 top-3 h-7 w-7" />
          <p className="pr-8 text-[11px] font-bold uppercase tracking-[0.08em] text-[#4A4270]">{c.label}</p>
          <p className="mt-1.5 font-display text-[2rem] font-bold leading-none tabular-nums">
            {c.value ?? <span className="text-lg text-[#8A82AD]">not yet</span>}
          </p>
          <p className={`mt-1 text-xs font-semibold ${c.up ? 'text-[#1F9E66]' : 'text-[#4A4270]'}`}>{c.note}</p>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------- to do --

function GrantPacks({ packs, clubSlug }) {
  const [first, ...rest] = packs;
  const e = first.event;
  const missing = first.steps.filter((s) => !s.done && s.key !== 'pdf').map((s) => s.label);
  const ago = first.daysAgo === 0 ? 'ended today' : first.daysAgo === 1 ? 'ended yesterday' : `ended ${first.daysAgo} days ago`;
  const grant = e.grant_amount_cents ? `${dollars(e.grant_amount_cents)} ${e.grant_category || ''} grant`.replace(/\s+/g, ' ') : 'grant funded';

  return (
    <section className="ink-card bg-[#FFE6D6] p-5 shadow-[0_5px_0_0_hsl(var(--c3-ink))]">
      <div className="flex items-center gap-3">
        <img src="/brand/sticker-orange.png" alt="" className="h-11 w-11 shrink-0" />
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold leading-tight">
            {packs.length === 1 ? 'A grant pack is holding up money' : `${packs.length} grant packs are holding up money`}
          </h2>
          <p className="text-xs font-semibold text-[#4A4270]">UMSU pays the grant once it has the pack</p>
        </div>
      </div>

      <div className="mt-4 border-t-2 border-dashed border-[#15102B]/15 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-bold">{e.title}</p>
            <p className="mt-0.5 text-xs text-[#4A4270]">{ago} · {grant}</p>
          </div>
          <p className="shrink-0 font-display text-2xl font-bold leading-none">
            {first.done}<span className="text-sm text-[#4A4270]">/{first.steps.length}</span>
          </p>
        </div>
        <div className="mt-3 flex gap-1.5" role="img" aria-label={`${first.done} of ${first.steps.length} steps done`}>
          {first.steps.map((s) => (
            <span key={s.key} title={s.label} className={`h-2.5 flex-1 rounded-full border-[1.5px] ${INK} ${s.done ? 'bg-[#8E6FE8]' : 'bg-white'}`} />
          ))}
        </div>
        <p className="mt-3 text-sm text-[#3A3260]">
          {missing.length
            ? <>Still needs <strong>{joinWords(missing)}</strong>, then you can generate the PDF.</>
            : <>Everything's in. <strong>Generate the PDF</strong> and send it to UMSU.</>}
        </p>
        <Link to={`/c/${clubSlug}/events/${e.id}/grant`} className="ink-btn ink-btn-primary mt-4 px-5 py-2.5">
          finish the pack <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {rest.length > 0 && (
        <ul className="mt-4 space-y-0.5 border-t-2 border-dashed border-[#15102B]/15 pt-3">
          {rest.slice(0, 3).map((p) => (
            <li key={p.event.id}>
              <Link to={`/c/${clubSlug}/events/${p.event.id}/grant`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-sm font-semibold transition hover:bg-white/60">
                <span className="truncate">{p.event.title}</span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[#4A4270]">
                  {p.done}/{p.steps.length} <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Drafts({ drafts, clubSlug, now }) {
  return (
    <section className="ink-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Drafts waiting to go out</h2>
        <span className={`rounded-full border-2 ${INK} bg-[#FFE0EC] px-2 text-xs font-bold leading-5`}>{drafts.length}</span>
      </div>
      <ul className="mt-2 divide-y-2 divide-dashed divide-[#E4DEF7]">
        {drafts.slice(0, 3).map((d) => {
          const past = new Date(d.starts_at).getTime() < now;
          return (
            <li key={d.id}>
              <Link to={`/c/${clubSlug}/events/${d.id}`} className="group flex items-center gap-3 py-2.5">
                <DateBadge iso={d.starts_at} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{d.title}</span>
                  <span className={`block truncate text-xs ${past ? 'font-semibold text-[#C2410C]' : 'text-[#4A4270]'}`}>
                    {past ? 'the date has passed, update it first' : `${formatTime(d.starts_at)} · ${d.location_name}`}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold text-[#6D4FD8] group-hover:underline">review</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {drafts.length > 3 && (
        <Link to={`/c/${clubSlug}/events`} className="ink-link text-xs">
          {drafts.length - 3} more <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </section>
  );
}

function AllCaughtUp() {
  return (
    <section className="ink-card flex items-center gap-4 overflow-hidden p-5">
      <img src="/brand/characters-cheers.webp" alt="" className="-my-3 w-28 shrink-0 sm:w-32" />
      <div>
        <h2 className="font-display text-lg font-bold">All caught up</h2>
        <p className="mt-1 text-sm text-[#4A4270]">No grant packs or drafts waiting on you.</p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- the door --

function Door({ door, clubSlug }) {
  const { event, live, checkedIn, fromRsvps, expected, walkIns, recent } = door;
  const pct = expected ? Math.min(100, Math.round((fromRsvps / expected) * 100)) : null;

  return (
    <section className="ink-card p-5 shadow-[0_5px_0_0_hsl(var(--c3-ink))]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold">{live ? 'At the door right now' : 'Last time at the door'}</h2>
          <Link to={`/c/${clubSlug}/events/${event.id}`} className="block truncate text-xs font-semibold text-[#6D4FD8] hover:underline">
            {event.title} · {formatDate(event.starts_at, { year: undefined })}
          </Link>
        </div>
        {live && (
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 ${INK} bg-[#D9F7E7] px-2.5 py-0.5 text-[11px] font-bold`}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#12B872]" /> live
          </span>
        )}
      </div>

      {recent.length ? (
        <ul className="mt-4 space-y-3">
          {recent.map((p) => (
            <li key={p.id} className="flex items-center gap-3">
              <InitialsAvatar name={p.name} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-[#4A4270]">in at {formatTime(p.at)} · {p.visit === 1 ? 'first event' : `${ordinal(p.visit)} event`}</p>
              </div>
              {p.visit === 1 && (
                <span className={`shrink-0 rounded-full border-2 ${INK} bg-[#FFF4D9] px-2 text-[11px] font-bold leading-5`}>new</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[#4A4270]">{live ? 'No one scanned in yet.' : 'No one was scanned in.'}</p>
      )}

      <div className="mt-4 border-t-2 border-dashed border-[#DDD8F0] pt-3.5">
        <p className="text-sm text-[#3A3260]">
          {expected
            ? <><strong className="text-[hsl(var(--c3-ink))]">{fromRsvps} of {expected}</strong> RSVPs {live ? 'are in' : 'turned up'}</>
            : <><strong className="text-[hsl(var(--c3-ink))]">{checkedIn}</strong> checked in</>}
          {walkIns ? <span className="text-[#4A4270]"> · {walkIns} walk-in{walkIns === 1 ? '' : 's'}</span> : null}
        </p>
        {pct != null && (
          <div className={`mt-2 flex h-3 overflow-hidden rounded-full border-2 ${INK} bg-white`}>
            <span className="h-full bg-[#7CE0B0]" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </section>
  );
}

function HowTheDoorWorks() {
  const steps = [
    'Share the RSVP link. Everyone who signs up gets a ticket with a QR code.',
    'On the night, open the scanner on a phone from the event page.',
    'Scan tickets as people arrive. Who came shows up right here.',
  ];
  return (
    <section className="ink-card bg-[#FFF4D9] p-5">
      <div className="flex items-center gap-3">
        <img src="/brand/sticker-yellow.png" alt="" className="h-10 w-10" />
        <h2 className="font-display text-lg font-bold">How the door works</h2>
      </div>
      <ol className="mt-3 space-y-2.5">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-3 text-sm text-[#3A3260]">
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${INK} bg-white text-xs font-bold`}>{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </section>
  );
}

// --------------------------------------------------------------- first run --

function FirstRun({ club, canEdit }) {
  const steps = [
    ['Create an event', 'Title, time and place. It takes a minute.'],
    ['Share the RSVP link', 'People sign up and get a ticket with a QR code.'],
    ['Scan them in at the door', 'Attendance records itself as you scan.'],
  ];
  return (
    <section className="ink-card overflow-hidden bg-[#DFD6FF] shadow-[0_6px_0_0_hsl(var(--c3-ink))]">
      <div className="flex">
        <div className="min-w-0 flex-1 p-5 sm:p-8">
          <StatusChip dot="bg-[#7CE0B0]">getting started</StatusChip>
          <h2 className="mt-3.5 text-balance font-display text-[1.9rem] font-bold leading-[1.05] tracking-tight sm:text-[2.4rem]">
            Let's get {club.name} going
          </h2>
          <p className="mt-2 max-w-md text-sm text-[#3A3260]">
            Three steps from your first event to a full room. If an event is grant funded, the grant pack builds itself from what you've already done.
          </p>
          <ol className="mt-6 space-y-3.5">
            {steps.map(([title, detail], i) => (
              <li key={title} className="flex gap-3.5">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 ${INK} bg-white font-display font-bold`}>{i + 1}</span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-[#4A4270]">{detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            {canEdit && (
              <Link to={`/c/${club.slug}/events/new`} className="ink-btn ink-btn-dark px-5 py-2.5">
                <Plus className="h-4 w-4" /> create your first event
              </Link>
            )}
            <Link to={`/c/${club.slug}/committee`} className="ink-btn ink-btn-light px-5 py-2.5">invite your committee</Link>
            <a href={`/p/${club.slug}`} target="_blank" rel="noreferrer" className="ink-link">
              <ExternalLink className="h-4 w-4" /> club page
            </a>
          </div>
        </div>
        <div className={`relative hidden w-[300px] shrink-0 place-items-center border-l-2 ${INK} bg-[#C9BCFF] lg:grid`}>
          <img src="/brand/characters-cheers.webp" alt="" className="w-60" />
        </div>
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  const block = 'rounded-[22px] border-2 border-[#DDD8F0] bg-white/60';
  return (
    <div className="max-w-[1060px] animate-pulse space-y-6" aria-busy="true" aria-label="Loading overview">
      <div>
        <div className="h-9 w-64 rounded-xl bg-[#E4DEF7]" />
        <div className="mt-2 h-4 w-80 max-w-full rounded bg-[#E4DEF7]" />
      </div>
      <div className={`h-72 ${block}`} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className={`h-28 ${block}`} />)}
      </div>
    </div>
  );
}
