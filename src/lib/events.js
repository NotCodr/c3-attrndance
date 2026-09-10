// Shared event form state, validation and payload building.
//
// Creating and editing an event must stay in step -- if the two forms drift, an
// event can be created with fields the edit screen cannot reach, or vice versa.

import { fromLocalInputValue, randomToken, slugify, toLocalInputValue } from '@/lib/format';

export function emptyEventForm() {
  const start = new Date();
  start.setHours(start.getHours() + 24, 0, 0, 0);
  const startsLocal = toLocalInputValue(start.toISOString());
  return {
    title: '',
    description: '',
    startsLocal,
    endsLocal: plusHours(startsLocal, 2),
    locationName: '',
    locationAddress: '',
    coverUrl: '',
    capacity: '',
    rsvpRequired: true,
    isGrantFunded: false,
    grantCategory: 'Functions',
    grantAmount: '',
    collectDietary: false,
    collectAccessibility: false,
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
  };
}

export function plusHours(localStr, h) {
  const d = new Date(localStr);
  d.setHours(d.getHours() + h);
  return toLocalInputValue(d.toISOString());
}

/**
 * Returns a problem to show the user, or null.
 *
 * `requireFuture` is only applied when publishing something new: an event
 * already under way should still be editable, and refusing to fix a typo in a
 * venue because the start time has passed would be perverse.
 */
export function validateEventForm(form, { requireFuture = false } = {}) {
  if (!form.title.trim()) return 'Title is required.';
  if (form.title.length > 120) return 'Title must be 120 characters or fewer.';
  if (form.description.length > 5000) return 'Description must be 5000 characters or fewer.';
  if (!form.locationName.trim()) return 'Location is required.';
  if (!form.startsLocal || !form.endsLocal) return 'Start and end times are required.';
  if (new Date(form.endsLocal) < new Date(form.startsLocal)) return 'End time must be after start time.';
  if (requireFuture && new Date(form.startsLocal) < new Date()) {
    return 'Start time must be in the future to publish.';
  }
  if (form.capacity && Number(form.capacity) < 1) return 'Capacity must be at least 1.';
  if (form.isGrantFunded) {
    if (!form.grantCategory) return 'Grant category is required.';
    if (!form.grantAmount || Number(form.grantAmount) <= 0) return 'Grant amount must be greater than zero.';
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
