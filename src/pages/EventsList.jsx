import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Copy, Plus, ScanLine, Search, X } from 'lucide-react';
import { canEditEvents, canManageAcquittal, getClubBySlug, getMyRoleInClub } from '@/lib/clubs';
import { buildEventsBoard, daysUntil, loadDashboard, whenLabel } from '@/lib/dashboard';
import { formatDate, formatMoneyCents, formatTime, MEL_TZ } from '@/lib/format';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/utils';

const EASE = [0.16, 1, 0.3, 1];
const INK = 'border-[hsl(var(--c3-ink))]';
const PAST_PAGE = 12;

const dollars = (cents) => formatMoneyCents(cents).replace(/\.00$/, '');
const joinWords = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

const melYear = (value) => new Date(value).toLocaleDateString('en-AU', { timeZone: MEL_TZ, year: 'numeric' });
/** "Thu, 10 Sept", with the year only when it isn't this one. */
const shortDate = (iso) => formatDate(iso, { year: melYear(iso) === melYear(Date.now()) ? undefined : 'numeric' });

// Each event keeps the same character and tint wherever it appears.
const CHARACTERS = [
  ['purple', '#DFD6FF'], ['blue', '#CFF4FF'], ['pink', '#FFE0EC'],
  ['yellow', '#FFF4D9'], ['green', '#D9F7E7'], ['orange', '#FFD3B8'],
];
function characterFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  const [name, tint] = CHARACTERS[h % CHARACTERS.length];
  return { src: `/brand/sticker-${name}.png`, tint };
}

const FILTERS = [
  { key: 'all', label: 'all' },
  { key: 'upcoming', label: 'coming up' },
  { key: 'owed', label: 'pack owed', treasurer: true },
  { key: 'drafts', label: 'drafts' },
  { key: 'past', label: 'past' },
];

const SECTION_TITLES = {
  upcoming: 'coming up · taking RSVPs',
  owed: 'ran already · grant pack owed',
  drafts: 'drafts · not visible to anyone yet',
  past: 'past events',
};

const EMPTY_COPY = {
  upcoming: 'Nothing coming up. Publish a draft or create a new event.',
  owed: 'No grant packs owed.',
  drafts: 'No drafts waiting.',
  past: 'Nothing has happened yet. Your past events will collect here.',
};

export default function EventsList() {
  const { clubSlug } = useParams();
  const { user, activeClub } = useOutletContext() || {};
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [params, setParams] = useSearchParams();
  const [club, setClub] = useState(null);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [pastShown, setPastShown] = useState(PAST_PAGE);
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

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const board = useMemo(() => (data ? buildEventsBoard(data, { now }) : null), [data, now]);

  // Keep the door numbers moving while something is on.
  const liveNow = !!board?.upcoming.some((r) => r.live);
  useEffect(() => {
    if (!liveNow || !club) return undefined;
    const t = setInterval(() => { loadDashboard(club, club.role).then(setData).catch(() => {}); }, 30_000);
    return () => clearInterval(t);
  }, [liveNow, club]);

  if (failed) return <p className="text-sm text-destructive">Could not load events. Refresh to try again.</p>;
  if (!board || !club) return <EventsSkeleton />;

  const treasurer = canManageAcquittal(club.role);
  const canEdit = canEditEvents(club.role);
  const filters = FILTERS.filter((f) => !f.treasurer || treasurer);
  const show = filters.some((f) => f.key === params.get('show')) ? params.get('show') : 'all';
  const setShow = (key) => {
    setPastShown(PAST_PAGE);
    setParams(key === 'all' ? {} : { show: key }, { replace: true });
  };

  const q = query.trim().toLowerCase();
  const matches = (row) => !q
    || row.event.title.toLowerCase().includes(q)
    || (row.event.location_name || '').toLowerCase().includes(q);
  const groups = {
    upcoming: board.upcoming.filter(matches),
    owed: board.owed.filter(matches),
    drafts: board.drafts.filter(matches),
    past: board.past.filter(matches),
  };
  const counts = {
    all: board.total,
    upcoming: board.upcoming.length,
    owed: board.owed.length,
    drafts: board.drafts.length,
    past: board.past.length,
  };
  const visible = show === 'all' ? ['upcoming', 'owed', 'drafts', 'past'] : [show];
  const nothingToShow = visible.every((k) => groups[k].length === 0);

  const summary = [`${board.total} event${board.total === 1 ? '' : 's'}`];
  if (counts.upcoming) summary.push(`${counts.upcoming} coming up`);
  if (treasurer && counts.owed) summary.push(`${counts.owed} grant pack${counts.owed === 1 ? '' : 's'} to finish`);
  if (counts.drafts) summary.push(`${counts.drafts} draft${counts.drafts === 1 ? '' : 's'}`);

  let index = 0;
  const rise = () => {
    const i = Math.min(index++, 8);
    return {
      initial: reduce ? { opacity: 0 } : { opacity: 0, y: 10 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.4, delay: reduce ? 0 : i * 0.04, ease: EASE },
    };
  };

  return (
    <div className="max-w-[1060px] space-y-6">
      <header>
        <h1 className="font-display text-[1.9rem] font-bold leading-tight tracking-tight sm:text-[2.15rem]">Events</h1>
        <p className="mt-1 text-sm text-[#4A4270]">{summary.join(' · ')}</p>
      </header>

      {board.total > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((f) => (
            <FilterChip
              key={f.key}
              label={f.label}
              count={counts[f.key]}
              active={show === f.key}
              peach={f.key === 'owed' && counts.owed > 0}
              onClick={() => setShow(f.key)}
            />
          ))}
          <div className="relative w-full sm:ml-auto sm:w-64">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4A4270]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search events"
              aria-label="Search events by name or venue"
              className="w-full rounded-full border-2 border-[#DDD8F0] bg-white py-2 pl-10 pr-9 text-sm text-[hsl(var(--c3-ink))] outline-none transition placeholder:text-[#8A82AD] focus:border-[hsl(var(--c3-ink))]"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-[#4A4270] hover:bg-[#EDE7FF]">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {board.total === 0 && <NoEvents clubSlug={clubSlug} canEdit={canEdit} />}

      {board.total > 0 && nothingToShow && (
        <div className="rounded-[22px] border-2 border-dashed border-[#DDD8F0] bg-white/50 p-8 text-center text-sm text-[#4A4270]">
          {q ? (
            <>
              No events match “{query.trim()}”.
              <button type="button" onClick={() => setQuery('')} className="ml-2 font-semibold text-[#6D4FD8] hover:underline">clear search</button>
            </>
          ) : EMPTY_COPY[show]}
        </div>
      )}

      {board.total > 0 && visible.map((key) => {
        const rows = groups[key];
        if (!rows.length) return null;
        const shown = key === 'past' ? rows.slice(0, pastShown) : rows;
        return (
          <section key={key} className="space-y-3">
            <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.1em] text-[#4A4270]">{SECTION_TITLES[key]}</h2>
            {shown.map((row) => (
              <motion.div key={row.event.id} {...rise()}>
                {key === 'upcoming' && <UpcomingRow row={row} clubSlug={clubSlug} now={now} />}
                {key === 'owed' && <OwedRow row={row} clubSlug={clubSlug} now={now} />}
                {key === 'drafts' && <DraftRow row={row} clubSlug={clubSlug} now={now} canEdit={canEdit} />}
                {key === 'past' && <PastRow row={row} clubSlug={clubSlug} treasurer={treasurer} />}
              </motion.div>
            ))}
            {key === 'past' && rows.length > pastShown && (
              <button type="button" onClick={() => setPastShown((n) => n + PAST_PAGE)} className="ink-btn ink-btn-light w-full py-2.5 shadow-none sm:w-auto">
                show {Math.min(PAST_PAGE, rows.length - pastShown)} more
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

function FilterChip({ label, count, active, peach, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        `inline-flex items-center gap-2 rounded-full border-2 ${INK} px-3.5 py-1.5 text-sm transition`,
        active
          ? 'bg-[hsl(var(--c3-ink))] font-bold text-white'
          : peach ? 'bg-[#FFE6D6] font-bold hover:bg-[#FFD9C2]' : 'bg-white font-semibold hover:bg-[#EDE7FF]',
      )}
    >
      {label}
      <span className={cn('rounded-full px-1.5 text-[11px] font-bold leading-[18px]', active ? 'bg-white text-[hsl(var(--c3-ink))]' : 'bg-[#EDE7FF]')}>{count}</span>
    </button>
  );
}

function Pill({ tone = 'white', dot = false, pulse = false, children }) {
  const tones = {
    mint: 'bg-[#D9F7E7]',
    butter: 'bg-[#FFF4D9]',
    white: 'bg-white',
    ink: 'bg-[hsl(var(--c3-ink))] text-white',
    lavender: 'bg-[#EDE7FF]',
  };
  return (
    <span className={cn(`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 ${INK} px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em]`, tones[tone])}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full bg-current', pulse && 'animate-pulse')} />}
      {children}
    </span>
  );
}

function dateParts(iso) {
  const f = (o) => new Date(iso).toLocaleDateString('en-AU', { timeZone: MEL_TZ, ...o });
  return { weekday: f({ weekday: 'short' }), day: f({ day: '2-digit' }), month: f({ month: 'short' }).replace('.', '').toLowerCase() };
}

/** The date down the left edge. Phones get it as a pill instead (MobileDate). */
function DateBlock({ iso, tint, dashed = false }) {
  const d = dateParts(iso);
  return (
    <div
      className={cn(
        'hidden w-[92px] shrink-0 flex-col items-center justify-center py-4 sm:flex',
        dashed ? 'border-r-2 border-dashed border-[#B7AEDC] text-[#4A4270]' : `border-r-2 ${INK}`,
      )}
      style={dashed ? undefined : { background: tint }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#4A4270]">{d.weekday}</p>
      <p className="font-display text-[2.5rem] font-bold leading-none">{d.day}</p>
      <p className="text-xs font-semibold text-[#4A4270]">{d.month}</p>
    </div>
  );
}

function MobileDate({ iso }) {
  const d = dateParts(iso);
  return (
    <span className={`inline-flex items-center rounded-full border-2 ${INK} bg-white px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] sm:hidden`}>
      {d.weekday} {d.day} {d.month}
    </span>
  );
}

function Visual({ event, size = 52, faded = false }) {
  if (event.cover_image_url) {
    return <img src={event.cover_image_url} alt="" style={{ width: size, height: size }} className={cn(`shrink-0 rounded-2xl border-2 ${INK} object-cover`, faded && 'opacity-70')} />;
  }
  return <img src={characterFor(event.id).src} alt="" style={{ width: size, height: size }} className={cn('shrink-0', faded && 'opacity-70')} />;
}

function MiniMeter({ value, unit, total, note, color = '#8E6FE8' }) {
  const pct = total ? Math.min(100, Math.round((value / total) * 100)) : null;
  return (
    <div className="w-full sm:w-[170px]">
      <p className="flex items-baseline">
        <span className="font-display text-2xl font-bold leading-none tabular-nums">{value}</span>
        <span className={cn('text-xs text-[#4A4270]', unit.startsWith('/') ? 'ml-0.5' : 'ml-1')}>{unit}</span>
      </p>
      {pct != null && (
        <div className={`mt-1.5 flex h-3 overflow-hidden rounded-full border-2 ${INK} bg-white`}>
          <span className={cn('h-full', pct > 0 && pct < 100 && `border-r-2 ${INK}`)} style={{ width: `${pct}%`, background: color }} />
        </div>
      )}
      <p className="mt-1 text-[11px] text-[#4A4270]">{note}</p>
    </div>
  );
}

const timeRange = (e) => (e.ends_at ? `${formatTime(e.starts_at)} to ${formatTime(e.ends_at)}` : formatTime(e.starts_at));
const smallBtn = 'px-4 py-1.5 text-[13px]';

function UpcomingRow({ row, clubSlug, now }) {
  const { event: e, live, going, waitlisted, checkedIn, arrived } = row;
  // Everything in this section is taking RSVPs, so the chip says when instead.
  const when = whenLabel(e, now);
  const days = daysUntil(e.starts_at, now);
  const chip = when.soon ? when.text.split(' · ')[0] : days === 1 ? 'tomorrow' : `in ${days} days`;
  const doorTime = live || new Date(e.starts_at).getTime() - now < 12 * 36e5;
  const cap = e.capacity;
  const meter = live
    ? {
      value: checkedIn,
      unit: going ? `/${going} in` : 'checked in',
      total: going || null,
      note: going ? `${Math.max(0, going - arrived)} still to arrive` : 'walk-ins only',
      color: '#7CE0B0',
    }
    : {
      value: going,
      unit: cap ? `/${cap} going` : 'going',
      total: cap || null,
      note: waitlisted ? `${waitlisted} on the waitlist`
        : !cap ? 'no limit on places'
          : going >= cap ? 'full' : `${cap - going} place${cap - going === 1 ? '' : 's'} left`,
    };
  const meta = [timeRange(e), e.location_name, e.contact_name && `contact ${e.contact_name}`].filter(Boolean).join(' · ');

  return (
    <article className="ink-card flex overflow-hidden shadow-[0_5px_0_0_hsl(var(--c3-ink))]">
      <DateBlock iso={e.starts_at} tint={characterFor(e.id).tint} />
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:gap-5">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Visual event={e} />
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <MobileDate iso={e.starts_at} />
              {live
                ? <Pill tone="mint" dot pulse>happening now</Pill>
                : <Pill tone="mint" dot>{chip}</Pill>}
              {e.is_grant_funded && (
                <Pill tone="butter">grant · {e.grant_category}{e.grant_amount_cents ? ` · ${dollars(e.grant_amount_cents)}` : ''}</Pill>
              )}
            </div>
            <Link to={`/c/${clubSlug}/events/${e.id}`} className="block font-display text-xl font-bold leading-snug decoration-2 underline-offset-4 hover:underline sm:truncate">
              {e.title}
            </Link>
            <p className="mt-0.5 text-[13px] text-[#4A4270] sm:truncate">{meta}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 lg:flex-nowrap">
          <MiniMeter {...meter} />
          <div className="flex gap-2 lg:flex-col">
            {doorTime ? (
              <Link to={`/c/${clubSlug}/events/${e.id}/scan`} className={`ink-btn ink-btn-dark ${smallBtn}`}>
                <ScanLine className="h-3.5 w-3.5" /> scanner
              </Link>
            ) : (
              <button type="button" onClick={() => copyText(`${window.location.origin}/rsvp/${e.id}`, 'RSVP link copied')} className={`ink-btn ink-btn-light ${smallBtn}`}>
                <Copy className="h-3.5 w-3.5" /> copy link
              </button>
            )}
            <Link to={`/c/${clubSlug}/events/${e.id}`} className={`ink-btn ink-btn-light ${smallBtn}`}>manage</Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function OwedRow({ row, clubSlug, now }) {
  const { event: e, steps, checkedIn } = row;
  const done = steps.filter((s) => s.done).length;
  const pieces = steps.filter((s) => s.key === 'photos' || s.key === 'receipts');
  const days = Math.max(0, daysUntil(now, e.ends_at || e.starts_at));
  const ran = days === 0 ? 'ran today' : days === 1 ? 'ran yesterday' : days < 14 ? `ran ${days} days ago` : `ran ${Math.floor(days / 7)} weeks ago`;

  return (
    <article className="ink-card flex overflow-hidden bg-[#FFE6D6] shadow-[0_5px_0_0_hsl(var(--c3-ink))]">
      <DateBlock iso={e.starts_at} tint="#FFD3B8" />
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:gap-5">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <img src="/brand/sticker-orange.png" alt="" className="h-[52px] w-[52px] shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <Pill tone="ink">pack owed</Pill>
              <Pill tone="white">{ran}</Pill>
            </div>
            <Link to={`/c/${clubSlug}/events/${e.id}/grant`} className="block font-display text-xl font-bold leading-snug decoration-2 underline-offset-4 hover:underline sm:truncate">
              {e.title}
            </Link>
            <p className="mt-0.5 text-[13px] text-[#3A3260]">
              {checkedIn ? `${checkedIn} attended` : <strong>no attendance recorded</strong>}
              {pieces.map((s) => (
                <span key={s.key}>
                  {' · '}
                  {s.done ? `${s.label} in` : <strong>{s.label} missing</strong>}
                </span>
              ))}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 lg:flex-nowrap">
          <div className="w-full sm:w-[170px]">
            <p className="text-xs font-bold">{done} of {steps.length} steps done</p>
            <div className="mt-1.5 flex gap-1" role="img" aria-label={`${done} of ${steps.length} steps done`}>
              {steps.map((s) => (
                <span key={s.key} title={s.label} className={cn(`h-2.5 flex-1 rounded-full border-[1.5px] ${INK}`, s.done ? 'bg-[#8E6FE8]' : 'bg-white')} />
              ))}
            </div>
            <p className="mt-1 text-[11px] text-[#4A4270]">
              {e.grant_amount_cents ? `${dollars(e.grant_amount_cents)} waiting on UMSU` : 'grant funded'}
            </p>
          </div>
          <div className="flex gap-2 lg:flex-col">
            <Link to={`/c/${clubSlug}/events/${e.id}/grant`} className={`ink-btn ink-btn-primary ${smallBtn}`}>grant pack</Link>
            <Link to={`/c/${clubSlug}/events/${e.id}`} className={`ink-btn ink-btn-light ${smallBtn}`}>details</Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function DraftRow({ row, clubSlug, now, canEdit }) {
  const e = row.event;
  const blockers = [];
  if (new Date(e.starts_at).getTime() < now) blockers.push('a new date, as this one has passed');
  if (e.is_grant_funded && !(e.contact_name && e.contact_phone)) blockers.push('a contact phone for the grant');
  const extras = [];
  if (!e.description) extras.push('a description');
  if (!e.cover_image_url) extras.push('a cover image');
  if (!e.location_address) extras.push('a venue address');
  const hint = blockers.length
    ? `Needs ${joinWords(blockers)} before it can go out.`
    : extras.length
      ? `Could use ${joinWords(extras.slice(0, 2))}. Nothing else is needed to publish.`
      : 'Everything is in. Ready to publish.';

  return (
    <article className="flex overflow-hidden rounded-[22px] border-2 border-dashed border-[#B7AEDC] bg-[#FBF9FF]">
      <DateBlock iso={e.starts_at} dashed />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Visual event={e} faded />
          <div className="min-w-0 flex-1">
            <div className="mb-1 sm:hidden"><MobileDate iso={e.starts_at} /></div>
            <Link to={`/c/${clubSlug}/events/${e.id}`} className="block font-display text-xl font-bold leading-snug text-[#3A3260] decoration-2 underline-offset-4 hover:underline sm:truncate">
              {e.title}
            </Link>
            <p className={cn('mt-0.5 text-[13px]', blockers.length ? 'font-semibold text-[#C2410C]' : 'text-[#4A4270]')}>{hint}</p>
          </div>
        </div>
        <Link to={`/c/${clubSlug}/events/${e.id}`} className="ink-btn ink-btn-light shrink-0 self-start px-4 py-2 text-[13px] sm:self-auto">
          {!canEdit ? 'view' : blockers.length ? 'fix & publish' : 'finish & publish'}
        </Link>
      </div>
    </article>
  );
}

function PastRow({ row, clubSlug, treasurer }) {
  const { event: e, going, arrived, checkedIn, pack } = row;
  const cancelled = e.status === 'cancelled';
  const people = cancelled
    ? (e.cancellation_reason ? `called off: ${e.cancellation_reason}` : 'called off')
    : going ? `${arrived} of ${going} turned up` : `${checkedIn} checked in`;

  let grant = 'no grant';
  let chip = { label: 'done', className: 'border-[#E3DEF5] text-[#4A4270]' };
  if (cancelled) {
    chip = { label: 'cancelled', className: 'border-[#F5C2C0] text-[#B42318]' };
  } else if (e.is_grant_funded && !treasurer) {
    grant = 'grant funded';
  } else if (e.is_grant_funded && pack?.submitted_to_union) {
    grant = 'pack sent to UMSU';
    chip = { label: 'pack sent', className: 'border-[#BFEBD5] text-[#1F9E66]' };
  } else if (e.is_grant_funded && pack) {
    grant = 'pack ready to send';
    chip = { label: 'pack ready', className: 'border-[#D6CCFA] text-[#6D4FD8]' };
  }

  return (
    <Link
      to={`/c/${clubSlug}/events/${e.id}`}
      className="group flex items-center gap-3.5 rounded-[20px] border-2 border-[#E3DEF5] bg-white px-4 py-3 transition hover:border-[hsl(var(--c3-ink))] sm:px-5"
    >
      <Visual event={e} size={38} faded={cancelled} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-[15px] font-semibold sm:truncate', cancelled && 'text-[#4A4270]')}>{e.title}</p>
        <p className="text-xs text-[#4A4270] sm:truncate">
          {shortDate(e.starts_at)} · {people}{cancelled ? '' : ` · ${grant}`}
        </p>
      </div>
      <span className={cn('hidden shrink-0 rounded-full border-2 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] sm:inline', chip.className)}>
        {chip.label}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-[#4A4270] transition group-hover:translate-x-0.5 group-hover:text-[hsl(var(--c3-ink))]" />
    </Link>
  );
}

function NoEvents({ clubSlug, canEdit }) {
  return (
    <section className="ink-card flex flex-col items-center p-8 text-center">
      <img src="/brand/characters-cheers.webp" alt="" className="w-48" />
      <h2 className="mt-2 font-display text-2xl font-bold">No events yet</h2>
      <p className="mt-1 max-w-sm text-sm text-[#4A4270]">Create one, share the RSVP link, and scan people in at the door.</p>
      {canEdit && (
        <Link to={`/c/${clubSlug}/events/new`} className="ink-btn ink-btn-primary mt-5 px-5 py-2.5">
          <Plus className="h-4 w-4" strokeWidth={2.8} /> new event
        </Link>
      )}
    </section>
  );
}

function EventsSkeleton() {
  return (
    <div className="max-w-[1060px] animate-pulse space-y-6" aria-busy="true" aria-label="Loading events">
      <div>
        <div className="h-9 w-40 rounded-xl bg-[#E4DEF7]" />
        <div className="mt-2 h-4 w-72 max-w-full rounded bg-[#E4DEF7]" />
      </div>
      <div className="flex gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-9 w-24 rounded-full bg-[#E4DEF7]" />)}</div>
      {[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-[22px] border-2 border-[#DDD8F0] bg-white/60" />)}
    </div>
  );
}
