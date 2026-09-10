// Display helpers. All times in Australia/Melbourne.

export const MEL_TZ = 'Australia/Melbourne';

export function formatMoneyCents(cents) {
  if (cents == null) return '-';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100);
}

export function formatDate(iso, opts = {}) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', {
    timeZone: MEL_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...opts,
  });
}

export function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-AU', {
    timeZone: MEL_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDateTime(iso) {
  if (!iso) return '';
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

export function formatEventTimeRange(startsAt, endsAt) {
  if (!startsAt) return '';
  const sameDay = endsAt && new Date(startsAt).toDateString() === new Date(endsAt).toDateString();
  if (!endsAt) return `${formatDate(startsAt)} · ${formatTime(startsAt)}`;
  if (sameDay) return `${formatDate(startsAt)} · ${formatTime(startsAt)} – ${formatTime(endsAt)}`;
  return `${formatDateTime(startsAt)} – ${formatDateTime(endsAt)}`;
}

export function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(local) {
  if (!local) return null;
  return new Date(local).toISOString();
}

export function slugify(s) {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

// Cryptographically secure. These tokens are the check-in credential embedded in
// attendee QR codes, so a predictable PRNG (Math.random) would let them be forged.
export function randomToken(len = 32) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  // Rejection-sample for a uniform distribution: 256 % 36 !== 0, so accepting every
  // byte would bias the first four characters of the alphabet.
  const limit = 256 - (256 % chars.length);
  const out = [];
  const buf = new Uint8Array(len);
  while (out.length < len) {
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < len; i++) {
      if (buf[i] < limit) out.push(chars[buf[i] % chars.length]);
    }
  }
  return out.join('');
}