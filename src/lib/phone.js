// Phone numbers as committee members type them. The rules mirror cleanPhone()
// on the server, which has the final say.

/** Tidies an Australian number into its usual groups. Anything else is left as typed. */
export function formatPhone(value) {
  const raw = (value || '').trim().replace(/\s+/g, ' ');
  const digits = raw.replace(/\D/g, '');
  const intl = raw.startsWith('+');
  if (!intl && /^04\d{8}$/.test(digits)) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  if (intl && /^614\d{8}$/.test(digits)) return `+61 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  if (!intl && /^0[2378]\d{8}$/.test(digits)) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)} ${digits.slice(6)}`;
  return raw;
}

/** A problem to show under the field, or null. Blank is not a problem here. */
export function phoneProblem(value) {
  const t = (value || '').trim();
  if (!t) return null;
  if (t.length > 32 || !/^\+?[\d\s()-]+$/.test(t)) return 'Use digits and spaces, with an optional + at the start.';
  const n = t.replace(/\D/g, '').length;
  if (n < 8 || n > 15) return 'That looks too short or too long for a phone number.';
  return null;
}
