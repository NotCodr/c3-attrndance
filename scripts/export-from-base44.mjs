#!/usr/bin/env node
/**
 * One-time export of live Base44 data into SQL for the Supabase database.
 *
 * Writes a file to paste into the Supabase SQL editor rather than writing to the
 * database directly: the output is reviewable before anything lands, and this
 * script never needs a Supabase service key.
 *
 *   BASE44_APP_ID=... BASE44_API_KEY=... node scripts/export-from-base44.mjs
 *
 * Ids are preserved, so every foreign key survives the move.
 *
 * Older Base44 rows were written before a schema rename and still carry
 * university_slug / university_name / user_name where the schema says
 * university / full_name. Both spellings are coalesced here so nothing is lost.
 */

import fs from 'node:fs';

const APP_ID = process.env.BASE44_APP_ID;
const API_KEY = process.env.BASE44_API_KEY;
const BASE = process.env.BASE44_BASE_URL || 'https://connect3.base44.app';
const OUT = process.env.OUT || 'supabase/seed-from-base44.sql';

if (!APP_ID || !API_KEY) {
  console.error('Set BASE44_APP_ID and BASE44_API_KEY.');
  process.exit(1);
}

// [entity, table, { column: [source fields, first non-null wins] }]
// Parent tables first so foreign keys resolve on insert.
const MAP = [
  ['Club', 'clubs', {
    id: ['id'], name: ['name'], slug: ['slug'],
    university: ['university', 'university_slug'],
    university_name: ['university_name'], union_name: ['union_name'],
    umsu_affiliation_code: ['umsu_affiliation_code'], logo_url: ['logo_url'],
    description: ['description'], website_url: ['website_url'],
    instagram_handle: ['instagram_handle'],
    primary_contact_email: ['primary_contact_email'], treasurer_email: ['treasurer_email'],
    deleted_at: ['deleted_at'], created_by: ['created_by'], created_date: ['created_date'],
  }],
  ['Event', 'events', {
    id: ['id'], club_id: ['club_id'], club_slug: ['club_slug'], club_name: ['club_name'],
    title: ['title'], description: ['description'], starts_at: ['starts_at'], ends_at: ['ends_at'],
    location_name: ['location_name'], location_address: ['location_address'],
    cover_image_url: ['cover_image_url'], capacity: ['capacity'], rsvp_required: ['rsvp_required'],
    is_grant_funded: ['is_grant_funded'], grant_category: ['grant_category'],
    grant_amount_cents: ['grant_amount_cents'], status: ['status'], published_at: ['published_at'],
    cancelled_at: ['cancelled_at'], cancellation_reason: ['cancellation_reason'],
    public_slug: ['public_slug'], qr_token: ['qr_token'],
    collect_dietary: ['collect_dietary', 'ask_dietary'],
    collect_accessibility: ['collect_accessibility', 'ask_accessibility'],
    created_by: ['created_by'], created_date: ['created_date'],
  }],
  ['ClubMembership', 'club_memberships', {
    id: ['id'], club_id: ['club_id'], club_slug: ['club_slug'], user_email: ['user_email'],
    full_name: ['full_name', 'user_name'], role: ['role'],
    invited_by_email: ['invited_by_email'], accepted_at: ['accepted_at'],
    created_by: ['created_by'], created_date: ['created_date'],
  }],
  ['RSVP', 'rsvps', {
    id: ['id'], event_id: ['event_id'], club_id: ['club_id'], full_name: ['full_name'],
    email: ['email'], student_number: ['student_number'], course: ['course'],
    university: ['university', 'university_name'], is_member: ['is_member'], status: ['status'],
    dietary_requirements: ['dietary_requirements'],
    accessibility_requirements: ['accessibility_requirements'],
    rsvp_token: ['rsvp_token'], created_date: ['created_date'],
  }],
  ['CheckIn', 'check_ins', {
    id: ['id'], event_id: ['event_id'], club_id: ['club_id'], rsvp_id: ['rsvp_id'],
    full_name: ['full_name'], email: ['email'], student_number: ['student_number'],
    course: ['course'], university: ['university', 'university_name'],
    checked_in_at: ['checked_in_at'], checked_in_by_email: ['checked_in_by_email'],
    method: ['method'], created_date: ['created_date'],
  }],
  ['EventPhoto', 'event_photos', {
    id: ['id'], event_id: ['event_id'], club_id: ['club_id'], file_url: ['file_url'],
    caption: ['caption'], display_order: ['display_order'],
    created_by: ['created_by'], created_date: ['created_date'],
  }],
  ['EventReceipt', 'event_receipts', {
    id: ['id'], event_id: ['event_id'], club_id: ['club_id'], file_url: ['file_url'],
    description: ['description'], amount_cents: ['amount_cents'], vendor_name: ['vendor_name'],
    purchase_date: ['purchase_date'], created_by: ['created_by'], created_date: ['created_date'],
  }],
  ['AcquittalPack', 'acquittal_packs', {
    id: ['id'], event_id: ['event_id'], club_id: ['club_id'], pdf_url: ['pdf_url'],
    total_receipts_cents: ['total_receipts_cents'], attendee_count: ['attendee_count'],
    generated_by_email: ['generated_by_email'], version: ['version'],
    submitted_to_union: ['submitted_to_union'], submitted_at: ['submitted_at'],
    created_date: ['created_date'],
  }],
  ['AuditLog', 'audit_logs', {
    id: ['id'], actor_email: ['actor_email'], club_id: ['club_id'], event_id: ['event_id'],
    action: ['action'], metadata: ['metadata'], created_date: ['created_date'],
  }],
];

/** Renders a JS value as a SQL literal. */
function lit(v) {
  if (v === null || v === undefined || v === '') return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return quote(JSON.stringify(v)) + '::jsonb';
  return quote(String(v));
}

function quote(s) {
  return "'" + s.split("'").join("''") + "'";
}

/** First non-null of the candidate source fields. */
function pick(row, sources) {
  for (const s of sources) {
    if (row[s] !== undefined && row[s] !== null) return row[s];
  }
  return null;
}

async function fetchAll(entity) {
  const url = BASE + '/api/apps/' + APP_ID + '/entities/' + entity + '?limit=5000';
  const res = await fetch(url, { headers: { api_key: API_KEY } });
  if (!res.ok) throw new Error(entity + ': HTTP ' + res.status + ' ' + (await res.text()));
  return res.json();
}

const out = [
  '-- connect3 data exported from Base44.',
  '-- Generated ' + new Date().toISOString(),
  '--',
  '-- Run AFTER the migrations in supabase/migrations. Re-running is safe: every',
  '-- row is ON CONFLICT DO NOTHING, keyed on the original id.',
  '',
  'begin;',
  '',
];

let total = 0;
for (const [entity, table, columns] of MAP) {
  const rows = await fetchAll(entity);
  console.error('  ' + entity.padEnd(16) + String(rows.length).padStart(4) + ' row(s)');
  if (!rows.length) continue;
  total += rows.length;

  const cols = Object.keys(columns);
  out.push('-- ' + entity + ' -> ' + table + ' (' + rows.length + ')');
  out.push('insert into ' + table + ' (' + cols.join(', ') + ') values');
  out.push(rows.map((r) => '  (' + cols.map((c) => lit(pick(r, columns[c]))).join(', ') + ')').join(',\n'));
  out.push('on conflict (id) do nothing;');
  out.push('');
}

out.push('commit;');
out.push('');

fs.writeFileSync(OUT, out.join('\n'));
console.error('\nWrote ' + OUT + ' (' + total + ' rows).');
console.error('Review it, then paste into the Supabase SQL editor.');
