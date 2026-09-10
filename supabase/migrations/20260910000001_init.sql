-- connect3 schema.
--
-- Ported from the Base44 entity definitions. Column names match what the React
-- frontend already reads (including created_date / updated_date) so the client
-- did not have to change shape during the migration.
--
-- Ids are text, not uuid, so records exported from Base44 keep their original
-- ids and every foreign key survives the import. New rows get a uuid.

create or replace function set_updated_date()
returns trigger language plpgsql as $fn$
begin
  new.updated_date = now();
  return new;
end $fn$;

-- gen_random_uuid() is core Postgres since v13; no pgcrypto extension needed.
create domain c3_id as text default gen_random_uuid()::text;

-- ---------------------------------------------------------------- identity --

-- connect3 owns its identity; Supabase Auth is deliberately unused. These rows
-- are the only source of truth for who someone is.
create table app_users (
  id                      c3_id primary key,
  email                   text not null,
  full_name               text,
  password_hash           text not null,
  email_verified          boolean not null default false,
  verification_code_hash  text,
  verification_expires_at timestamptz,
  verification_attempts   integer not null default 0,
  reset_token_hash        text,
  reset_expires_at        timestamptz,
  failed_login_attempts   integer not null default 0,
  locked_until            timestamptz,
  last_login_at           timestamptz,
  status                  text not null default 'active' check (status in ('active','disabled')),
  created_date            timestamptz not null default now(),
  updated_date            timestamptz not null default now()
);
create unique index app_users_email_key on app_users (lower(email));
create index app_users_reset_token_idx on app_users (reset_token_hash) where reset_token_hash is not null;

create table app_sessions (
  id           c3_id primary key,
  user_id      text not null references app_users(id) on delete cascade,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  user_agent   text,
  last_seen_at timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index app_sessions_user_idx on app_sessions (user_id);

-- ------------------------------------------------------------------- clubs --

create table clubs (
  id                    c3_id primary key,
  name                  text not null,
  slug                  text not null,
  university            text default 'unimelb',
  university_name       text default 'University of Melbourne',
  union_name            text default 'UMSU',
  grant_categories      text[] default array['Functions','Camps','Excursions','General'],
  umsu_affiliation_code text,
  logo_url              text,
  description           text,
  website_url           text,
  instagram_handle      text,
  primary_contact_email text not null,
  treasurer_email       text,
  deleted_at            timestamptz,
  created_by            text,
  created_date          timestamptz not null default now(),
  updated_date          timestamptz not null default now()
);
-- Slug uniqueness used to be a read-then-write check in the browser, which two
-- people could pass simultaneously.
create unique index clubs_slug_key on clubs (lower(slug)) where deleted_at is null;

create table club_memberships (
  id               c3_id primary key,
  club_id          text not null references clubs(id) on delete cascade,
  club_slug        text,
  user_email       text not null,
  full_name        text,
  role             text not null check (role in ('owner','admin','treasurer','scanner')),
  invited_by_email text,
  accepted_at      timestamptz,
  created_by       text,
  created_date     timestamptz not null default now(),
  updated_date     timestamptz not null default now()
);
create unique index club_memberships_unique on club_memberships (club_id, lower(user_email));
create index club_memberships_email_idx on club_memberships (lower(user_email));

-- ------------------------------------------------------------------ events --

create table events (
  id                    c3_id primary key,
  club_id               text not null references clubs(id) on delete cascade,
  club_slug             text,
  club_name             text,
  title                 text not null,
  description           text,
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  location_name         text not null,
  location_address      text,
  cover_image_url       text,
  capacity              integer check (capacity is null or capacity > 0),
  rsvp_required         boolean not null default true,
  is_grant_funded       boolean not null default false,
  grant_category        text check (grant_category is null or grant_category in ('Functions','Camps','Excursions','General')),
  grant_amount_cents    integer,
  status                text not null default 'draft' check (status in ('draft','published','cancelled','completed')),
  published_at          timestamptz,
  cancelled_at          timestamptz,
  cancellation_reason   text,
  public_slug           text,
  qr_token              text,
  collect_dietary       boolean not null default false,
  collect_accessibility boolean not null default false,
  created_by            text,
  created_date          timestamptz not null default now(),
  updated_date          timestamptz not null default now(),
  constraint events_ends_after_starts check (ends_at >= starts_at)
);
create index events_club_idx on events (club_id, starts_at desc);
create index events_published_idx on events (status) where status = 'published';

-- -------------------------------------------------------------- attendance --

create table rsvps (
  id                         c3_id primary key,
  event_id                   text not null references events(id) on delete cascade,
  club_id                    text references clubs(id) on delete cascade,
  full_name                  text not null,
  email                      text not null,
  student_number             text,
  course                     text,
  university                 text,
  is_member                  boolean not null default false,
  status                     text not null default 'confirmed' check (status in ('confirmed','waitlisted','cancelled')),
  dietary_requirements       text,
  accessibility_requirements text,
  rsvp_token                 text,
  created_date               timestamptz not null default now(),
  updated_date               timestamptz not null default now()
);
-- One RSVP per person per event, enforced by the database instead of by a
-- read-then-write inside the request handler.
create unique index rsvps_event_email_key on rsvps (event_id, lower(email));
create unique index rsvps_token_key on rsvps (rsvp_token) where rsvp_token is not null;
create index rsvps_event_status_idx on rsvps (event_id, status);
create index rsvps_club_idx on rsvps (club_id);

create table check_ins (
  id                  c3_id primary key,
  event_id            text not null references events(id) on delete cascade,
  club_id             text references clubs(id) on delete cascade,
  rsvp_id             text references rsvps(id) on delete set null,
  full_name           text not null,
  email               text,
  student_number      text,
  course              text,
  university          text,
  checked_in_at       timestamptz not null default now(),
  checked_in_by_email text,
  method              text not null check (method in ('qr_scan','manual_lookup','walk_in_add')),
  created_date        timestamptz not null default now(),
  updated_date        timestamptz not null default now()
);
-- Two scanners on two phones can hit the same attendee at once. Attendance
-- counts feed the grant acquittal, so a double scan is a compliance problem,
-- not a cosmetic one.
create unique index check_ins_once_per_rsvp on check_ins (event_id, rsvp_id) where rsvp_id is not null;
create index check_ins_event_idx on check_ins (event_id, checked_in_at);
create index check_ins_club_idx on check_ins (club_id);

-- -------------------------------------------------------------- acquittals --

create table event_photos (
  id            c3_id primary key,
  event_id      text not null references events(id) on delete cascade,
  club_id       text references clubs(id) on delete cascade,
  file_url      text not null,
  caption       text,
  display_order integer default 0,
  created_by    text,
  created_date  timestamptz not null default now(),
  updated_date  timestamptz not null default now()
);
create index event_photos_event_idx on event_photos (event_id, display_order);

create table event_receipts (
  id            c3_id primary key,
  event_id      text not null references events(id) on delete cascade,
  club_id       text references clubs(id) on delete cascade,
  file_url      text not null,
  description   text not null,
  amount_cents  integer not null check (amount_cents >= 0),
  vendor_name   text,
  purchase_date date not null,
  created_by    text,
  created_date  timestamptz not null default now(),
  updated_date  timestamptz not null default now()
);
create index event_receipts_event_idx on event_receipts (event_id);

create table acquittal_packs (
  id                   c3_id primary key,
  event_id             text not null references events(id) on delete cascade,
  club_id              text references clubs(id) on delete cascade,
  pdf_url              text not null,
  total_receipts_cents integer,
  attendee_count       integer,
  generated_by_email   text,
  version              integer not null default 1,
  submitted_to_union   boolean not null default false,
  submitted_at         timestamptz,
  created_date         timestamptz not null default now(),
  updated_date         timestamptz not null default now()
);
create unique index acquittal_packs_version_key on acquittal_packs (event_id, version);
create index acquittal_packs_club_idx on acquittal_packs (club_id, created_date desc);

create table audit_logs (
  id           c3_id primary key,
  actor_email  text,
  club_id      text references clubs(id) on delete cascade,
  event_id     text references events(id) on delete cascade,
  action       text not null,
  metadata     jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index audit_logs_club_idx on audit_logs (club_id, created_date desc);

-- ---------------------------------------------------- triggers and lockdown --

do $mig$
declare
  t text;
  tables text[] := array[
    'app_users','app_sessions','clubs','club_memberships','events','rsvps',
    'check_ins','event_photos','event_receipts','acquittal_packs','audit_logs'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create trigger %I_set_updated before update on %I for each row execute function set_updated_date()',
      t, t);

    -- Closed to the anon and authenticated roles. The API connects with the
    -- service role key, which bypasses RLS, and authorisation is decided in
    -- _shared/policy.ts before any query runs.
    --
    -- Enabling RLS with no permissive policy denies by default, so there is
    -- deliberately no `create policy` here. Nothing outside the API can read a
    -- row. This is what closes the exposure the Base44 version shipped with.
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $mig$;
