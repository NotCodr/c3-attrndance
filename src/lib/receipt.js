// What a ticket says when it is printed as a receipt. The paper hanging from
// the lanyard and the flat receipt elsewhere both read from here, so the two
// can never disagree.

import { formatTime, MEL_TZ } from '@/lib/format';
import { editionFor, ordinal, ticketNumber } from '@/lib/ticket';

// Short edition codes for the line under the barcode, and the sticker each
// edition comes with. Holo, the rare one, gets the star.
const EDITIONS = {
  orchid: { code: 'ORCHD', sticker: '/brand/sticker-purple.png' },
  lagoon: { code: 'LAGON', sticker: '/brand/sticker-blue.png' },
  dusk: { code: 'DUSK', sticker: '/brand/sticker-pink.png' },
  berry: { code: 'BERRY', sticker: '/brand/sticker-orange.png' },
  holo: { code: 'HOLO', sticker: '/brand/sticker-star.webp' },
};

export const RECEIPT_INK = '#1E1836';
export const RECEIPT_MUTED = '#5B5184';
export const RECEIPT_PAPER = '#FBF8F0';

const melDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: MEL_TZ });

export function ticketState({ rsvp, event }, now = Date.now()) {
  if (event.status === 'cancelled') return 'event-cancelled';
  if (rsvp.status === 'cancelled') return 'cancelled';
  if (rsvp.checked_in_at) return 'admitted';
  if (rsvp.status === 'waitlisted') return 'waitlisted';
  if (event.ends_at && new Date(event.ends_at).getTime() < now) return 'ended';
  return 'valid';
}

/** "7:00–10:00 PM", "11:00 AM–2:00 PM", or "FROM 7:00 PM" when it runs overnight. */
function timeRange(event) {
  const start = formatTime(event.starts_at).toUpperCase();
  if (!event.ends_at) return start;
  if (melDay(event.starts_at) !== melDay(event.ends_at)) return `FROM ${start}`;
  const end = formatTime(event.ends_at).toUpperCase();
  const [s, sMeridiem] = start.split(/\s+/);
  const [e, eMeridiem] = end.split(/\s+/);
  return sMeridiem === eMeridiem ? `${s}–${e} ${eMeridiem}` : `${start}–${end}`;
}

function visitText(visits) {
  if (visits == null) return null;
  const n = visits + 1;
  if (n === 1) return 'FIRST TIME';
  const tag = n === 2 ? 'WELCOME BACK' : n <= 4 ? 'REGULAR' : 'LEGEND';
  return `${ordinal(n).toUpperCase()} · ${tag}`;
}

const STATUS = {
  valid: () => ({ label: 'ADMIT ONE', aside: 'VALID', note: 'SHOW THE QR AT THE DOOR' }),
  admitted: (rsvp) => ({
    label: 'ADMITTED',
    aside: new Date(rsvp.checked_in_at).toLocaleTimeString('en-AU', { timeZone: MEL_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    note: 'ENJOY THE EVENT',
  }),
  waitlisted: (rsvp, ticket) => ({
    label: 'WAITLIST',
    aside: ticket?.waitlist_position ? `#${ticket.waitlist_position}` : '',
    note: "WE'LL EMAIL IF A SPOT OPENS",
  }),
  cancelled: () => ({ label: 'VOID', aside: '', note: 'YOU CANCELLED THIS TICKET' }),
  'event-cancelled': () => ({ label: 'CALLED OFF', aside: '', note: 'THE CLUB CANCELLED THIS EVENT' }),
  ended: () => ({ label: 'THANK YOU', aside: '', note: 'THIS EVENT HAS ENDED' }),
};

export function receiptFor(data, now = Date.now()) {
  const { rsvp, event, club, ticket } = data;
  const edition = editionFor(rsvp.rsvp_token);
  const extra = EDITIONS[edition.key] || EDITIONS.orchid;
  const state = ticketState(data, now);
  const [, month, day] = melDay(event.starts_at).split('-');
  const date = new Date(event.starts_at)
    .toLocaleDateString('en-AU', { timeZone: MEL_TZ, weekday: 'short', day: 'numeric', month: 'short' })
    .replace(',', '')
    .toUpperCase();

  return {
    state,
    edition,
    sticker: extra.sticker,
    club: (club?.name || '').toUpperCase(),
    editionLine: `${edition.name.toUpperCase()} EDITION${edition.rare ? ' · RARE' : ''}`,
    title: (event.title || '').toUpperCase(),
    rows: [
      ['DATE', date],
      ['TIME', timeRange(event)],
      ['WHERE', (event.location_name || '').toUpperCase()],
      ['GUEST', (rsvp.full_name || '').toUpperCase()],
      ['TICKET', ticketNumber(ticket?.number)],
      ['VISIT', visitText(ticket?.club_visits)],
    ].filter(([, value]) => value),
    status: STATUS[state](rsvp, ticket),
    showQr: state === 'valid',
    code: `C3 ${String(ticket?.number || 0).padStart(3, '0')} ${extra.code} ${month}${day}`,
    bars: barcodeBars(rsvp.rsvp_token || event.id),
  };
}

/**
 * A decorative barcode that is the same every time for the same ticket:
 * bar positions and widths as fractions of the full width.
 */
export function barcodeBars(seed, modules = 96) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const random = () => {
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const bars = [];
  let x = 0;
  let bar = true;
  while (x < modules) {
    const w = Math.min(1 + Math.floor(random() * (bar ? 3 : 2.5)), modules - x);
    if (bar) bars.push({ x: x / modules, w: w / modules });
    x += w;
    bar = !bar;
  }
  return bars;
}
