// The club overview's data: loaded in one pass, then worked out here so the
// page only has to lay it out. Every figure comes from real rows; where there
// is nothing to count yet, the value is null and the page says so.

import { db } from '@/api/db';
import { canManageAcquittal } from '@/lib/clubs';
import { formatTime, MEL_TZ } from '@/lib/format';

const PAGE = 500;
const DAY = 864e5;

/** Pages through an entity until it runs out, up to `max` rows. */
async function fetchAll(entity, query, sort, max) {
  const byId = new Map();
  for (let skip = 0; skip < max; skip += PAGE) {
    const rows = await db[entity].filter(query, sort, PAGE, skip || undefined);
    rows.forEach((r) => byId.set(r.id, r));
    if (rows.length < PAGE) break;
  }
  return [...byId.values()];
}

export async function loadDashboard(club, role) {
  const q = { club_id: club.id };
  const treasurer = canManageAcquittal(role);
  const [events, rsvps, checkIns, packs, receipts, photos] = await Promise.all([
    db.Event.filter(q, '-starts_at', 500),
    fetchAll('RSVP', q, '-created_date', 3000),
    fetchAll('CheckIn', q, '-checked_in_at', 4000),
    treasurer ? db.AcquittalPack.filter(q, '-created_date', 500) : [],
    treasurer ? fetchAll('EventReceipt', q, '-created_date', 2000) : [],
    treasurer ? fetchAll('EventPhoto', q, '-created_date', 2000) : [],
  ]);
  return { events, rsvps, checkIns, packs, receipts, photos, treasurer };
}

// ------------------------------------------------------------- Melbourne time --

function melParts(value) {
  const [y, m, d] = new Date(value).toLocaleDateString('en-CA', { timeZone: MEL_TZ }).split('-').map(Number);
  return { y, m, d };
}
const monthIndex = (value) => { const p = melParts(value); return p.y * 12 + (p.m - 1); };
const dayIndex = (value) => { const p = melParts(value); return Math.round(Date.UTC(p.y, p.m - 1, p.d) / DAY); };
const melHour = (value) => Number(new Date(value).toLocaleString('en-AU', { timeZone: MEL_TZ, hour: 'numeric', hourCycle: 'h23' }));

/** Whole Melbourne calendar days from now until `value` (0 = today). */
export const daysUntil = (value, now = Date.now()) => dayIndex(value) - dayIndex(now);

export function greeting(user, now = Date.now()) {
  const hour = melHour(now);
  const part = hour < 5 ? 'Up late' : hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const name = (user?.full_name || '').trim().split(/\s+/)[0] || (user?.email || '').split('@')[0];
  return name ? `${part}, ${name}` : part;
}

/** The short "when" line for an event chip. */
export function whenLabel(event, now = Date.now()) {
  const start = new Date(event.starts_at).getTime();
  const end = new Date(event.ends_at || event.starts_at).getTime();
  if (start <= now && end >= now) return { text: 'happening now', live: true };
  const minutes = Math.round((start - now) / 6e4);
  if (minutes < 60) return { text: `starts in ${Math.max(1, minutes)} min`, soon: true };
  const hours = Math.round(minutes / 60);
  if (hours < 12) return { text: `starts in ${hours} hour${hours === 1 ? '' : 's'}`, soon: true };
  const days = daysUntil(event.starts_at, now);
  const time = formatTime(event.starts_at);
  if (days === 0) return { text: `${melHour(start) >= 17 ? 'tonight' : 'today'} · ${time}`, soon: true };
  if (days === 1) return { text: `tomorrow · ${time}` };
  if (days < 7) {
    const weekday = new Date(event.starts_at).toLocaleDateString('en-AU', { timeZone: MEL_TZ, weekday: 'long' });
    return { text: `this ${weekday} · ${time}` };
  }
  return { text: `in ${days} days` };
}

// ---------------------------------------------------------------- the model --

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = row[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
}

const personKey = (c) => (c.email ? c.email.toLowerCase() : `name:${(c.full_name || '').trim().toLowerCase()}`);

export function buildDashboard(data, { now = Date.now() } = {}) {
  const { events, rsvps, checkIns, packs, receipts, photos, treasurer } = data;
  const start = (e) => new Date(e.starts_at).getTime();
  const end = (e) => new Date(e.ends_at || e.starts_at).getTime();
  const rsvpsBy = groupBy(rsvps, 'event_id');
  const checkInsBy = groupBy(checkIns, 'event_id');

  const countsFor = (e) => {
    const list = rsvpsBy.get(e.id) || [];
    return {
      going: list.filter((r) => r.status === 'confirmed').length,
      waitlisted: list.filter((r) => r.status === 'waitlisted').length,
      checkedIn: (checkInsBy.get(e.id) || []).length,
    };
  };

  // What's next: whatever is on right now, otherwise the soonest published event.
  const published = events.filter((e) => e.status === 'published');
  const live = published.filter((e) => start(e) <= now && end(e) >= now).sort((a, b) => start(a) - start(b));
  const upcoming = published.filter((e) => start(e) > now).sort((a, b) => start(a) - start(b));
  const nextEvent = live[0] || upcoming[0] || null;
  const later = upcoming.filter((e) => e !== nextEvent).slice(0, 3);
  const drafts = events.filter((e) => e.status === 'draft').sort((a, b) => start(a) - start(b));

  // This month, against the same point last month, so the 3rd is not compared
  // with the whole of the month before.
  const thisMonth = monthIndex(now);
  const today = melParts(now).d;
  const signups = rsvps.filter((r) => r.status !== 'cancelled');
  const rsvpsThisMonth = signups.filter((r) => monthIndex(r.created_date) === thisMonth).length;
  const rsvpsLastMonthSoFar = signups
    .filter((r) => monthIndex(r.created_date) === thisMonth - 1 && melParts(r.created_date).d <= today).length;
  const lastMonthName = new Date(now - (today + 1) * DAY).toLocaleDateString('en-AU', { timeZone: MEL_TZ, month: 'long' });

  // Turnout: people who RSVPed and were scanned in, over events that ended in
  // the last 90 days. Walk-ins are left out, or turnout could pass 100%.
  let expected = 0;
  let arrived = 0;
  for (const e of events) {
    if (e.status === 'draft' || e.status === 'cancelled' || end(e) >= now || end(e) < now - 90 * DAY) continue;
    const confirmed = (rsvpsBy.get(e.id) || []).filter((r) => r.status === 'confirmed');
    if (!confirmed.length) continue;
    const ids = new Set(confirmed.map((r) => r.id));
    expected += confirmed.length;
    arrived += (checkInsBy.get(e.id) || []).filter((c) => c.rsvp_id && ids.has(c.rsvp_id)).length;
  }
  const turnout = expected ? Math.round((arrived / expected) * 100) : null;

  // First-timers: people whose first check-in with the club was this month.
  const firstSeen = new Map();
  for (const c of checkIns) {
    const k = personKey(c);
    const t = new Date(c.checked_in_at).getTime();
    if (!firstSeen.has(k) || t < firstSeen.get(k)) firstSeen.set(k, t);
  }
  const firstTimers = [...firstSeen.values()].filter((t) => monthIndex(t) === thisMonth).length;
  const peopleThisMonth = new Set(checkIns.filter((c) => monthIndex(c.checked_in_at) === thisMonth).map(personKey)).size;

  const eventsThisMonth = events.filter((e) => e.status !== 'draft' && e.status !== 'cancelled' && monthIndex(e.starts_at) === thisMonth);

  // Grant money this calendar year: spent (receipts) against approved.
  let grant = null;
  if (treasurer) {
    const year = melParts(now).y;
    const grantEvents = events.filter((e) => e.is_grant_funded && e.status !== 'draft' && e.status !== 'cancelled' && melParts(e.starts_at).y === year);
    const ids = new Set(grantEvents.map((e) => e.id));
    grant = {
      approvedCents: grantEvents.reduce((s, e) => s + (e.grant_amount_cents || 0), 0),
      spentCents: receipts.filter((r) => ids.has(r.event_id)).reduce((s, r) => s + (r.amount_cents || 0), 0),
      events: grantEvents.length,
    };
  }

  // Grant packs still to do, oldest first: grant money is only released once
  // UMSU has the pack. The steps are what the grant page needs to generate one.
  const packed = new Set(packs.map((p) => p.event_id));
  const photosBy = groupBy(photos, 'event_id');
  const receiptsBy = groupBy(receipts, 'event_id');
  const pendingPacks = !treasurer ? [] : events
    .filter((e) => e.is_grant_funded && e.status !== 'draft' && e.status !== 'cancelled' && end(e) < now && !packed.has(e.id))
    .sort((a, b) => end(a) - end(b))
    .map((e) => {
      const steps = [
        { key: 'attendance', label: 'attendance', done: (checkInsBy.get(e.id) || []).length > 0 },
        { key: 'photos', label: 'photos', done: (photosBy.get(e.id) || []).length > 0 },
        { key: 'receipts', label: 'receipts', done: (receiptsBy.get(e.id) || []).length > 0 },
        { key: 'pdf', label: 'the PDF', done: false },
      ];
      return { event: e, steps, done: steps.filter((s) => s.done).length, daysAgo: Math.max(0, daysUntil(now, e.ends_at)) };
    });

  // At the door: the event on right now, or the most recent one in the last 60
  // days that anyone RSVPed to or checked in at.
  const doorEvent = events
    .filter((e) => e.status !== 'draft' && e.status !== 'cancelled' && start(e) <= now && end(e) > now - 60 * DAY
      && ((checkInsBy.get(e.id) || []).length || (rsvpsBy.get(e.id) || []).length))
    .sort((a, b) => start(b) - start(a))[0];

  let door = null;
  if (doorEvent) {
    const ins = [...(checkInsBy.get(doorEvent.id) || [])].sort((a, b) => new Date(b.checked_in_at) - new Date(a.checked_in_at));
    const confirmed = (rsvpsBy.get(doorEvent.id) || []).filter((r) => r.status === 'confirmed');
    const rsvpIds = new Set(confirmed.map((r) => r.id));
    const fromRsvps = ins.filter((c) => c.rsvp_id && rsvpIds.has(c.rsvp_id)).length;
    const visitNumber = (c) => {
      const k = personKey(c);
      const at = new Date(c.checked_in_at).getTime();
      return checkIns.filter((x) => personKey(x) === k && new Date(x.checked_in_at).getTime() <= at).length;
    };
    door = {
      event: doorEvent,
      live: start(doorEvent) <= now && end(doorEvent) >= now,
      checkedIn: ins.length,
      fromRsvps,
      expected: confirmed.length,
      walkIns: ins.filter((c) => !c.rsvp_id).length,
      recent: ins.slice(0, 4).map((c) => ({ id: c.id, name: c.full_name, at: c.checked_in_at, visit: visitNumber(c) })),
    };
  }

  return {
    next: nextEvent ? { event: nextEvent, live: live.includes(nextEvent), ...countsFor(nextEvent) } : null,
    later: later.map((e) => ({ event: e, ...countsFor(e) })),
    drafts,
    hasEvents: events.length > 0,
    stats: {
      rsvpsThisMonth,
      rsvpsLastMonthSoFar,
      lastMonthName,
      turnout,
      firstTimers,
      peopleThisMonth,
      eventsThisMonth: eventsThisMonth.length,
      stillToCome: eventsThisMonth.filter((e) => start(e) > now).length,
      grant,
    },
    pendingPacks,
    door,
  };
}
