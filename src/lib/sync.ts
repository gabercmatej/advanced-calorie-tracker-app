import {
  applyTombstones,
  entriesToPush,
  mergeEntries,
  mergeProfile,
  mergeWeights,
  weightsToPush,
} from '@/lib/merge';
import type { FoodEntry, Profile, SavedFood, WeightEntry } from '@/types';

/**
 * Deciding what a sync should do, without doing any of it.
 *
 * This is the reconciliation that runs when a signed-in user's device meets the
 * cloud: which records survive, which account's data is on screen, and what has
 * to be pushed back. It lives here rather than inside `DiaryContext` because it
 * is the part where a mistake silently destroys a diary, and a pure function is
 * the only version of it that can be tested against the cases that matter —
 * first sign-in, account switching, offline edits, conflicting writes, deletes
 * that must not resurrect. The context is left with the side effects: reading
 * storage, calling Supabase, setting state.
 *
 * The guarantee this upholds, in one line: **no branch here can lose a record
 * that is not covered by an explicit tombstone.**
 */

export interface LocalState {
  entries: FoodEntry[];
  weights: WeightEntry[];
  profile: Profile;
  savedFoods: SavedFood[];
}

export interface RemoteState {
  entries: FoodEntry[];
  weights: WeightEntry[];
  profile: Profile | null;
}

export interface ReconcileInput {
  /** What is on this device right now. */
  local: LocalState;
  /** What the account holds in the cloud. */
  remote: RemoteState;
  /** Whose data local storage belongs to; null when it has never synced. */
  owner: string | null;
  /** The account that just signed in. */
  userId: string;
  /** Ids deleted locally that the cloud may not know about yet. */
  tombstones: string[];
  /**
   * This account's previously stashed data, if it was set aside when another
   * account signed in on this device. Null when there is none.
   */
  stash: Partial<LocalState> | null;
  /** A default profile, used when neither side has one. */
  defaultProfile: Profile;
}

export interface ReconcilePlan {
  /** What the app should now show and store. */
  next: LocalState;
  /** Records the cloud is missing or holds an older copy of. */
  pushEntries: FoodEntry[];
  pushWeights: WeightEntry[];
  /** Deletions to replay against the cloud, then retire. */
  replayDeletes: string[];
  /**
   * The outgoing user's data to set aside, when a different account signed in.
   * Null on a normal sync. Nothing is ever discarded — only moved.
   */
  stashOwner: string | null;
  stashData: LocalState | null;
  /** True when local data was adopted into an account for the first time. */
  adopted: boolean;
}

export function reconcile(input: ReconcileInput): ReconcilePlan {
  const { local, remote, owner, userId, tombstones, stash, defaultProfile } = input;

  const switching = owner !== null && owner !== userId;

  // On an account switch the device's current data belongs to someone else, so
  // it is set aside rather than merged — pushing it would file one person's
  // diary under another's account. What we reconcile instead is this account's
  // own stash, if it left one behind on a previous switch. Without that lookup
  // an A → B → A rotation silently drops everything A logged while offline: it
  // was no longer on screen, and only the stash still held it.
  const base: LocalState = switching
    ? {
        entries: stash?.entries ?? [],
        weights: stash?.weights ?? [],
        profile: stash?.profile ? { ...defaultProfile, ...stash.profile } : defaultProfile,
        savedFoods: stash?.savedFoods ?? [],
      }
    : local;

  // Tombstones are recorded against whoever was signed in at the time, so they
  // must not follow the device into a different account.
  const replayDeletes = switching ? [] : tombstones;

  const entries = applyTombstones(mergeEntries(base.entries, remote.entries), replayDeletes);
  const weights = mergeWeights(base.weights, remote.weights);
  const profile = mergeProfile(
    base.profile,
    remote.profile ? { ...defaultProfile, ...remote.profile } : null,
  );

  return {
    next: { entries, weights, profile, savedFoods: base.savedFoods },
    pushEntries: entriesToPush(entries, remote.entries),
    pushWeights: weightsToPush(weights, remote.weights),
    replayDeletes,
    stashOwner: switching ? owner : null,
    stashData: switching ? local : null,
    // First sign-in on a device that already had history: the account inherits
    // it rather than the cloud's emptiness replacing it.
    adopted: owner === null && (local.entries.length > 0 || local.profile.onboarded),
  };
}
