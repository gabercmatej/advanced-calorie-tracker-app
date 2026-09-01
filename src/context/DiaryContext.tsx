import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/context/AuthContext';
import { mergeEntries, mergeWeights, mergeProfile } from '@/lib/merge';
import { reconcile, type LocalState } from '@/lib/sync';
import {
  computeAdaptivePlan,
  currentStreak,
  macrosFromCalories,
  toDateKey,
  totalsFor,
  type AdaptivePlan,
  type DayTotals,
  type PlanAnchor,
} from '@/lib/nutrition';
import {
  deleteEntryRemote,
  deleteWeightRemote,
  loadAll,
  upsertEntriesRemote,
  upsertProfileRemote,
  upsertWeightsRemote,
  type RemoteProfile,
} from '@/lib/remote';
import { StorageKeys, storage } from '@/lib/storage';
import { isSaved } from '@/lib/quick-log';
import type {
  FoodEntry,
  Profile,
  SavedFood,
  ThemePreference,
  UnitSystem,
  UserMetrics,
  WeightEntry,
} from '@/types';

/**
 * The diary store — profile, food entries, weigh-ins, and the adaptive plan.
 *
 * **Local-first.** AsyncStorage is always the working copy: the app hydrates
 * from it, writes to it on every change, and works fully offline whether or not
 * a backend is configured. Supabase, when configured and signed in, is a mirror
 * kept in step by a merge (see `lib/merge.ts`) — never by replacement.
 *
 * That ordering is the whole point. An earlier version loaded *either* local
 * storage or the cloud, which meant signing in for the first time showed an
 * empty diary and quietly stranded every local entry. Here, local data is read
 * before the network is touched and merged into whatever the cloud returns, so
 * enabling sync can only ever add history.
 */

const DEFAULT_PROFILE: Profile = {
  name: 'You',
  goals: {
    calories: 2000,
    macros: macrosFromCalories(2000),
  },
  onboarded: false,
  notificationsEnabled: false,
  units: 'metric',
  theme: 'light',
};

function toRemoteProfile(p: Profile): RemoteProfile {
  return {
    name: p.name,
    goals: p.goals,
    metrics: p.metrics,
    onboarded: p.onboarded,
    notificationsEnabled: p.notificationsEnabled,
    units: p.units,
    theme: p.theme,
    updatedAt: p.updatedAt,
  };
}

/** What the cloud mirror is currently doing, for the Profile screen's status row. */
export type SyncStatus =
  /** No backend configured — this device is the only copy. */
  | 'local'
  /** Backend configured but nobody signed in. */
  | 'signed-out'
  | 'syncing'
  | 'synced'
  /** Last sync failed. Local data is intact; we retry on next launch. */
  | 'error';

interface DiaryContextValue {
  ready: boolean;
  profile: Profile;
  entries: FoodEntry[];
  weights: WeightEntry[];
  /** Current consecutive-day logging streak. */
  streak: number;
  /** Entries for a given date key (defaults to today). */
  entriesForDate: (date?: string) => FoodEntry[];
  /** Totals for a given date key (defaults to today). */
  totalsForDate: (date?: string) => DayTotals;
  /** Set of date keys that have at least one entry. */
  loggedDates: Set<string>;
  /** Set of date keys that have a logged weight. */
  weighedDates: Set<string>;
  /** Weight entry for a given date key, if one exists. */
  weightForDate: (date: string) => WeightEntry | undefined;
  /**
   * Adaptive, muscle-sparing calorie/macro recommendation for cutters. Null for
   * maintain/gain (or before onboarding). It is auto-applied to `profile.goals`.
   */
  recommendation: AdaptivePlan | null;
  /**
   * The day the Home screen is currently focused on (a date key). Tapping a day
   * in the week strip or the Progress calendar points Home at it instead of
   * opening a separate screen. Defaults to today.
   */
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  addEntry: (entry: Omit<FoodEntry, 'id' | 'createdAt'>) => FoodEntry;
  updateEntry: (id: string, patch: Partial<Omit<FoodEntry, 'id' | 'createdAt'>>) => void;
  removeEntry: (id: string) => void;
  /** Record a body-weight measurement (kg) for a date (defaults to today). */
  logWeight: (weightKg: number, date?: string) => void;
  /** Delete the body-weight measurement for a date. */
  removeWeight: (date: string) => void;
  updateGoals: (goals: Profile['goals']) => void;
  setName: (name: string) => void;
  setUnits: (units: UnitSystem) => void;
  setTheme: (theme: ThemePreference) => void;
  /**
   * Finish onboarding: persist metrics and the computed goals. Safe to call
   * while signed out — that is the point — and `name` may arrive later.
   */
  completeOnboarding: (data: {
    name?: string;
    metrics: UserMetrics;
    goals: Profile['goals'];
  }) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  /** Foods pinned for one-tap re-logging. */
  savedFoods: SavedFood[];
  /** Pin a food, or unpin it if an identical one is already saved. */
  toggleSavedFood: (food: Omit<SavedFood, 'id' | 'createdAt'>) => void;
  removeSavedFood: (id: string) => void;
  /** State of the cloud mirror, for the sync status row in Profile. */
  syncStatus: SyncStatus;
  /**
   * Merge a restored backup into the diary. Additive by construction — nothing
   * already present is removed. Returns how many records were new.
   */
  restore: (data: {
    profile?: Profile;
    entries: FoodEntry[];
    weights: WeightEntry[];
    savedFoods?: SavedFood[];
  }) => {
    entriesAdded: number;
    weightsAdded: number;
  };
}

const DiaryContext = createContext<DiaryContextValue | null>(null);

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const warn = (op: string) => (err: unknown) => console.warn(`[diary] remote ${op} failed`, err);

export function DiaryProvider({ children }: { children: ReactNode }) {
  const { userId, usesSupabase, ready: authReady } = useAuth();

  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [savedFoods, setSavedFoods] = useState<SavedFood[]>([]);
  /**
   * Last applied calorie target, for the adaptive plan's rate limiter.
   *
   * Read once at hydration and then held fixed for the session. That is not a
   * simplification — the cap is per *calendar day*, so re-anchoring mid-session
   * would let the target creep by a full step every time the diary changed.
   * Tomorrow's anchor is written to storage by the effect below.
   */
  const [planAnchor, setPlanAnchor] = useState<PlanAnchor | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => toDateKey());
  // Only the cloud round-trip is stateful. Whether a backend exists and whether
  // anyone is signed in are already props of the auth context, so deriving them
  // avoids storing state that just mirrors other state.
  const [cloudStatus, setCloudStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const syncStatus: SyncStatus = !usesSupabase
    ? 'local'
    : !userId
      ? 'signed-out'
      : cloudStatus === 'idle'
        ? 'syncing'
        : cloudStatus;

  // Refs mirror the latest state so async sync code reads fresh values.
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const weightsRef = useRef(weights);
  weightsRef.current = weights;
  const savedFoodsRef = useRef(savedFoods);
  savedFoodsRef.current = savedFoods;

  // The user id we sync to (null in local-only mode or when signed out).
  const syncId = usesSupabase ? userId : null;
  const syncIdRef = useRef(syncId);
  syncIdRef.current = syncId;

  /**
   * The account the cloud reconciliation has actually resolved, or null while
   * one is in flight. Gates the reactive profile mirror below — see the comment
   * there for why writing a profile before this is set corrupts the other
   * account's row.
   */
  const syncedOwnerRef = useRef<string | null>(null);

  // Ids deleted locally that the cloud may still hold. Replayed on next sync.
  const tombstonesRef = useRef<string[]>([]);
  const rememberDeletion = useCallback((id: string) => {
    tombstonesRef.current = [...tombstonesRef.current, id];
    storage.set(StorageKeys.deletedEntries, tombstonesRef.current);
  }, []);

  // ---------------------------------------------------------------------------
  // Phase 1 — local hydration. Always runs, always first, never blocked on the
  // network. The app is fully usable at the end of this effect.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [savedEntries, savedProfile, savedWeights, savedTombstones, pinned, anchor] =
        await Promise.all([
          storage.get<FoodEntry[]>(StorageKeys.entries),
          storage.get<Profile>(StorageKeys.profile),
          storage.get<WeightEntry[]>(StorageKeys.weights),
          storage.get<string[]>(StorageKeys.deletedEntries),
          storage.get<SavedFood[]>(StorageKeys.savedFoods),
          storage.get<PlanAnchor>(StorageKeys.planAnchor),
        ]);
      if (cancelled) return;
      if (savedEntries) setEntries(savedEntries);
      if (savedWeights) setWeights(savedWeights);
      if (pinned) setSavedFoods(pinned);
      if (anchor) setPlanAnchor(anchor);
      if (savedProfile) {
        const merged = { ...DEFAULT_PROFILE, ...savedProfile };
        // 'system' was a valid theme in an earlier build; it no longer is.
        if ((merged.theme as string) === 'system') merged.theme = 'light';
        setProfile(merged);
      }
      tombstonesRef.current = savedTombstones ?? [];
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Phase 2 — cloud reconciliation. Runs after local hydration, and only when a
  // backend is configured and a user is signed in. Failure here is survivable:
  // local state is already correct and we simply try again next launch.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!ready || !authReady) return;
    // Nothing to reconcile: no backend, or signed out. Local data is
    // deliberately left untouched in both state and storage — wiping it would
    // destroy the diary of a user who simply logged out, and this app has
    // exactly one user per device.
    if (!usesSupabase || !userId) return;

    let cancelled = false;
    (async () => {
      setCloudStatus('syncing');
      // Disarm the reactive profile mirror for the duration: until this resolves,
      // the in-memory profile may still belong to the previous account.
      syncedOwnerRef.current = null;
      try {
        // Whose data is sitting in local storage? Null means it has never been
        // synced — the first-sign-in migration case, where local history should
        // be adopted into the account.
        const owner = await storage.get<string>(StorageKeys.syncOwner);

        const switching = owner !== null && owner !== userId;
        // Only read a stash when one could apply — this account's own data, set
        // aside when somebody else signed in here previously.
        const stash = switching
          ? await storage.get<Partial<LocalState>>(`${StorageKeys.stashPrefix}${userId}`)
          : null;

        const remote = await loadAll(userId);
        if (cancelled) return;

        // Snapshot the tombstones going into this sync. Anything deleted *while*
        // it runs must survive it: clearing the whole list at the end would drop
        // that deletion and let the next merge resurrect the entry.
        const plan = reconcile({
          local: {
            entries: entriesRef.current,
            weights: weightsRef.current,
            profile: profileRef.current,
            savedFoods: savedFoodsRef.current,
          },
          remote,
          owner,
          userId,
          tombstones: tombstonesRef.current,
          stash,
          defaultProfile: DEFAULT_PROFILE,
        });

        // Set the outgoing account's data aside *before* replacing what is on
        // screen. Signing in as somebody else must never be a way to lose a diary.
        if (plan.stashOwner && plan.stashData) {
          await storage.set(`${StorageKeys.stashPrefix}${plan.stashOwner}`, {
            ...plan.stashData,
            stashedAt: Date.now(),
          });
        }
        if (cancelled) return;

        setEntries(plan.next.entries);
        setWeights(plan.next.weights);
        setProfile(plan.next.profile);
        if (switching) {
          setSavedFoods(plan.next.savedFoods);
          tombstonesRef.current = [];
          await storage.set(StorageKeys.deletedEntries, []);
        }

        // Push only what the cloud is missing or holds an older copy of.
        await upsertProfileRemote(userId, toRemoteProfile(plan.next.profile));
        if (plan.pushEntries.length) await upsertEntriesRemote(userId, plan.pushEntries);
        if (plan.pushWeights.length) await upsertWeightsRemote(userId, plan.pushWeights);

        // Replay offline deletions, then retire only the ones just replayed.
        if (plan.replayDeletes.length) {
          await Promise.all(plan.replayDeletes.map((id) => deleteEntryRemote(userId, id)));
          const done = new Set(plan.replayDeletes);
          tombstonesRef.current = tombstonesRef.current.filter((id) => !done.has(id));
          await storage.set(StorageKeys.deletedEntries, tombstonesRef.current);
        }

        await storage.set(StorageKeys.syncOwner, userId);
        // This account is now the one on screen, so later profile edits are
        // safe to mirror. Only on success: a failed sync leaves the in-memory
        // profile unresolved, and next launch will reconcile again.
        if (!cancelled) syncedOwnerRef.current = userId;
        if (!cancelled) setCloudStatus('synced');
      } catch (err) {
        warn('sync')(err);
        if (!cancelled) setCloudStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, authReady, usesSupabase, userId]);

  // ---------------------------------------------------------------------------
  // Persistence — local storage is written on every change, in every mode. The
  // `ready` guard is what stops the initial empty state from clobbering it.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (ready) storage.set(StorageKeys.entries, entries);
  }, [entries, ready]);

  useEffect(() => {
    if (ready) storage.set(StorageKeys.weights, weights);
  }, [weights, ready]);

  useEffect(() => {
    if (ready) storage.set(StorageKeys.profile, profile);
  }, [profile, ready]);

  // Saved foods live on the device only. They are derived from the user's own
  // history and cost nothing to rebuild, so they don't justify a sync table —
  // but they do travel in a backup export.
  useEffect(() => {
    if (ready) storage.set(StorageKeys.savedFoods, savedFoods);
  }, [savedFoods, ready]);

  // Mirror profile *edits* to the cloud (single row — cheap to upsert reactively).
  //
  // The `syncedOwnerRef` guard is load-bearing, not defensive. This effect also
  // re-runs when `syncId` changes, and at that instant `profile` is still the
  // previous occupant's — hydrated from local storage, belonging to whoever used
  // the device last. Without the guard, signing in wrote *their* name, metrics
  // and calorie target straight into the incoming account's row, and did it
  // faster than the reconciliation above could finish its round trip: the sync
  // then read the row it had just clobbered, merged it, and both the screen and
  // the cloud settled on the wrong person's plan.
  //
  // So the mirror stays disarmed until the reconciliation has actually resolved
  // this account — which pushes the merged profile itself. The only writes that
  // reach here are real edits made afterwards.
  useEffect(() => {
    if (!ready || !syncId || syncedOwnerRef.current !== syncId) return;
    upsertProfileRemote(syncId, toRemoteProfile(profile)).catch(warn('profile'));
  }, [profile, ready, syncId]);

  const entriesForDate = useCallback(
    (date: string = toDateKey()) =>
      entries.filter((e) => e.date === date).sort((a, b) => a.createdAt - b.createdAt),
    [entries],
  );

  const totalsForDate = useCallback(
    (date: string = toDateKey()) => totalsFor(entriesForDate(date)),
    [entriesForDate],
  );

  const loggedDates = useMemo(() => new Set(entries.map((e) => e.date)), [entries]);
  const weighedDates = useMemo(() => new Set(weights.map((w) => w.date)), [weights]);
  const weightForDate = useCallback(
    (date: string) => weights.find((w) => w.date === date),
    [weights],
  );

  // Adaptive plan recomputes from metrics + logged data (never from current goals,
  // so auto-applying it below can't feed back into itself).
  const recommendation = useMemo(
    () => computeAdaptivePlan(profile.metrics, entries, weights, planAnchor),
    [profile.metrics, entries, weights, planAnchor],
  );

  // Persist today's target as the anchor the *next* session will rate-limit
  // against. Deliberately storage-only: feeding it straight back into state
  // would re-anchor mid-session and defeat the per-day cap.
  useEffect(() => {
    if (!ready || !recommendation) return;
    storage.set(StorageKeys.planAnchor, {
      calories: recommendation.calories,
      date: toDateKey(),
    } satisfies PlanAnchor);
  }, [ready, recommendation]);

  // Keep the daily goal in sync with the adaptive plan for cutters. Converges:
  // recommendation doesn't depend on profile.goals, so once they match it stops.
  useEffect(() => {
    if (!ready || !recommendation) return;
    const g = profile.goals;
    const r = recommendation;
    if (
      r.calories !== g.calories ||
      r.macros.protein !== g.macros.protein ||
      r.macros.carbs !== g.macros.carbs ||
      r.macros.fat !== g.macros.fat
    ) {
      setProfile((prev) => ({
        ...prev,
        goals: { calories: r.calories, macros: r.macros },
        updatedAt: Date.now(),
      }));
    }
  }, [ready, recommendation, profile.goals]);

  const streak = useMemo(() => currentStreak(loggedDates), [loggedDates]);

  const addEntry = useCallback((entry: Omit<FoodEntry, 'id' | 'createdAt'>) => {
    const now = Date.now();
    const full: FoodEntry = { ...entry, id: newId(), createdAt: now, updatedAt: now };
    setEntries((prev) => [...prev, full]);
    if (syncIdRef.current) upsertEntriesRemote(syncIdRef.current, [full]).catch(warn('addEntry'));
    return full;
  }, []);

  const updateEntry = useCallback(
    (id: string, patch: Partial<Omit<FoodEntry, 'id' | 'createdAt'>>) => {
      const existing = entriesRef.current.find((e) => e.id === id);
      const stamped = { ...patch, updatedAt: Date.now() };
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...stamped } : e)));
      if (syncIdRef.current && existing) {
        upsertEntriesRemote(syncIdRef.current, [{ ...existing, ...stamped }]).catch(
          warn('updateEntry'),
        );
      }
    },
    [],
  );

  const removeEntry = useCallback(
    (id: string) => {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      // Record the deletion first: if the remote call fails (or we're offline)
      // the tombstone is what stops the next merge resurrecting the entry.
      rememberDeletion(id);
      if (syncIdRef.current) {
        deleteEntryRemote(syncIdRef.current, id)
          .then(() => {
            tombstonesRef.current = tombstonesRef.current.filter((t) => t !== id);
            storage.set(StorageKeys.deletedEntries, tombstonesRef.current);
          })
          .catch(warn('removeEntry'));
      }
    },
    [rememberDeletion],
  );

  const logWeight = useCallback((weightKg: number, date: string = toDateKey()) => {
    const w: WeightEntry = { date, weightKg, updatedAt: Date.now() };
    setWeights((prev) => [...prev.filter((x) => x.date !== date), w]);
    if (syncIdRef.current) upsertWeightsRemote(syncIdRef.current, [w]).catch(warn('logWeight'));
  }, []);

  const removeWeight = useCallback((date: string) => {
    setWeights((prev) => prev.filter((w) => w.date !== date));
    if (syncIdRef.current) deleteWeightRemote(syncIdRef.current, date).catch(warn('removeWeight'));
  }, []);

  const updateGoals = useCallback((goals: Profile['goals']) => {
    setProfile((prev) => ({ ...prev, goals, updatedAt: Date.now() }));
  }, []);

  const setName = useCallback((name: string) => {
    setProfile((prev) => ({ ...prev, name, updatedAt: Date.now() }));
  }, []);

  const setUnits = useCallback((units: UnitSystem) => {
    setProfile((prev) => ({ ...prev, units, updatedAt: Date.now() }));
  }, []);

  const setTheme = useCallback((theme: ThemePreference) => {
    setProfile((prev) => ({ ...prev, theme, updatedAt: Date.now() }));
  }, []);

  /**
   * Save the finished plan.
   *
   * Called the moment onboarding has computed a plan — *before* any account
   * exists — because that is what makes the plan durable. It used to be called
   * after sign-up succeeded, which meant the answers lived only in the wizard's
   * component state until then; anything that interrupted sign-up (an
   * email-confirmation step, a typo'd password, backgrounding the app to read
   * the confirmation mail) discarded every one of them.
   *
   * `name` is therefore optional: it is the one field that is not known until
   * the account step, and it arrives later via `setName`.
   */
  const completeOnboarding = useCallback(
    (data: { name?: string; metrics: UserMetrics; goals: Profile['goals'] }) => {
      setProfile((prev) => ({
        ...prev,
        ...(data.name ? { name: data.name } : null),
        metrics: data.metrics,
        goals: data.goals,
        onboarded: true,
        updatedAt: Date.now(),
      }));
      // Seed a starting weight point so the progress chart has an anchor.
      const today = toDateKey();
      setWeights((prev) => {
        if (prev.some((w) => w.date === today)) return prev;
        const seed: WeightEntry = { date: today, weightKg: data.metrics.weightKg, updatedAt: Date.now() };
        if (syncIdRef.current) {
          upsertWeightsRemote(syncIdRef.current, [seed]).catch(warn('seedWeight'));
        }
        return [...prev, seed];
      });
    },
    [],
  );

  const toggleSavedFood = useCallback((food: Omit<SavedFood, 'id' | 'createdAt'>) => {
    setSavedFoods((prev) => {
      // Same name and same per-serving calories means it is already pinned.
      if (isSaved(prev, food)) {
        return prev.filter((s) => s.name.trim().toLowerCase() !== food.name.trim().toLowerCase());
      }
      const next: SavedFood = {
        ...food,
        macros: { ...food.macros },
        id: newId(),
        createdAt: Date.now(),
      };
      return [next, ...prev];
    });
  }, []);

  const removeSavedFood = useCallback((id: string) => {
    setSavedFoods((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const setNotificationsEnabled = useCallback((enabled: boolean) => {
    setProfile((prev) => ({ ...prev, notificationsEnabled: enabled, updatedAt: Date.now() }));
  }, []);

  const restore = useCallback(
    (data: {
      profile?: Profile;
      entries: FoodEntry[];
      weights: WeightEntry[];
      savedFoods?: SavedFood[];
    }) => {
      const beforeEntries = entriesRef.current.length;
      const beforeWeights = weightsRef.current.length;

      // A restore is a merge, not a replacement: importing a backup can only
      // add history back. Restored ids that already exist keep whichever copy
      // was written more recently.
      const nextEntries = mergeEntries(entriesRef.current, data.entries);
      const nextWeights = mergeWeights(weightsRef.current, data.weights);
      setEntries(nextEntries);
      setWeights(nextWeights);
      if (data.profile) {
        setProfile((prev) => mergeProfile(prev, { ...DEFAULT_PROFILE, ...data.profile }));
      }
      if (data.savedFoods?.length) {
        setSavedFoods((prev) => {
          const have = new Set(prev.map((s) => s.id));
          return [...prev, ...data.savedFoods!.filter((s) => !have.has(s.id))];
        });
      }

      if (syncIdRef.current) {
        upsertEntriesRemote(syncIdRef.current, nextEntries).catch(warn('restoreEntries'));
        upsertWeightsRemote(syncIdRef.current, nextWeights).catch(warn('restoreWeights'));
      }

      return {
        entriesAdded: nextEntries.length - beforeEntries,
        weightsAdded: nextWeights.length - beforeWeights,
      };
    },
    [],
  );

  const value = useMemo<DiaryContextValue>(
    () => ({
      ready,
      profile,
      entries,
      weights,
      streak,
      entriesForDate,
      totalsForDate,
      loggedDates,
      weighedDates,
      weightForDate,
      recommendation,
      selectedDate,
      setSelectedDate,
      addEntry,
      updateEntry,
      removeEntry,
      logWeight,
      removeWeight,
      updateGoals,
      setName,
      setUnits,
      setTheme,
      completeOnboarding,
      setNotificationsEnabled,
      savedFoods,
      toggleSavedFood,
      removeSavedFood,
      syncStatus,
      restore,
    }),
    [
      ready,
      profile,
      entries,
      weights,
      streak,
      entriesForDate,
      totalsForDate,
      loggedDates,
      weighedDates,
      weightForDate,
      recommendation,
      selectedDate,
      addEntry,
      updateEntry,
      removeEntry,
      logWeight,
      removeWeight,
      updateGoals,
      setName,
      setUnits,
      setTheme,
      completeOnboarding,
      setNotificationsEnabled,
      savedFoods,
      toggleSavedFood,
      removeSavedFood,
      syncStatus,
      restore,
    ],
  );

  return <DiaryContext.Provider value={value}>{children}</DiaryContext.Provider>;
}

export function useDiary(): DiaryContextValue {
  const ctx = useContext(DiaryContext);
  if (!ctx) throw new Error('useDiary must be used within a DiaryProvider');
  return ctx;
}
