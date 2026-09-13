// Ticket editions, countdowns and the small helpers the attendee pages share.

/**
 * Colourways. The event page picks a common one at random per visit; a ticket
 * is minted as one for good, decided by its token, and the page takes on that
 * ticket's colours. Holo is the rare one.
 */
export const PALETTES = {
  orchid: {
    name: 'Orchid', color1: '#FF9FFC', color2: '#5227FF', color3: '#B497CF',
    foil: 'linear-gradient(120deg, #ff9ffc 0%, #a66bff 55%, #5227ff 100%)',
  },
  lagoon: {
    name: 'Lagoon', color1: '#A9D6FF', color2: '#5227FF', color3: '#B497CF',
    foil: 'linear-gradient(120deg, #a9d6ff 0%, #7b6bff 55%, #5227ff 100%)',
  },
  dusk: {
    name: 'Dusk', color1: '#FFB8D9', color2: '#4B2BEA', color3: '#9C8CF0',
    foil: 'linear-gradient(120deg, #ffb8d9 0%, #9c8cf0 50%, #4b2bea 100%)',
  },
  berry: {
    name: 'Berry', color1: '#FF8FB8', color2: '#3D1FD1', color3: '#A78BFA',
    foil: 'linear-gradient(120deg, #ff8fb8 0%, #a78bfa 50%, #3d1fd1 100%)',
  },
  holo: {
    name: 'Holo', color1: '#8CF5FF', color2: '#6F2BFF', color3: '#FF9BE8', rare: true,
    foil: 'linear-gradient(115deg, #8cf5ff 0%, #ff9be8 22%, #ffe29a 42%, #9dffc8 60%, #8cf5ff 78%, #b48bff 100%)',
  },
};

const COMMON = ['orchid', 'lagoon', 'dusk', 'berry'];

export function randomPalette() {
  return PALETTES[COMMON[Math.floor(Math.random() * COMMON.length)]];
}

// FNV-1a: tiny, and identical in every browser, so a ticket never changes edition.
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The edition a ticket was minted as. About one ticket in twelve is Holo. */
export function editionFor(token) {
  if (!token) return { key: 'orchid', ...PALETTES.orchid };
  const h = hash(token);
  const key = h % 12 === 0 ? 'holo' : COMMON[(h >>> 8) % COMMON.length];
  return { key, ...PALETTES[key] };
}

export function ordinal(n) {
  const suffix = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffix[(v - 20) % 10] || suffix[v] || suffix[0]}`;
}

export const ticketNumber = (n) => (n ? `#${String(n).padStart(3, '0')}` : null);

/**
 * How a ticket holder's history with the club reads. `visits` counts the club's
 * other events they checked in to, so this event makes it visits + 1.
 */
export function loyaltyFor(visits, clubName) {
  if (visits == null) return null;
  const n = visits + 1;
  const club = clubName || 'this club';
  if (n === 1) return { level: 'first', label: `First event with ${club}` };
  if (n === 2) return { level: 'returning', label: `2nd event with ${club}`, tag: 'Welcome back' };
  if (n <= 4) return { level: 'regular', label: `${ordinal(n)} event with ${club}`, tag: 'Regular' };
  return { level: 'legend', label: `${ordinal(n)} event with ${club}`, tag: 'Legend' };
}

/** Where an event stands relative to now, with the time left split for display. */
export function countdown(startsAt, endsAt, now = Date.now()) {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt || startsAt).getTime();
  if (now >= end) return { phase: 'ended' };
  if (now >= start) return { phase: 'live' };
  let ms = start - now;
  const days = Math.floor(ms / 864e5);
  ms -= days * 864e5;
  const hours = Math.floor(ms / 36e5);
  ms -= hours * 36e5;
  const minutes = Math.floor(ms / 6e4);
  ms -= minutes * 6e4;
  return { phase: 'upcoming', days, hours, minutes, seconds: Math.floor(ms / 1e3) };
}

export const placeText = (event) => [event.location_name, event.location_address].filter(Boolean).join(', ');

export const mapsUrl = (event) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeText(event))}`;
