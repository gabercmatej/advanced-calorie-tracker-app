import { decode } from 'base64-arraybuffer';

import { PHOTO_BUCKET, supabase } from '@/lib/supabase';
import type { FoodEntry, Profile, UnitSystem, UserMetrics, WeightEntry } from '@/types';

/**
 * Supabase data-access layer. All functions assume Supabase is configured and a
 * user is signed in (callers guard on that). Reads/writes are scoped to the
 * signed-in user by row-level security — see supabase/schema.sql.
 */

function client() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
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
  quantity: number;
  ai_estimated: boolean;
  photo_path: string | null;
  created_at: number;
}

function rowToEntry(r: EntryRow): FoodEntry {
  return {
    id: r.id,
    date: r.date,
    meal: r.meal as FoodEntry['meal'],
    name: r.name,
    calories: Number(r.calories),
    macros: r.macros,
    quantity: Number(r.quantity),
    aiEstimated: r.ai_estimated,
    photoPath: r.photo_path ?? undefined,
    createdAt: Number(r.created_at),
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
    quantity: e.quantity,
    ai_estimated: e.aiEstimated ?? false,
    photo_path: e.photoPath ?? null,
    created_at: e.createdAt,
  };
}

/** The subset of Profile stored remotely (name/goals/metrics/prefs). */
export type RemoteProfile = Pick<
  Profile,
  'name' | 'goals' | 'metrics' | 'onboarded' | 'notificationsEnabled' | 'units' | 'theme'
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
      }
    : null;

  return {
    profile,
    entries: (entriesRes.data as EntryRow[]).map(rowToEntry),
    weights: (weightsRes.data as { date: string; weight_kg: number }[]).map((w) => ({
      date: w.date,
      weightKg: Number(w.weight_kg),
    })),
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
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

export async function upsertEntryRemote(userId: string, entry: FoodEntry): Promise<void> {
  const { error } = await client().from('food_entries').upsert(entryToRow(entry, userId));
  if (error) throw error;
}

export async function deleteEntryRemote(id: string): Promise<void> {
  const { error } = await client().from('food_entries').delete().eq('id', id);
  if (error) throw error;
}

export async function upsertWeightRemote(userId: string, w: WeightEntry): Promise<void> {
  const { error } = await client()
    .from('weight_entries')
    .upsert({ user_id: userId, date: w.date, weight_kg: w.weightKg });
  if (error) throw error;
}

export async function deleteWeightRemote(userId: string, date: string): Promise<void> {
  const { error } = await client()
    .from('weight_entries')
    .delete()
    .eq('user_id', userId)
    .eq('date', date);
  if (error) throw error;
}

// --- Photos ------------------------------------------------------------------

/** Upload a compressed JPEG (base64, no data: prefix). Returns the object path. */
export async function uploadPhoto(userId: string, entryId: string, base64: string): Promise<string> {
  const path = `${userId}/${entryId}.jpg`;
  const { error } = await client()
    .storage.from(PHOTO_BUCKET)
    .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return path;
}

export async function deletePhoto(path: string): Promise<void> {
  const { error } = await client().storage.from(PHOTO_BUCKET).remove([path]);
  if (error) throw error;
}

/** A time-limited URL for a private photo, or null on failure. */
export async function signedPhotoUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await client()
    .storage.from(PHOTO_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}
