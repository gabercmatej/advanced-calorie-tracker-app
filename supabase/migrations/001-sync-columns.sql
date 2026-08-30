-- Migration 001 — columns required by local-first sync.
--
-- Run this once in Dashboard → SQL Editor → New query, against a project that
-- already has the original CalAI tables. If you are starting from scratch,
-- run supabase/schema.sql instead — it already includes everything here.
--
-- Every statement is additive and idempotent: no column is dropped, no row is
-- rewritten, and re-running it does nothing. Existing entries keep their data
-- and simply carry NULL in the new columns, which the client reads as
-- "unknown" and falls back to `created_at`.
--
-- Until this has run, the app still works — it just cannot push to the cloud,
-- and the Profile screen will show the sync as failed. Local data is unaffected.

-- Epoch millis of the last edit. Decides which copy wins when the same entry
-- exists both locally and in the cloud.
alter table public.food_entries   add column if not exists updated_at    bigint;
alter table public.weight_entries add column if not exists updated_at    bigint;

-- Millisecond mirror of the profile's timestamp, so profile conflicts resolve
-- on the same clock as entries and weigh-ins.
alter table public.profiles       add column if not exists updated_at_ms bigint;

-- Dietary fibre in grams. NULL means "not known", which is distinct from 0 g.
alter table public.food_entries   add column if not exists fiber         numeric;

-- Photos are no longer uploaded — they stay on the device that took them, which
-- is what keeps this database small enough to live in the free tier for years.
-- The storage policies are dropped so nothing new can be written; the bucket and
-- any existing objects are deliberately left alone rather than deleted. To
-- reclaim that space, empty "meal-photos" yourself in Dashboard → Storage.
drop policy if exists "own photos read"   on storage.objects;
drop policy if exists "own photos write"  on storage.objects;
drop policy if exists "own photos delete" on storage.objects;
