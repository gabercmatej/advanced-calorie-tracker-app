import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Thin, typed wrapper around AsyncStorage for JSON values.
 * Swap the backing store here (SecureStore, MMKV, a sync server…) without
 * touching call sites.
 */
export const storage = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      console.warn(`[storage] failed to read "${key}"`, err);
      return null;
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn(`[storage] failed to write "${key}"`, err);
    }
  },

  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (err) {
      console.warn(`[storage] failed to remove "${key}"`, err);
    }
  },
};

/** Namespaced storage keys — keep them all here. */
export const StorageKeys = {
  entries: 'calai/entries',
  profile: 'calai/profile',
  weights: 'calai/weights',
  session: 'calai/session',
  /**
   * Ids of entries deleted locally that may still exist in the cloud. Replayed
   * as deletes on the next successful sync, then cleared — without them a merge
   * would resurrect every deleted entry.
   */
  deletedEntries: 'calai/deleted-entries',
  /** Foods the user pinned for one-tap logging (see lib/quick-log.ts). */
  savedFoods: 'calai/saved-foods',
  /**
   * Products the user has scanned, newest first (see lib/product-memory.ts).
   *
   * This is what makes "1 scoop protein powder" resolve to the tub actually in
   * the cupboard, with the label's numbers and no model call. Kept separate
   * from `savedFoods`, which is a list of *meals* pinned for one-tap logging.
   */
  savedProducts: 'calai/saved-products',
  /**
   * The last calorie target that was applied, with the date it was set. Feeds
   * the adaptive plan's rate limiter so the target walks rather than jumps.
   */
  planAnchor: 'calai/plan-anchor',
  /**
   * The Supabase user id whose data currently sits in local storage, or absent
   * if it has never synced. Lets first sign-in adopt existing local history
   * while stopping one account's diary being pushed into another's.
   */
  syncOwner: 'calai/sync-owner',
  /**
   * Prefix for a previous account's local data, set aside (never deleted) when
   * a different account signs in on the same device: `calai/stash/<userId>`.
   */
  stashPrefix: 'calai/stash/',
  /**
   * In-progress onboarding answers, saved on every step.
   *
   * Onboarding happens *before* an account exists, and email verification then
   * forces the user out of the app to open their inbox — which on iOS is a very
   * good chance of the app being killed. Without this, coming back means
   * starting the wizard from the first question. Cleared once the plan is saved.
   */
  onboardingDraft: 'calai/onboarding-draft',
  /** Ingredient ids the user has on hand (drives recipe filtering). */
  pantry: 'calai/pantry',
  /** Recipe ids the user hearted. */
  favoriteRecipes: 'calai/favorite-recipes',
  /** Recipe ids the user dismissed — never shown again. */
  hiddenRecipes: 'calai/hidden-recipes',
  /** Recipes returned by the model, kept so they survive a reload. */
  generatedRecipes: 'calai/generated-recipes',
  /** Transcript of the Ask surface on the Food tab. */
  foodChat: 'calai/food-chat',
} as const;
