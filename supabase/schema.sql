-- CalAI Supabase schema — the single source of truth.
--
-- Run this whole file in Dashboard → SQL Editor → New query. It is idempotent
-- and additive: safe to re-run, safe over an older CalAI project, and it never
-- drops a column or rewrites a row. It already contains everything in
-- supabase/migrations/, so running this is enough on its own — the migration
-- files exist only as smaller, reviewable diffs of what each release added.
--
-- Sizing note: this schema stores text and numbers only — no photos. A logged
-- entry is a few hundred bytes, so a year of six-a-day logging is roughly two
-- thousand rows and well under a megabyte, against the free tier's 500 MB.
-- The free-tier constraint that actually matters is that a project pauses after
-- a week with no requests; daily use keeps it awake.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One profile row per auth user. `id` == auth user id.
create table if not exists public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  name                  text    not null default 'You',
  onboarded             boolean not null default false,
  units                 text    not null default 'metric',
  theme                 text    not null default 'light',
  notifications_enabled boolean not null default false,
  metrics               jsonb,          -- UserMetrics (sex, heightCm, goalType, ...)
  goals                 jsonb   not null default '{}'::jsonb,  -- { calories, macros }
  updated_at            timestamptz not null default now()
);

-- Logged foods. `id` is generated client-side (text) so entries keep a stable
-- id across local and remote.
create table if not exists public.food_entries (
  id           text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  date         text not null,           -- YYYY-MM-DD date key
  meal         text not null,
  name         text not null,
  calories     numeric not null default 0,
  macros       jsonb not null default '{}'::jsonb,
  quantity     numeric not null default 1,
  ai_estimated boolean not null default false,
  items        jsonb,                   -- EntryItem[]: per-component breakdown
  created_at   bigint not null          -- epoch millis (matches FoodEntry.createdAt)
);
create index if not exists food_entries_user_date_idx on public.food_entries (user_id, date);

-- One weight measurement per user per day (latest wins).
create table if not exists public.weight_entries (
  user_id   uuid not null references auth.users (id) on delete cascade,
  date      text not null,             -- YYYY-MM-DD date key
  weight_kg numeric not null,
  primary key (user_id, date)
);

-- ---------------------------------------------------------------------------
-- Incremental columns.
--
-- `create table if not exists` is a no-op on an existing project, so every
-- column added after the first release is also declared explicitly here. All of
-- these are nullable or defaulted, so adding them never rewrites existing rows
-- and never invalidates data written by an older build.
-- ---------------------------------------------------------------------------

alter table public.food_entries add column if not exists items      jsonb;
-- Epoch millis of the last edit. Drives last-write-wins during a merge; null on
-- rows written before sync existed, which the client treats as `created_at`.
alter table public.food_entries add column if not exists updated_at bigint;
-- Dietary fibre in grams. Null means "not known", which is distinct from zero.
alter table public.food_entries add column if not exists fiber      numeric;

alter table public.weight_entries add column if not exists updated_at bigint;

-- Millisecond mirror of the profile's `updated_at`, so profile conflicts resolve
-- on the same clock as everything else.
alter table public.profiles add column if not exists updated_at_ms bigint;

-- Photos are no longer synced — they stay on the device that took them, which
-- keeps the database tiny and the free tier comfortable. The column is left in
-- place (rather than dropped) so an older build's rows are not destroyed.
alter table public.food_entries add column if not exists photo_path text;

-- ---------------------------------------------------------------------------
-- AI usage counters — one row per user per UTC day.
--
-- The Anthropic key lives only as a Supabase secret behind the `claude` Edge
-- Function. Requiring a session already stops that function being an open
-- proxy; this stops a *signed-in* user (or a render loop, or a stolen session)
-- running up an unbounded bill.
-- ---------------------------------------------------------------------------

create table if not exists public.ai_usage (
  user_id uuid    not null references auth.users (id) on delete cascade,
  day     date    not null default (now() at time zone 'utc')::date,
  calls   integer not null default 0,
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- Row-level security: every user sees and edits only their own rows.
--
-- Two things do the work in each policy. `using` filters what a statement can
-- see — so a select, update or delete simply cannot reach another account's
-- rows. `with check` validates what a statement writes, which is what stops a
-- client setting `user_id` to somebody else on an insert or update: the row it
-- is trying to write would not satisfy the predicate, and the write is refused.
--
-- `to authenticated` is belt and braces. `auth.uid()` is already null for an
-- anonymous request, so `auth.uid() = user_id` is null and therefore not true —
-- but naming the role makes the intent explicit rather than emergent.
-- ---------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.food_entries   enable row level security;
alter table public.weight_entries enable row level security;
alter table public.ai_usage       enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own food" on public.food_entries;
create policy "own food" on public.food_entries
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own weight" on public.weight_entries;
create policy "own weight" on public.weight_entries
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Usage is readable by its owner and writable by nobody: the counter is only
-- ever incremented inside `claim_ai_call`, which runs as its owner. A client
-- that could update this table could grant itself unlimited AI calls.
drop policy if exists "own ai usage" on public.ai_usage;
create policy "own ai usage" on public.ai_usage
  for select to authenticated using (auth.uid() = user_id);

/**
 * Atomically claim one AI call for the current user; true when it is allowed.
 *
 * A single insert-on-conflict-update, so two requests racing cannot both read
 * "0 used" and both be allowed — the mistake a read-then-write in the Edge
 * Function would make. It keys on `auth.uid()` rather than on a parameter, so
 * a caller cannot spend somebody else's quota.
 */
create or replace function public.claim_ai_call(daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  used  integer;
begin
  if uid is null then
    return false;
  end if;

  insert into public.ai_usage (user_id, day, calls)
  values (uid, today, 1)
  on conflict (user_id, day)
    do update set calls = public.ai_usage.calls + 1
  returning calls into used;

  return used <= daily_limit;
end;
$$;

revoke all on function public.claim_ai_call(integer) from public;
grant execute on function public.claim_ai_call(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Cleanup for projects created by an older build, which uploaded meal photos to
-- a storage bucket. Removing the policies stops new writes; the bucket and any
-- objects in it are left alone so nothing is deleted behind your back. To
-- reclaim the space, empty "meal-photos" yourself in Dashboard → Storage.
-- ---------------------------------------------------------------------------

drop policy if exists "own photos read"   on storage.objects;
drop policy if exists "own photos write"  on storage.objects;
drop policy if exists "own photos delete" on storage.objects;
