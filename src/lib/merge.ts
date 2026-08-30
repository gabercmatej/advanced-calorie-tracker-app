import type { FoodEntry, Profile, WeightEntry } from '@/types';

/**
 * Merging local and cloud copies of the diary.
 *
 * The app is local-first: AsyncStorage is always the working copy, and Supabase
 * is a mirror that may be absent, stale, empty, or ahead. Whenever both exist we
 * have to reconcile them, and the guiding rule is:
 *
 *   **A merge never destroys data.** It is a union, not a replacement.
 *
 * Anything present on only one side survives. Only a genuine collision — the
 * same entry id, or the same weigh-in date — has to pick a winner, and it picks
 * the more recently written copy. Deletions are the one case a union can't
 * express, so they travel separately as explicit tombstones (see
 * `applyTombstones`), which is the only way a row is ever removed.
 *
 * Every function here is pure so the guarantees are actually testable —
 * see `src/lib/__tests__/merge.test.ts`.
 */

/** When a record was last written. Falls back for records predating sync. */
function stamp(r: { updatedAt?: number; createdAt?: number }): number {
  return r.updatedAt ?? r.createdAt ?? 0;
}

/**
 * Pick between two copies of the same record. The newer write wins; a tie goes
 * to `local`, because that is the device the user is holding and the copy their
 * last action produced.
 */
function newer<T extends { updatedAt?: number; createdAt?: number }>(local: T, remote: T): T {
  return stamp(remote) > stamp(local) ? remote : local;
}

/**
 * Union two sets of food entries by id.
 *
 * Entries unique to either side are kept as-is. Collisions resolve to whichever
 * copy was written last. Ordering is by `createdAt` so the result is stable
 * regardless of which side an entry came from.
 */
export function mergeEntries(local: FoodEntry[], remote: FoodEntry[]): FoodEntry[] {
  const byId = new Map<string, FoodEntry>();
  for (const e of local) byId.set(e.id, e);
  for (const e of remote) {
    const existing = byId.get(e.id);
    byId.set(e.id, existing ? newer(existing, e) : e);
  }
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Union two sets of weigh-ins by date (one measurement per day).
 *
 * Weigh-ins carry no `createdAt`, so a collision between two records that both
 * predate sync is unresolvable by timestamp — those keep the local value, on
 * the principle that the device in hand wrote it most recently.
 */
export function mergeWeights(local: WeightEntry[], remote: WeightEntry[]): WeightEntry[] {
  const byDate = new Map<string, WeightEntry>();
  for (const w of local) byDate.set(w.date, w);
  for (const w of remote) {
    const existing = byDate.get(w.date);
    byDate.set(w.date, existing ? newer(existing, w) : w);
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Is this profile worth anything? A profile carries real information only once
 * onboarding has produced the metrics the whole nutrition plan is derived from.
 *
 * `onboarded` alone is not sufficient evidence. Supabase creates a `profiles`
 * row from column defaults the first time anything is upserted, and a build
 * that wrote the flag before the metrics — or a row hand-edited in the
 * dashboard — yields a profile that claims to be finished and can rebuild
 * nothing. Judging on the payload instead of the flag makes the rule true by
 * construction rather than by trust.
 */
function isMeaningful(p: Profile): boolean {
  return Boolean(p.onboarded && p.metrics);
}

/**
 * Reconcile the single profile row.
 *
 * A profile carrying metrics always beats one that carries none. That rule
 * exists because the damaging case is specific, real, and silent: a fresh
 * install (or a brand-new account) briefly holds a default, un-onboarded
 * profile, and without this it would overwrite a copy holding months of goals
 * and body metrics — with no error, and nothing on screen to say a plan had
 * just been replaced by a 2000 kcal placeholder.
 *
 * Only when both sides are real (or both are empty) does the timestamp decide,
 * which is the case where the user genuinely has two devices and the later edit
 * should win.
 */
export function mergeProfile(local: Profile, remote: Profile | null): Profile {
  if (!remote) return local;
  const localReal = isMeaningful(local);
  const remoteReal = isMeaningful(remote);
  if (localReal && !remoteReal) return local;
  if (remoteReal && !localReal) return remote;
  return newer(local, remote);
}

/**
 * Remove entries the user deleted while the cloud copy was unreachable.
 *
 * Without this, a merge would faithfully resurrect every deleted entry from the
 * cloud on the next sync. Tombstones are held locally until the delete has been
 * replayed against the cloud, then discarded.
 */
export function applyTombstones(entries: FoodEntry[], deletedIds: Iterable<string>): FoodEntry[] {
  const gone = new Set(deletedIds);
  if (gone.size === 0) return entries;
  return entries.filter((e) => !gone.has(e.id));
}

/**
 * The records that need pushing to the cloud after a merge: everything the
 * remote side is missing or holds an older copy of. Pushing only the difference
 * keeps a first sync of months of history down to the rows that actually moved.
 */
export function entriesToPush(merged: FoodEntry[], remote: FoodEntry[]): FoodEntry[] {
  const remoteById = new Map(remote.map((e) => [e.id, e]));
  return merged.filter((e) => {
    const r = remoteById.get(e.id);
    return !r || stamp(r) < stamp(e);
  });
}

/** The weigh-ins the cloud is missing or holds an older copy of. */
export function weightsToPush(merged: WeightEntry[], remote: WeightEntry[]): WeightEntry[] {
  const remoteByDate = new Map(remote.map((w) => [w.date, w]));
  return merged.filter((w) => {
    const r = remoteByDate.get(w.date);
    return !r || stamp(r) < stamp(w);
  });
}
