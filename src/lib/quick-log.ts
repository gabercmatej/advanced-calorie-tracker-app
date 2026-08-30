import type { FoodEntry, Macros, MealType, SavedFood } from '@/types';

/**
 * Re-logging food you have eaten before, without spending a model call.
 *
 * On a long cut the same fifteen or twenty meals come round again and again, and
 * the two-hundredth bowl of chicken and rice is exactly as expensive to estimate
 * as the first. Everything here is deterministic and local: recents are derived
 * from the diary itself, saved foods are a list the user curates, and neither
 * touches the network. Photo, description and barcode logging are untouched —
 * they remain the path for food that genuinely is new.
 */

/** A food that can be logged again in one tap. */
export interface QuickFood {
  /** Stable identity — dedupes the list and keys the React rows. */
  key: string;
  name: string;
  /** Calories for a single serving (quantity 1). */
  calories: number;
  macros: Macros;
  fiber?: number;
  /** Recency-weighted log count. Drives ordering; not shown as a raw number. */
  score: number;
  /** How many times this food has been logged, ever. */
  timesLogged: number;
  /** Date key of the most recent time it was logged. */
  lastLogged: string;
  /** The meal slot it is most often eaten in, used to preselect the picker. */
  usualMeal: MealType;
}

/**
 * Two entries are "the same food" when they share a name and a per-serving
 * calorie count. Name alone would merge a 30 g and a 60 g portion of oats into
 * one wrong number; adding calories keeps distinct portions distinct while
 * still collapsing the genuine repeats.
 */
export function foodKey(name: string, calories: number): string {
  return `${name.trim().toLowerCase().replace(/\s+/g, ' ')}|${Math.round(calories)}`;
}

/**
 * Recency-weighted frequency. A meal eaten twenty times last week should
 * outrank one eaten once yesterday, but a food you have not touched in two
 * months should fade rather than sit at the top forever. Each logging
 * contributes half as much for every `HALF_LIFE_DAYS` that have passed.
 */
const HALF_LIFE_DAYS = 14;

function recencyWeight(daysAgo: number): number {
  return Math.pow(0.5, Math.max(0, daysAgo) / HALF_LIFE_DAYS);
}

/** Whole days between two YYYY-MM-DD keys, without pulling in a date library. */
function daysApart(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00`);
  const b = Date.parse(`${to}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** The meal slot that appears most often in a group, ties going to the latest. */
function dominantMeal(entries: FoodEntry[]): MealType {
  const counts = new Map<MealType, number>();
  for (const e of entries) counts.set(e.meal, (counts.get(e.meal) ?? 0) + 1);
  let best: MealType = entries[entries.length - 1].meal;
  let bestCount = 0;
  for (const [meal, count] of counts) {
    if (count > bestCount) {
      best = meal;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Build the "recent" list from logged history.
 *
 * Values come from the *most recent* logging of each food, so correcting an
 * estimate once fixes every future re-log of it. `quantity` is deliberately
 * dropped: a QuickFood is always one serving, and the amount is chosen again
 * at log time.
 */
export function recentFoods(
  entries: FoodEntry[],
  options: { today: string; limit?: number } = { today: '' },
): QuickFood[] {
  const { today, limit = 24 } = options;
  const groups = new Map<string, FoodEntry[]>();

  for (const e of entries) {
    if (!e.name?.trim()) continue;
    const key = foodKey(e.name, e.calories);
    const bucket = groups.get(key);
    if (bucket) bucket.push(e);
    else groups.set(key, [e]);
  }

  const out: QuickFood[] = [];
  for (const [key, group] of groups) {
    const sorted = [...group].sort((a, b) => a.createdAt - b.createdAt);
    const latest = sorted[sorted.length - 1];
    const score = sorted.reduce((sum, e) => sum + recencyWeight(daysApart(e.date, today)), 0);

    out.push({
      key,
      name: latest.name.trim(),
      calories: Math.round(latest.calories),
      // Copied, never shared: the draft this becomes must not be able to reach
      // back and mutate the historical entry it was derived from.
      macros: { ...latest.macros },
      fiber: latest.fiber,
      score,
      timesLogged: group.length,
      lastLogged: sorted.reduce((max, e) => (e.date > max ? e.date : max), sorted[0].date),
      usualMeal: dominantMeal(sorted),
    });
  }

  return out.sort((a, b) => b.score - a.score || (a.lastLogged < b.lastLogged ? 1 : -1)).slice(0, limit);
}

/** A saved (pinned) food, presented in the same shape as a recent one. */
export function savedToQuick(saved: SavedFood): QuickFood {
  return {
    key: `saved:${saved.id}`,
    name: saved.name,
    calories: saved.calories,
    macros: { ...saved.macros },
    fiber: saved.fiber,
    score: Number.POSITIVE_INFINITY,
    timesLogged: 0,
    lastLogged: '',
    usualMeal: saved.usualMeal ?? 'lunch',
  };
}

/**
 * Turn a quick food into a brand-new diary entry.
 *
 * Every nested object is rebuilt rather than referenced. Re-logging is a copy,
 * never an alias — otherwise editing today's portion would silently rewrite the
 * historical entry it came from, and the past would change under you.
 */
export function quickToEntry(
  food: QuickFood,
  meal: MealType,
  date: string,
  quantity = 1,
): Omit<FoodEntry, 'id' | 'createdAt'> {
  return {
    name: food.name,
    date,
    meal,
    calories: food.calories,
    macros: { ...food.macros },
    fiber: food.fiber,
    quantity,
    // A re-log is a database lookup of the user's own past entry, not a fresh
    // model guess — so it must not be badged as AI-estimated.
    aiEstimated: false,
  };
}

/** Whether a saved list already holds this food (name + calories match). */
export function isSaved(saved: SavedFood[], food: { name: string; calories: number }): boolean {
  const key = foodKey(food.name, food.calories);
  return saved.some((s) => foodKey(s.name, s.calories) === key);
}
