// What a ticket says when it is printed as a receipt. The slip on the lanyard
// and the one printed after RSVPing are both drawn from this, so they match.
//
// It reads like a real one: the club issuing it, the event, who it admits,
// and then the thing that matters at the door (the QR, or where the ticket
// stands). The app's own name stays off the paper; the page already has it.

import { formatTime, MEL_TZ } from '@/lib/format';
import { editionFor } from '@/lib/ticket';

export const RECEIPT_INK = '#1E1836';
export const RECEIPT_MUTED = '#5B5184';
export const RECEIPT_PAPER = '#FBF8F0';

const melDay = (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: MEL_TZ });
const time24 = (iso) => new Date(iso).toLocaleTimeString('en-AU', { timeZone: MEL_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function ticketState({ rsvp, event }, now = Date.now()) {
  if (event.status === 'cancelled') return 'event-cancelled';
  if (rsvp.status === 'cancelled') return 'cancelled';
  if (rsvp.checked_in_at) return 'admitted';
  if (rsvp.status === 'waitlisted') return 'waitlisted';
  if (event.ends_at && new Date(event.ends_at).getTime() < now) return 'ended';
  return 'valid';
}

/** "WED 16 SEPT", with the year only when it isn't this one. */
function dateText(iso, now) {
  const opts = { timeZone: MEL_TZ, weekday: 'short', day: 'numeric', month: 'short' };
  if (melDay(iso).slice(0, 4) !== melDay(now).slice(0, 4)) opts.year = 'numeric';
  return new Date(iso).toLocaleDateString('en-AU', opts).replace(/,/g, '').toUpperCase();
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

/** "13/09/26 10:42", the way a till prints it. */
function bookedText(iso) {
  if (!iso) return null;
  const date = new Date(iso).toLocaleDateString('en-AU', { timeZone: MEL_TZ, day: '2-digit', month: '2-digit', year: '2-digit' });
  return `${date} ${time24(iso)}`;
}

/** The friendly line at the foot of the slip, from how often they've come to this club. */
function visitLine(visits) {
  if (visits == null) return null;
  const n = visits + 1;
  if (n === 1) return 'FIRST VISIT · WELCOME!';
  const tag = n === 2 ? 'WELCOME BACK' : n <= 4 ? 'REGULAR' : 'LEGEND';
  return `${tag} · VISIT NO. ${n}`;
}

/**
 * The number under the barcode: the ticket number, then nine digits that are
 * the same every time for this ticket.
 */
function referenceDigits(seed, number) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${String(number || 0).padStart(3, '0')}${String((h >>> 0) % 1e9).padStart(9, '0')}`;
}

function statusFor(state, rsvp, ticket) {
  switch (state) {
    case 'valid':
      return { caption: 'SCAN AT THE DOOR' };
    case 'admitted':
      return { headline: 'CHECKED IN', aside: time24(rsvp.checked_in_at), detail: 'ENJOY THE EVENT' };
    case 'waitlisted':
      return { headline: 'WAITLISTED', aside: ticket?.waitlist_position ? `#${ticket.waitlist_position}` : '', detail: "WE'LL EMAIL IF A SPOT OPENS" };
    case 'cancelled':
      return { headline: 'CANCELLED', detail: 'THIS TICKET IS NO LONGER VALID' };
    case 'event-cancelled':
      return { headline: 'EVENT CANCELLED', detail: 'THE CLUB CALLED IT OFF' };
    default:
      return { headline: 'EVENT ENDED', detail: 'THANKS FOR COMING' };
  }
}

export function receiptFor(data, now = Date.now()) {
  const { rsvp, event, club, ticket } = data;
  const state = ticketState(data, now);
  const admits = state === 'valid' || state === 'admitted';

  return {
    state,
    rare: !!editionFor(rsvp.rsvp_token).rare,
    issuer: (club?.name || '').toUpperCase(),
    title: (event.title || '').toUpperCase(),
    event: [
      ['DATE', dateText(event.starts_at, now)],
      ['TIME', timeRange(event)],
      ['VENUE', (event.location_name || '').toUpperCase()],
    ].filter(([, value]) => value),
    address: (event.location_address || '').toUpperCase() || null,
    guest: [
      [admits ? 'ADMIT' : 'NAME', (rsvp.full_name || '').toUpperCase()],
      state === 'waitlisted' ? null : ['TICKET NO.', ticket?.number ? String(ticket.number).padStart(3, '0') : null],
      ['BOOKED', bookedText(rsvp.created_date)],
    ].filter((row) => row && row[1]),
    status: statusFor(state, rsvp, ticket),
    showQr: state === 'valid',
    footer: state === 'valid' || state === 'admitted' || state === 'waitlisted' ? visitLine(ticket?.club_visits) : null,
    barcode: referenceDigits(rsvp.rsvp_token || event.id, ticket?.number),
  };
}
