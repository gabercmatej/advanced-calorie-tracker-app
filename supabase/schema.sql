-- CalAI Supabase schema.
-- Run this once in your project's SQL editor (Dashboard → SQL → New query).
-- It is idempotent: safe to re-run.

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
  photo_path   text,                    -- object path in the meal-photos bucket
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
-- Row-level security: every user sees and edits only their own rows.
-- ---------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.food_entries   enable row level security;
alter table public.weight_entries enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own food" on public.food_entries;
create policy "own food" on public.food_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own weight" on public.weight_entries;
create policy "own weight" on public.weight_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Private storage bucket for compressed meal photos.
-- Objects are stored under "<user_id>/<entry_id>.jpg".
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;

drop policy if exists "own photos read"   on storage.objects;
drop policy if exists "own photos write"  on storage.objects;
drop policy if exists "own photos delete" on storage.objects;

create policy "own photos read" on storage.objects
  for select using (
    bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own photos write" on storage.objects
  for insert with check (
    bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own photos delete" on storage.objects
  for delete using (
    bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
