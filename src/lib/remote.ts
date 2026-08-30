import { supabase } from '@/lib/supabase';
import type { FoodEntry, Profile, UnitSystem, UserMetrics, WeightEntry } from '@/types';

/**
 * Supabase data-access layer. All functions assume Supabase is configured and a
 * user is signed in (callers guard on that). Reads/writes are scoped to the
 * signed-in user by row-level security — see supabase/schema.sql.
 *
 * **Photos are deliberately not synced.** Meal photos are the only part of the
 * diary that is large, and they are worth almost nothing after the meal is
 * logged: the calories and the breakdown are the durable record. Keeping them
 * on-device means a year of daily logging stays comfortably inside the free
 * tier — a text-only entry is a few hundred bytes, so even 3,000 of them are
 * under a megabyte, against a 500 MB allowance. `photoUri` still points at the
 * local file for as long as the app is installed.
 */

function client() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

/**
 * Rows per request when pushing history. A first sync after months of offline
 * logging can be thousands of entries; one statement per row would be thousands
 * of round trips, and a single statement risks a payload limit.
 */
const BATCH = 200;

function chunk<T>(items: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// --- Row <-> model mapping ---------------------------------------------------

interface EntryRow {
  id: string;
  user_id: string;
  date: string;
  meal: string;
  name: string;
  calories: number;
  macros: FoodEntry['macros'];
  fiber: number | null;
  quantity: number;
  ai_estimated: boolean;
  items: FoodEntry['items'] | null;
  created_at: number;
  updated_at: number | null;
}

function rowToEntry(r: EntryRow): FoodEntry {
  return {
    id: r.id,
    date: r.date,
    meal: r.meal as FoodEntry['meal'],
    name: r.name,
    calories: Number(r.calories),
    macros: r.macros,
    fiber: r.fiber == null ? undefined : Number(r.fiber),
    quantity: Number(r.quantity),
    aiEstimated: r.ai_estimated,
    items: r.items ?? undefined,
    createdAt: Number(r.created_at),
    updatedAt: r.updated_at == null ? undefined : Number(r.updated_at),
  };
}

function entryToRow(e: FoodEntry, userId: string): EntryRow {
  return {
    id: e.id,
    user_id: userId,
    date: e.date,
    meal: e.meal,
    name: e.name,
    calories: e.calories,
    macros: e.macros,
    fiber: e.fiber ?? null,
    quantity: e.quantity,
    ai_estimated: e.aiEstimated ?? false,
    items: e.items ?? null,
    // `photoUri`/`photoUris` are intentionally absent: they are on-device
    // file:// paths, and photos are not part of the cloud record at all.
    created_at: e.createdAt,
    updated_at: e.updatedAt ?? null,
  };
}

/** The subset of Profile stored remotely (name/goals/metrics/prefs). */
export type RemoteProfile = Pick<
  Profile,
  'name' | 'goals' | 'metrics' | 'onboarded' | 'notificationsEnabled' | 'units' | 'theme' | 'updatedAt'
>;

export interface RemoteData {
  profile: RemoteProfile | null;
  entries: FoodEntry[];
  weights: WeightEntry[];
}

// --- Bulk load ---------------------------------------------------------------

export async function loadAll(userId: string): Promise<RemoteData> {
  const db = client();
  const [profileRes, entriesRes, weightsRes] = await Promise.all([
    db.from('profiles').select('*').eq('id', userId).maybeSingle(),
    db.from('food_entries').select('*').eq('user_id', userId),
    db.from('weight_entries').select('*').eq('user_id', userId),
  ]);
  if (profileRes.error) throw profileRes.error;
  if (entriesRes.error) throw entriesRes.error;
  if (weightsRes.error) throw weightsRes.error;

  const pr = profileRes.data;
  const profile: RemoteProfile | null = pr
    ? {
        name: pr.name,
        goals: pr.goals,
        metrics: (pr.metrics ?? undefined) as UserMetrics | undefined,
        onboarded: pr.onboarded,
        notificationsEnabled: pr.notifications_enabled,
        units: pr.units as UnitSystem,
        theme: pr.theme,
        updatedAt: pr.updated_at_ms == null ? undefined : Number(pr.updated_at_ms),
      }
    : null;

  return {
    profile,
    entries: (entriesRes.data as EntryRow[]).map(rowToEntry),
    weights: (weightsRes.data as { date: string; weight_kg: number; updated_at: number | null }[]).map(
      (w) => ({
        date: w.date,
        weightKg: Number(w.weight_kg),
        updatedAt: w.updated_at == null ? undefined : Number(w.updated_at),
      }),
    ),
  };
}

// --- Mutations ---------------------------------------------------------------

export async function upsertProfileRemote(userId: string, p: RemoteProfile): Promise<void> {
  const { error } = await client()
    .from('profiles')
    .upsert({
      id: userId,
      name: p.name,
      onboarded: p.onboarded,
      units: p.units,
      theme: p.theme,
      notifications_enabled: p.notificationsEnabled,
      metrics: p.metrics ?? null,
      goals: p.goals,
      updated_at_ms: p.updatedAt ?? Date.now(),
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

/** Upsert any number of entries, batched. Used for both single writes and sync. */
export async function upsertEntriesRemote(userId: string, entries: FoodEntry[]): Promise<void> {
  if (entries.length === 0) return;
  for (const batch of chunk(entries)) {
    const { error } = await client()
      .from('food_entries')
      .upsert(batch.map((e) => entryToRow(e, userId)));
    if (error) throw error;
  }
}

/**
 * Delete one entry. Scoped by `user_id` as well as `id`: row-level security
 * already makes another user's row undeletable, but entry ids are generated on
 * the client, so scoping the statement means a collision fails as a no-op
 * rather than depending on the policy to be the only thing standing in the way.
 */
export async function deleteEntryRemote(userId: string, id: string): Promise<void> {
  const { error } = await client()
    .from('food_entries')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function upsertWeightsRemote(userId: string, weights: WeightEntry[]): Promise<void> {
  if (weights.length === 0) return;
  for (const batch of chunk(weights)) {
    const { error } = await client()
      .from('weight_entries')
      .upsert(
        batch.map((w) => ({
          user_id: userId,
          date: w.date,
          weight_kg: w.weightKg,
          updated_at: w.updatedAt ?? Date.now(),
        })),
      );
    if (error) throw error;
  }
}

export async function deleteWeightRemote(userId: string, date: string): Promise<void> {
  const { error } = await client()
    .from('weight_entries')
    .delete()
    .eq('user_id', userId)
    .eq('date', date);
  if (error) throw error;
}
