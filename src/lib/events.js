// Shared event form state, validation and payload building.
//
// Creating and editing an event must stay in step -- if the two forms drift, an
// event can be created with fields the edit screen cannot reach, or vice versa.

import { api } from '@/lib/api';
import { fromLocalInputValue, randomToken, slugify, toLocalInputValue } from '@/lib/format';
import { formatPhone, phoneProblem } from '@/lib/phone';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Hours between two times, to the nearest half hour, within reason. */
function lengthHours(startsAt, endsAt) {
  const h = (new Date(endsAt) - new Date(startsAt)) / 36e5;
  return Number.isFinite(h) && h > 0 ? Math.min(12, Math.max(0.5, Math.round(h * 2) / 2)) : 2;
}

/**
 * A blank form with sensible guesses rather than empty boxes: tomorrow, at the
 * time and for the length the club's last event ran, with the person creating
 * it as the contact. `pastEvents` is newest first.
 */
export function emptyEventForm({ user, pastEvents = [] } = {}) {
  const last = pastEvents[0];
  const start = new Date();
  start.setDate(start.getDate() + 1);
  if (last) {
    const s = new Date(last.starts_at);
    start.setHours(s.getHours(), s.getMinutes(), 0, 0);
  } else {
    start.setHours(18, 0, 0, 0);
  }
  const startsLocal = toLocalInputValue(start.toISOString());
  const lastGrant = pastEvents.find((e) => e.is_grant_funded);
  return {
    title: '',
    description: '',
    startsLocal,
    endsLocal: plusHours(startsLocal, last ? lengthHours(last.starts_at, last.ends_at) : 2),
    locationName: '',
    locationAddress: '',
    coverUrl: '',
    capacity: '',
    rsvpRequired: true,
    isGrantFunded: false,
    grantCategory: lastGrant?.grant_category || 'Functions',
    grantAmount: '',
    collectDietary: !!last?.collect_dietary,
    collectAccessibility: !!last?.collect_accessibility,
    ...contactFor(user),
  };
}

/** The signed-in person as an event contact. */
export function contactFor(user) {
  return {
    contactName: user?.full_name || '',
    contactEmail: user?.email || '',
    contactPhone: user?.phone || '',
  };
}

/** Turns a stored event back into form state. */
export function eventToForm(ev) {
  return {
    title: ev.title || '',
    description: ev.description || '',
    startsLocal: toLocalInputValue(ev.starts_at),
    endsLocal: toLocalInputValue(ev.ends_at),
    locationName: ev.location_name || '',
    locationAddress: ev.location_address || '',
    coverUrl: ev.cover_image_url || '',
    capacity: ev.capacity ? String(ev.capacity) : '',
    rsvpRequired: ev.rsvp_required !== false,
    isGrantFunded: !!ev.is_grant_funded,
    grantCategory: ev.grant_category || 'Functions',
    grantAmount: ev.grant_amount_cents ? String(ev.grant_amount_cents / 100) : '',
    collectDietary: !!ev.collect_dietary,
    collectAccessibility: !!ev.collect_accessibility,
    contactName: ev.contact_name || '',
    contactEmail: ev.contact_email || '',
    contactPhone: ev.contact_phone || '',
  };
}

/**
 * Starts a new event from an old one: the same details, time of day and length,
 * on the date already chosen. The grant amount and contact are not carried
 * over, since a new event is a new grant and whoever is creating it is the
 * person to ask.
 */
export function formFromPastEvent(ev, current) {
  const past = eventToForm(ev);
  const startsLocal = `${current.startsLocal.slice(0, 10)}T${past.startsLocal.slice(11, 16)}`;
  return {
    ...past,
    startsLocal,
    endsLocal: plusHours(startsLocal, lengthHours(ev.starts_at, ev.ends_at)),
    grantAmount: '',
    contactName: current.contactName,
    contactEmail: current.contactEmail,
    contactPhone: current.contactPhone,
  };
}

export function plusHours(localStr, h) {
  const d = new Date(localStr);
  d.setMinutes(d.getMinutes() + Math.round(h * 60));
  return toLocalInputValue(d.toISOString());
}

/** Places the club has used before, newest first, one per name. */
export function pastVenues(events) {
  const byName = new Map();
  for (const e of events) {
    const name = (e.location_name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const address = (e.location_address || '').trim();
    if (!byName.has(key)) byName.set(key, { name, address });
    else if (!byName.get(key).address && address) byName.get(key).address = address;
  }
  return [...byName.values()];
}

/**
 * Returns a problem to show the user, or null.
 *
 * `requireFuture` is only applied when publishing something new: an event
 * already under way should still be editable, and refusing to fix a typo in a
 * venue because the start time has passed would be perverse.
 */
export function validateEventForm(form, { requireFuture = false } = {}) {
  if (!form.title.trim()) return 'Give the event a title.';
  if (form.title.length > 120) return 'Title must be 120 characters or fewer.';
  if (form.description.length > 5000) return 'Description must be 5000 characters or fewer.';
  if (!form.startsLocal || !form.endsLocal) return 'Start and end times are required.';
  if (new Date(form.endsLocal) < new Date(form.startsLocal)) return 'End time must be after start time.';
  if (requireFuture && new Date(form.startsLocal) < new Date()) {
    return 'Start time must be in the future to publish.';
  }
  if (!form.locationName.trim()) return 'Add a venue.';
  if (form.capacity && Number(form.capacity) < 1) return 'Capacity must be at least 1.';

  const email = form.contactEmail.trim();
  if (email && !EMAIL_RE.test(email)) return 'Enter a valid contact email.';
  const phone = phoneProblem(form.contactPhone);
  if (phone) return `Contact phone: ${phone}`;

  if (form.isGrantFunded) {
    if (!form.grantCategory) return 'Choose a grant category.';
    if (!form.grantAmount || Number(form.grantAmount) <= 0) return 'Enter the approved grant amount.';
    if (!form.contactName.trim() || !email || !form.contactPhone.trim()) {
      return 'Grant-funded events need a contact name, email and phone, so UMSU can reach someone.';
    }
  }
  return null;
}

/** Fields common to create and update. Nulls, not undefined, so clearing works. */
export function eventFields(form) {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    starts_at: fromLocalInputValue(form.startsLocal),
    ends_at: fromLocalInputValue(form.endsLocal),
    location_name: form.locationName.trim(),
    location_address: form.locationAddress.trim() || null,
    cover_image_url: form.coverUrl || null,
    capacity: form.capacity ? Number(form.capacity) : null,
    rsvp_required: form.rsvpRequired,
    is_grant_funded: form.isGrantFunded,
    grant_category: form.isGrantFunded ? form.grantCategory : null,
    grant_amount_cents: form.isGrantFunded ? Math.round(Number(form.grantAmount) * 100) : null,
    collect_dietary: form.collectDietary,
    collect_accessibility: form.collectAccessibility,
    contact_name: form.contactName.trim() || null,
    contact_email: form.contactEmail.trim() || null,
    contact_phone: form.contactPhone.trim() ? formatPhone(form.contactPhone) : null,
  };
}

export function buildCreatePayload(form, club, publish) {
  const payload = {
    ...eventFields(form),
    club_id: club.id,
    club_slug: club.slug,
    club_name: club.name,
    status: publish ? 'published' : 'draft',
  };
  if (publish) {
    payload.published_at = new Date().toISOString();
    payload.public_slug = `${slugify(form.title)}-${randomToken(6)}`;
    payload.qr_token = randomToken(32);
  }
  return payload;
}

/**
 * When you are the contact and gave a new phone number, keep it on your profile
 * so the next form fills it in. Best effort: the event is already saved.
 */
export async function rememberContactPhone(form, user) {
  const phone = form.contactPhone.trim() ? formatPhone(form.contactPhone) : '';
  if (!user?.email || !phone || phone === (user.phone || '')) return false;
  if (form.contactEmail.trim().toLowerCase() !== user.email.toLowerCase()) return false;
  try {
    await api.call('auth/profile', { phone });
    return true;
  } catch {
    return false;
  }
}
