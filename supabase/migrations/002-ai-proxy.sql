-- Migration 002 — per-user rate limiting for the Claude proxy.
--
-- Run this in Dashboard → SQL Editor → New query, after 001. Additive and
-- idempotent: it creates one small table and one function, and touches nothing
-- that already exists.
--
-- Context: the Anthropic key now lives only as a Supabase secret, behind the
-- `claude` Edge Function, which requires a signed-in user. That already stops
-- the function being used as an open proxy. This adds the second half — a
-- signed-in user cannot run up an unbounded bill either, whether through a bug
-- (a render loop firing requests) or a stolen session.

-- One row per user per day. Rows are tiny and self-expiring in practice; the
-- cleanup at the bottom keeps the table from growing without bound.
create table if not exists public.ai_usage (
  user_id uuid  not null references auth.users (id) on delete cascade,
  day     date  not null default (now() at time zone 'utc')::date,
  calls   integer not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

-- Users may read their own usage (so the app could show it), and nothing else.
-- All writing happens inside the function below, which runs as its owner.
drop policy if exists "own ai usage" on public.ai_usage;
create policy "own ai usage" on public.ai_usage
  for select using (auth.uid() = user_id);

/**
 * Atomically claim one AI call for the current user.
 *
 * Returns true when the call is allowed. The insert-on-conflict-update is a
 * single statement, so two requests racing cannot both see "0 used" and both
 * be allowed — which is exactly the case a read-then-write in the Edge
 * Function would get wrong.
 *
 * `security definer` lets it write a table the caller cannot write directly,
 * and it keys on `auth.uid()` rather than a parameter so a caller cannot spend
 * somebody else's quota.
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

-- Keep only a fortnight of counters. Nothing reads older rows.
delete from public.ai_usage where day < (now() at time zone 'utc')::date - 14;
