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
import {
  computeAdaptivePlan,
  currentStreak,
  macrosFromCalories,
  toDateKey,
  totalsFor,
  type AdaptivePlan,
} from '@/lib/nutrition';
import { notifyStreak } from '@/lib/notifications';
import {
  deleteEntryRemote,
  deletePhoto,
  deleteWeightRemote,
  loadAll,
  upsertEntryRemote,
  upsertProfileRemote,
  upsertWeightRemote,
  type RemoteProfile,
} from '@/lib/remote';
import { StorageKeys, storage } from '@/lib/storage';
import type {
  FoodEntry,
  Macros,
  Profile,
  ThemePreference,
  UnitSystem,
  UserMetrics,
  WeightEntry,
} from '@/types';

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
  };
}

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
  totalsForDate: (date?: string) => { calories: number; macros: Macros };
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
  /** Finish onboarding: persist metrics, computed goals and name. */
  completeOnboarding: (data: { name: string; metrics: UserMetrics; goals: Profile['goals'] }) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
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
  const [selectedDate, setSelectedDate] = useState<string>(() => toDateKey());

  // Refs mirror the latest state so async remote code reads fresh values.
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const weightsRef = useRef(weights);
  weightsRef.current = weights;
  // The user id we should sync to (null in local-only mode or when signed out).
  const syncId = usesSupabase ? userId : null;
  const syncIdRef = useRef(syncId);
  syncIdRef.current = syncId;

  // --- Hydration: Supabase when configured + signed in, else local storage. ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (usesSupabase) {
        if (!authReady) return; // wait for the session to resolve first
        if (!userId) {
          // Signed out: nothing to load. Reset so a previous user's data clears.
          if (!cancelled) {
            setEntries([]);
            setWeights([]);
            setProfile(DEFAULT_PROFILE);
            setReady(true);
          }
          return;
        }
        try {
          const data = await loadAll(userId);
          if (cancelled) return;
          if (data.profile) {
            // Returning user — the cloud is the source of truth.
            setProfile({ ...DEFAULT_PROFILE, ...data.profile });
            setEntries(data.entries);
            setWeights(data.weights);
          } else {
            // Brand-new account (e.g. just onboarded): seed the cloud from the
            // local state that onboarding produced (read fresh via refs).
            await upsertProfileRemote(userId, toRemoteProfile(profileRef.current));
            await Promise.all([
              ...entriesRef.current.map((e) => upsertEntryRemote(userId, e)),
              ...weightsRef.current.map((w) => upsertWeightRemote(userId, w)),
            ]);
          }
        } catch (err) {
          warn('load')(err);
        } finally {
          if (!cancelled) setReady(true);
        }
        return;
      }

      // Local-only mode (no backend configured).
      const [savedEntries, savedProfile, savedWeights] = await Promise.all([
        storage.get<FoodEntry[]>(StorageKeys.entries),
        storage.get<Profile>(StorageKeys.profile),
        storage.get<WeightEntry[]>(StorageKeys.weights),
      ]);
      if (cancelled) return;
      if (savedEntries) setEntries(savedEntries);
      if (savedWeights) setWeights(savedWeights);
      if (savedProfile) {
        const merged = { ...DEFAULT_PROFILE, ...savedProfile };
        if ((merged.theme as string) === 'system') merged.theme = 'light';
        setProfile(merged);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [usesSupabase, authReady, userId]);

  // Persist to local storage only in local-only mode; the cloud handles the rest.
  useEffect(() => {
    if (ready && !usesSupabase) storage.set(StorageKeys.entries, entries);
  }, [entries, ready, usesSupabase]);

  useEffect(() => {
    if (ready && !usesSupabase) storage.set(StorageKeys.weights, weights);
  }, [weights, ready, usesSupabase]);

  useEffect(() => {
    if (ready && !usesSupabase) storage.set(StorageKeys.profile, profile);
  }, [profile, ready, usesSupabase]);

  // Mirror profile changes to the cloud (single row — cheap to upsert reactively).
  useEffect(() => {
    if (!ready || !syncId) return;
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
    () => computeAdaptivePlan(profile.metrics, entries, weights),
    [profile.metrics, entries, weights],
  );

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
      setProfile((prev) => ({ ...prev, goals: { calories: r.calories, macros: r.macros } }));
    }
  }, [ready, recommendation, profile.goals]);

  const streak = useMemo(() => currentStreak(loggedDates), [loggedDates]);

  // Fire a congratulatory notification when the streak grows (not on hydration).
  const prevStreak = useRef(0);
  useEffect(() => {
    if (!ready) return;
    if (streak > prevStreak.current && profile.notificationsEnabled) {
      notifyStreak(streak);
    }
    prevStreak.current = streak;
  }, [streak, ready, profile.notificationsEnabled]);

  const addEntry = useCallback((entry: Omit<FoodEntry, 'id' | 'createdAt'>) => {
    const full: FoodEntry = { ...entry, id: newId(), createdAt: Date.now() };
    setEntries((prev) => [...prev, full]);
    if (syncIdRef.current) upsertEntryRemote(syncIdRef.current, full).catch(warn('addEntry'));
    return full;
  }, []);

  const updateEntry = useCallback(
    (id: string, patch: Partial<Omit<FoodEntry, 'id' | 'createdAt'>>) => {
      const existing = entriesRef.current.find((e) => e.id === id);
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
      if (syncIdRef.current && existing) {
        upsertEntryRemote(syncIdRef.current, { ...existing, ...patch }).catch(warn('updateEntry'));
      }
    },
    [],
  );

  const removeEntry = useCallback((id: string) => {
    const existing = entriesRef.current.find((e) => e.id === id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (syncIdRef.current) {
      deleteEntryRemote(id).catch(warn('removeEntry'));
      if (existing?.photoPath) deletePhoto(existing.photoPath).catch(warn('deletePhoto'));
    }
  }, []);

  const logWeight = useCallback((weightKg: number, date: string = toDateKey()) => {
    const w: WeightEntry = { date, weightKg };
    setWeights((prev) => [...prev.filter((x) => x.date !== date), w]);
    if (syncIdRef.current) upsertWeightRemote(syncIdRef.current, w).catch(warn('logWeight'));
  }, []);

  const removeWeight = useCallback((date: string) => {
    setWeights((prev) => prev.filter((w) => w.date !== date));
    if (syncIdRef.current) deleteWeightRemote(syncIdRef.current, date).catch(warn('removeWeight'));
  }, []);

  const updateGoals = useCallback((goals: Profile['goals']) => {
    setProfile((prev) => ({ ...prev, goals }));
  }, []);

  const setName = useCallback((name: string) => {
    setProfile((prev) => ({ ...prev, name }));
  }, []);

  const setUnits = useCallback((units: UnitSystem) => {
    setProfile((prev) => ({ ...prev, units }));
  }, []);

  const setTheme = useCallback((theme: ThemePreference) => {
    setProfile((prev) => ({ ...prev, theme }));
  }, []);

  const completeOnboarding = useCallback(
    (data: { name: string; metrics: UserMetrics; goals: Profile['goals'] }) => {
      setProfile((prev) => ({
        ...prev,
        name: data.name,
        metrics: data.metrics,
        goals: data.goals,
        onboarded: true,
      }));
      // Seed a starting weight point so the progress chart has an anchor.
      const today = toDateKey();
      setWeights((prev) => {
        if (prev.some((w) => w.date === today)) return prev;
        const seed: WeightEntry = { date: today, weightKg: data.metrics.weightKg };
        if (syncIdRef.current) upsertWeightRemote(syncIdRef.current, seed).catch(warn('seedWeight'));
        return [...prev, seed];
      });
    },
    [],
  );

  const setNotificationsEnabled = useCallback((enabled: boolean) => {
    setProfile((prev) => ({ ...prev, notificationsEnabled: enabled }));
  }, []);

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
    ],
  );

  return <DiaryContext.Provider value={value}>{children}</DiaryContext.Provider>;
}

export function useDiary(): DiaryContextValue {
  const ctx = useContext(DiaryContext);
  if (!ctx) throw new Error('useDiary must be used within a DiaryProvider');
  return ctx;
}
