-- Strivon Athletics — Phase 1 + Phase 2 schema
-- Paste this whole file into Supabase's SQL Editor and run it once.
--
-- Design notes (read this before running):
--
-- 1. advisors.availability_token is NEVER exposed to the public client.
--    Public pages query the `advisors_public` VIEW (no token column)
--    instead of the `advisors` table directly. This fixes the Phase 1
--    localStorage version's known leak, where the token traveled
--    through the same public CSV every visitor's browser fetched.
--
-- 2. advisor_availability and bookings have NO public read/write
--    grants at all. Every interaction goes through a SECURITY DEFINER
--    function below (get_advisor_by_token, save_advisor_availability,
--    get_open_slots, create_booking_hold) that validates the caller
--    before touching the data. This is what makes booking holds and
--    double-booking prevention actually safe — a client can never
--    write directly to bookings, only through create_booking_hold,
--    which is protected by a database-level uniqueness constraint.
--
-- 3. Double-booking prevention is a partial UNIQUE INDEX (see below),
--    not application logic. Postgres enforces this atomically even
--    under concurrent requests — two athletes hitting "book" on the
--    same slot at the same instant can't both succeed, no matter what
--    the client-side code does.

create extension if not exists pgcrypto;

-- ---------- Tables ----------

create table advisors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  school text,
  sport text,
  major text,
  bio text,
  photo_url text,
  expertise_tags text[] default '{}',
  availability_token text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table advisor_availability (
  id uuid primary key default gen_random_uuid(),
  advisor_id uuid not null references advisors(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=Sunday .. 6=Saturday
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  advisor_id uuid not null references advisors(id),
  athlete_name text not null,
  athlete_email text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'expired')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
  stripe_session_id text,
  hold_expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now()
);

-- The actual double-booking guard: only one non-cancelled/expired
-- booking can occupy a given advisor+start_time at once. A held
-- (pending) slot blocks other holds until it expires; a confirmed
-- slot blocks permanently.
create unique index bookings_no_overlap
  on bookings (advisor_id, start_time)
  where status in ('pending', 'confirmed');

-- ---------- Public view (no availability_token column) ----------

create view advisors_public as
  select id, name, slug, school, sport, major, bio, photo_url, expertise_tags, active
  from advisors
  where active = true;

-- ---------- Row Level Security ----------

alter table advisors enable row level security;
alter table advisor_availability enable row level security;
alter table bookings enable row level security;

-- No policies on advisors/advisor_availability/bookings for anon at
-- all — that's intentional. Everything goes through the view above or
-- the functions below.

grant select on advisors_public to anon, authenticated;

-- ---------- Functions ----------

-- Looks up an advisor by their private token. Used only by
-- advisor-availability.html. Never returns more than one row, never
-- lets a caller enumerate advisors or tokens.
create or replace function get_advisor_by_token(p_token text)
returns table (id uuid, name text, slug text)
language sql
security definer
set search_path = public
as $$
  select id, name, slug from advisors where availability_token = p_token and active = true;
$$;

-- Replaces an advisor's saved availability wholesale. p_blocks is a
-- JSON array like [{"day":2,"start":"17:00","end":"20:00"}, ...].
-- Validates the token server-side before writing anything.
create or replace function save_advisor_availability(p_token text, p_blocks jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_advisor_id uuid;
begin
  select id into v_advisor_id from advisors where availability_token = p_token and active = true;

  if v_advisor_id is null then
    raise exception 'Invalid availability token';
  end if;

  delete from advisor_availability where advisor_id = v_advisor_id;

  insert into advisor_availability (advisor_id, day_of_week, start_time, end_time)
  select v_advisor_id, (b->>'day')::smallint, (b->>'start')::time, (b->>'end')::time
  from jsonb_array_elements(p_blocks) as b;
end;
$$;

-- Returns open 30-minute slot start times for an advisor between two
-- dates. Combines saved availability with existing bookings (only
-- confirmed, or pending holds that haven't expired) so it never shows
-- a time that's actually taken. Never exposes raw availability blocks
-- or other athletes' booking details — only the resulting free times.
create or replace function get_open_slots(p_slug text, p_from date, p_to date, p_slot_minutes int default 30)
returns table (slot_start timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_advisor_id uuid;
  v_day date;
  v_dow smallint;
  v_block record;
  v_t time;
begin
  select id into v_advisor_id from advisors where slug = p_slug and active = true;
  if v_advisor_id is null then
    return;
  end if;

  v_day := p_from;
  while v_day <= p_to loop
    v_dow := extract(dow from v_day);

    for v_block in
      select start_time, end_time from advisor_availability
      where advisor_id = v_advisor_id and day_of_week = v_dow
    loop
      v_t := v_block.start_time;
      while v_t + make_interval(mins => p_slot_minutes) <= v_block.end_time loop
        slot_start := (v_day + v_t) at time zone 'utc';
        if not exists (
          select 1 from bookings b
          where b.advisor_id = v_advisor_id
            and b.start_time = slot_start
            and (b.status = 'confirmed' or (b.status = 'pending' and b.hold_expires_at > now()))
        ) then
          return next;
        end if;
        v_t := v_t + make_interval(mins => p_slot_minutes);
      end loop;
    end loop;

    v_day := v_day + 1;
  end loop;
end;
$$;

-- Atomically holds a slot for 10 minutes. Relies on the
-- bookings_no_overlap unique index to make this race-proof — if two
-- athletes call this for the same slot_start at the same time, only
-- one INSERT succeeds; the other raises unique_violation, which we
-- catch and turn into a clean "not available" result instead of an
-- ugly SQL error.
create or replace function create_booking_hold(
  p_slug text,
  p_slot_start timestamptz,
  p_athlete_name text,
  p_athlete_email text,
  p_slot_minutes int default 30
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_advisor_id uuid;
  v_booking_id uuid;
begin
  select id into v_advisor_id from advisors where slug = p_slug and active = true;
  if v_advisor_id is null then
    raise exception 'Advisor not found';
  end if;

  insert into bookings (advisor_id, athlete_name, athlete_email, start_time, end_time)
  values (
    v_advisor_id,
    p_athlete_name,
    p_athlete_email,
    p_slot_start,
    p_slot_start + make_interval(mins => p_slot_minutes)
  )
  returning id into v_booking_id;

  return v_booking_id;
exception
  when unique_violation then
    raise exception 'That slot was just taken — pick another time.';
end;
$$;

grant execute on function get_advisor_by_token(text) to anon, authenticated;
grant execute on function save_advisor_availability(text, jsonb) to anon, authenticated;
grant execute on function get_open_slots(text, date, date, int) to anon, authenticated;
grant execute on function create_booking_hold(text, timestamptz, text, text, int) to anon, authenticated;

-- ---------- Seed data (your two current advisors) ----------

insert into advisors (name, slug, school, sport, major, bio, expertise_tags, availability_token) values
(
  'Ryan Liu',
  'ryan-liu',
  'Harvey Mudd College',
  'Soccer',
  'Engineering',
  'Recruited to play soccer at Harvey Mudd — one of the most academically selective schools with a genuinely competitive D3 program. Learned firsthand that generic, copy-paste emails don''t get read, and now helps recruits write outreach that actually feels tailored to each school.',
  array['Soccer', 'Engineering', 'Selective D3'],
  'rl-8f2k9q1z'
),
(
  'Jason Wu',
  'jason-wu',
  'Claremont McKenna College',
  'Track and Field',
  'Economics',
  'Recruited for track and field at Claremont McKenna, a highly academic liberal arts college. Learned firsthand not to rule out reach schools before even reaching out, and now helps recruits build the confidence to contact programs they might otherwise talk themselves out of.',
  array['Track and Field', 'Economics', 'Selective D3'],
  'jw-4m7p2x9k'
);

-- Added after initial setup: reads back an advisor's saved availability
-- blocks (token-gated) so advisor-availability.html can pre-fill the
-- form when reopened, instead of always starting blank.
create or replace function get_advisor_availability(p_token text)
returns table (day_of_week smallint, start_time time, end_time time)
language sql
security definer
set search_path = public
as $$
  select aa.day_of_week, aa.start_time, aa.end_time
  from advisor_availability aa
  join advisors a on a.id = aa.advisor_id
  where a.availability_token = p_token
  order by aa.day_of_week, aa.start_time;
$$;

grant execute on function get_advisor_availability(text) to anon, authenticated;

-- Added for the unified intake -> matching -> scheduling flow: lets the
-- client release a pending hold when the athlete switches advisors
-- (Part 4 of that flow) without ever touching bookings directly.
create or replace function cancel_booking_hold(p_booking_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update bookings set status = 'cancelled' where id = p_booking_id and status = 'pending';
$$;

grant execute on function cancel_booking_hold(uuid) to anon, authenticated;

-- Fix: create_booking_hold's uniqueness check only looks at status, not
-- expiration, so a hold that's past its 10-minute window stays 'pending'
-- forever and permanently blocks that exact slot -- even though
-- get_open_slots correctly stops listing it as unavailable, creating a
-- confusing mismatch (slot looks open, but holding it always fails).
-- This makes the function self-healing: it flips any stale expired
-- pending hold on the target slot to 'expired' before inserting.
create or replace function create_booking_hold(
  p_slug text,
  p_slot_start timestamptz,
  p_athlete_name text,
  p_athlete_email text,
  p_slot_minutes int default 30
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_advisor_id uuid;
  v_booking_id uuid;
begin
  select id into v_advisor_id from advisors where slug = p_slug and active = true;
  if v_advisor_id is null then
    raise exception 'Advisor not found';
  end if;

  update bookings
  set status = 'expired'
  where advisor_id = v_advisor_id
    and start_time = p_slot_start
    and status = 'pending'
    and hold_expires_at <= now();

  insert into bookings (advisor_id, athlete_name, athlete_email, start_time, end_time)
  values (
    v_advisor_id,
    p_athlete_name,
    p_athlete_email,
    p_slot_start,
    p_slot_start + make_interval(mins => p_slot_minutes)
  )
  returning id into v_booking_id;

  return v_booking_id;
exception
  when unique_violation then
    raise exception 'That slot was just taken — pick another time.';
end;
$$;

grant execute on function create_booking_hold(text, timestamptz, text, text, int) to anon, authenticated;
