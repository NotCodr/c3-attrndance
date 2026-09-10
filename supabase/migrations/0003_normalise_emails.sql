-- Guarantee that every stored email is lowercase.
--
-- The API compares emails with equality, which is only correct if case is
-- normalised on the way in. Enforcing it here means no caller has to remember.
--
-- The alternative this replaces -- case-insensitive matching with ILIKE -- was
-- unsafe: ILIKE treats its argument as a *pattern*, so an address containing
-- "_" (matches any single character) or "%" (matches anything) would also match
-- other people's rows. A membership lookup for a_b@uni.edu returned the row for
-- axb@uni.edu too, handing over that club's role.
--
-- Two functions rather than one, because PL/pgSQL resolves NEW.<field> when the
-- function is compiled: a single function referencing both columns fails on any
-- table that lacks one, guard or no guard.
--
-- Idempotent: safe whether or not it has run before.

create or replace function lower_email()
returns trigger language plpgsql as $fn$
begin
  if new.email is not null then
    new.email = lower(trim(new.email));
  end if;
  return new;
end $fn$;

create or replace function lower_user_email()
returns trigger language plpgsql as $fn$
begin
  if new.user_email is not null then
    new.user_email = lower(trim(new.user_email));
  end if;
  return new;
end $fn$;

do $mig$
declare t text;
begin
  foreach t in array array['app_users','rsvps','check_ins'] loop
    execute format('drop trigger if exists %I_lower_email on %I', t, t);
    execute format(
      'create trigger %I_lower_email before insert or update on %I
         for each row execute function lower_email()', t, t);
  end loop;

  drop trigger if exists club_memberships_lower_email on club_memberships;
  create trigger club_memberships_lower_email before insert or update on club_memberships
    for each row execute function lower_user_email();
end $mig$;

-- Normalise anything already stored, including rows imported from Base44.
update app_users        set email = lower(trim(email))           where email <> lower(trim(email));
update club_memberships set user_email = lower(trim(user_email)) where user_email <> lower(trim(user_email));
update rsvps            set email = lower(trim(email))           where email <> lower(trim(email));
update check_ins        set email = lower(trim(email))           where email is not null and email <> lower(trim(email));
