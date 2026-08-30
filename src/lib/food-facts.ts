import {
  defaultPortion,
  FOOD_LIBRARY,
  proteinPer100Kcal,
  scaleFood,
  type LibraryFood,
} from '@/lib/food-library';
import type { Macros } from '@/types';

/**
 * Per-serving view of the food library.
 *
 * Three callers want food facts as "one sensible serving" rather than per 100 g:
 *  - the offline estimate heuristic in `ai.ts`, when there is no API key;
 *  - the Ask surface's offline answerer;
 *  - the retrieval context sent to Claude, so it answers from this table rather
 *    than from memory.
 *
 * This used to be a separate hand-written table of about sixty foods, which
 * meant two corpora drifting apart. It is now derived from `food-library.ts`,
 * so every food added for quick-logging also improves the offline estimate and
 * the Ask answers, and the numbers can never disagree between them.
 */

export interface FoodFact {
  /** Canonical name, also the primary keyword matched in free text. */
  name: string;
  /** Extra keywords that should resolve to this entry. */
  aliases?: string[];
  /** Human-readable serving the numbers describe. */
  serving: string;
  calories: number;
  macros: Macros;
  /** Dietary fibre in grams for the stated serving. */
  fiber: number;
}

function toFact(food: LibraryFood): FoodFact {
  const portion = defaultPortion(food);
  const n = scaleFood(food, portion.grams);
  return {
    name: food.name.toLowerCase(),
    aliases: food.aliases,
    serving: portion.label,
    calories: n.calories,
    macros: { protein: n.protein, carbs: n.carbs, fat: n.fat },
    fiber: n.fiber,
  };
}

export const FOOD_FACTS: FoodFact[] = FOOD_LIBRARY.map(toFact);

/** Every keyword (name + aliases) that resolves to a given fact. */
function keywordsFor(fact: FoodFact): string[] {
  return [fact.name, ...(fact.aliases ?? [])];
}

/**
 * Facts whose name or aliases appear in `text`. Longer keywords win, so
 * "chicken breast" doesn't also match the bare "chicken" entry.
 */
export function matchFoodFacts(text: string): FoodFact[] {
  const haystack = text.toLowerCase();
  const hits: { fact: FoodFact; keyword: string }[] = [];

  for (const fact of FOOD_FACTS) {
    const keyword = keywordsFor(fact)
      .filter((k) => haystack.includes(k))
      .sort((a, b) => b.length - a.length)[0];
    if (keyword) hits.push({ fact, keyword });
  }

  // Drop a hit when a longer matched keyword fully contains it ("chicken" vs
  // "chicken breast"), so overlapping entries aren't double-counted.
  return hits
    .filter(
      ({ keyword }) =>
        !hits.some((other) => other.keyword !== keyword && other.keyword.includes(keyword)),
    )
    .map(({ fact }) => fact);
}

/** Grams of protein per 100 kcal — the "lean-ness" ranking for the Ask surface. */
export function proteinDensity(fact: FoodFact): number {
  if (fact.calories <= 0) return 0;
  return (fact.macros.protein / fact.calories) * 100;
}

/** The `count` most protein-dense foods, best first. */
export function leanestFoods(count = 10): FoodFact[] {
  return FOOD_LIBRARY.filter((f) => f.per100.protein >= 10)
    .sort((a, b) => proteinPer100Kcal(b) - proteinPer100Kcal(a))
    .slice(0, count)
    .map(toFact);
}

/** One compact line per fact, for stuffing into a model prompt. */
export function formatFact(fact: FoodFact): string {
  const { protein, carbs, fat } = fact.macros;
  const fiber = fact.fiber > 0 ? `, ${fact.fiber}g fibre` : '';
  return `${fact.name} (${fact.serving}): ${fact.calories} kcal, ${protein}g protein, ${carbs}g carbs, ${fat}g fat${fiber}`;
}

/**
 * A bounded slice of the table for prompt context.
 *
 * The corpus is now three hundred foods; pasting all of it into every Ask
 * request would add thousands of tokens to a question that usually needs a
 * dozen rows. Callers pass whatever the question actually matched and this
 * tops it up with common staples to a fixed ceiling.
 */
export function factsForPrompt(matched: FoodFact[], limit = 60): FoodFact[] {
  const chosen = new Map<string, FoodFact>();
  for (const fact of matched.slice(0, limit)) chosen.set(fact.name, fact);
  for (const fact of FOOD_FACTS) {
    if (chosen.size >= limit) break;
    chosen.set(fact.name, fact);
  }
  return [...chosen.values()];
}
