-- Who the union should contact about an event. Printed on the grant
-- acquittal; the event form fills it in from the creator's profile.
alter table events add column if not exists contact_name  text;
alter table events add column if not exists contact_email text;
alter table events add column if not exists contact_phone text;

-- Remembered so the next event form can fill it in.
alter table app_users add column if not exists phone text;

-- Bounded like the other free-text fields. Written to survive a second run.
do $$ begin
  alter table events add constraint events_contact_lengths check (
    char_length(contact_name) <= 120
    and char_length(contact_email) <= 254
    and char_length(contact_phone) <= 32
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table app_users add constraint app_users_phone_length check (char_length(phone) <= 32);
exception when duplicate_object then null; end $$;
