import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { RECIPES } from '@/lib/recipe-data';
import { assertRecipeData } from '@/lib/recipes';
import { StorageKeys, storage } from '@/lib/storage';
import type { ChatMessage, Recipe } from '@/types';

/**
 * State for the Food tab: what's in the kitchen, which ideas the user hearted
 * or dismissed, ideas the model produced, and the Ask transcript.
 *
 * Deliberately separate from `DiaryContext`, which is already the app's largest
 * store and has nothing to do with any of this. It reads diary data through
 * `useDiary()` at the point of use rather than duplicating it here.
 *
 * Unlike the diary, this is *not* part of the splash gate in `_layout.tsx` —
 * the Food tab shows a skeleton while it hydrates, so app start-up is unchanged.
 */

interface FoodContextValue {
  ready: boolean;
  /** Ingredient ids the user has on hand. Empty means "not set up yet". */
  pantry: Set<string>;
  favorites: Set<string>;
  hidden: Set<string>;
  /** Bundled recipes plus anything the model generated, de-duplicated. */
  library: Recipe[];
  chat: ChatMessage[];
  togglePantry: (id: string) => void;
  setPantry: (ids: string[]) => void;
  toggleFavorite: (id: string) => void;
  hideRecipe: (id: string) => void;
  addGenerated: (recipes: Recipe[]) => void;
  clearGenerated: () => void;
  appendChat: (message: ChatMessage) => void;
  clearChat: () => void;
}

const FoodContext = createContext<FoodContextValue | null>(null);

export function FoodProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [pantry, setPantryState] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [generated, setGenerated] = useState<Recipe[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);

  // --- Hydration -----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      assertRecipeData();
      const [savedPantry, savedFavorites, savedHidden, savedGenerated, savedChat] = await Promise.all([
        storage.get<string[]>(StorageKeys.pantry),
        storage.get<string[]>(StorageKeys.favoriteRecipes),
        storage.get<string[]>(StorageKeys.hiddenRecipes),
        storage.get<Recipe[]>(StorageKeys.generatedRecipes),
        storage.get<ChatMessage[]>(StorageKeys.foodChat),
      ]);
      if (cancelled) return;
      if (savedPantry) setPantryState(new Set(savedPantry));
      if (savedFavorites) setFavorites(new Set(savedFavorites));
      if (savedHidden) setHidden(new Set(savedHidden));
      if (savedGenerated) setGenerated(savedGenerated);
      if (savedChat) setChat(savedChat);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Persistence (Sets are stored as arrays) -----------------------------
  useEffect(() => {
    if (ready) storage.set(StorageKeys.pantry, [...pantry]);
  }, [pantry, ready]);

  useEffect(() => {
    if (ready) storage.set(StorageKeys.favoriteRecipes, [...favorites]);
  }, [favorites, ready]);

  useEffect(() => {
    if (ready) storage.set(StorageKeys.hiddenRecipes, [...hidden]);
  }, [hidden, ready]);

  useEffect(() => {
    if (ready) storage.set(StorageKeys.generatedRecipes, generated);
  }, [generated, ready]);

  useEffect(() => {
    if (ready) storage.set(StorageKeys.foodChat, chat);
  }, [chat, ready]);

  // --- Actions -------------------------------------------------------------
  /** Add `id` if absent, remove it if present, without mutating the old Set. */
  function toggled(previous: Set<string>, id: string): Set<string> {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  const togglePantry = useCallback((id: string) => {
    setPantryState((prev) => toggled(prev, id));
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => toggled(prev, id));
  }, []);

  const setPantry = useCallback((ids: string[]) => setPantryState(new Set(ids)), []);

  const hideRecipe = useCallback((id: string) => {
    setHidden((prev) => new Set(prev).add(id));
    // A hidden recipe should not stay hearted.
    setFavorites((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const addGenerated = useCallback((recipes: Recipe[]) => {
    setGenerated((prev) => {
      const seen = new Set(prev.map((r) => r.id));
      // Bundled recipes win on id collision, so a generated duplicate is dropped.
      const bundled = new Set(RECIPES.map((r) => r.id));
      const fresh = recipes.filter((r) => !seen.has(r.id) && !bundled.has(r.id));
      // Keep the list bounded so storage doesn't grow without limit.
      return [...fresh, ...prev].slice(0, 40);
    });
  }, []);

  const clearGenerated = useCallback(() => setGenerated([]), []);

  const appendChat = useCallback((message: ChatMessage) => {
    setChat((prev) => [...prev, message].slice(-60));
  }, []);

  const clearChat = useCallback(() => setChat([]), []);

  const library = useMemo(() => [...generated, ...RECIPES], [generated]);

  const value = useMemo<FoodContextValue>(
    () => ({
      ready,
      pantry,
      favorites,
      hidden,
      library,
      chat,
      togglePantry,
      setPantry,
      toggleFavorite,
      hideRecipe,
      addGenerated,
      clearGenerated,
      appendChat,
      clearChat,
    }),
    [
      ready,
      pantry,
      favorites,
      hidden,
      library,
      chat,
      togglePantry,
      setPantry,
      toggleFavorite,
      hideRecipe,
      addGenerated,
      clearGenerated,
      appendChat,
      clearChat,
    ],
  );

  return <FoodContext.Provider value={value}>{children}</FoodContext.Provider>;
}

export function useFood(): FoodContextValue {
  const ctx = useContext(FoodContext);
  if (!ctx) throw new Error('useFood must be used within a FoodProvider');
  return ctx;
}
