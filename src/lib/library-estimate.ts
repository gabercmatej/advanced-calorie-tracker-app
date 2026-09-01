/**
 * Deterministic fallback: turn a named food into numbers using the reference
 * library, with no model call.
 *
 * Two callers need this. The offline path uses it for the whole meal when there
 * is no proxy to reach. The online path uses it as the last thing it tries
 * before admitting defeat on a food the user explicitly named — because
 * "roughly this, from a reference table" is far more useful than dropping the
 * food, and far more honest than inventing a number for it.
 *
 * Deliberately not a search UI: it wants one answer for one phrase, so it
 * degrades from the full phrase to its longest recognisable word rather than
 * returning a list.
 */

import {
  defaultPortion,
  scaleFood,
  searchFoods,
  type LibraryFood,
  type Portion,
} from '@/lib/food-library';
import { isCountable, type FoodMention, type MeasureUnit } from '@/lib/meal-parse';
import type { EntryItem } from '@/types';

/** Words a portion label uses for each countable unit. */
const PORTION_WORDS: Partial<Record<MeasureUnit, RegExp>> = {
  can: /\b(can|tin)\b/i,
  slice: /\bslice/i,
  scoop: /\bscoop/i,
  egg: /\begg/i,
  serving: /\b(portion|serving|pot|bowl)\b/i,
  handful: /\bhandful\b/i,
  bowl: /\b(bowl|portion)\b/i,
  glass: /\bglass\b/i,
  bottle: /\b(bottle|glass)\b/i,
  piece: /\b(medium|piece|whole|1 )\b/i,
  package: /\b(pack|tub|carton|bag)\b/i,
  bar: /\bbar\b/i,
  tbsp: /\btbsp\b/i,
  tsp: /\btsp\b/i,
  cup: /\bcup\b/i,
};

/**
 * Find the one library food a phrase means.
 *
 * "cherry tomatoes" hits directly; "big bowl of cherry tomatoes" only hits once
 * the leading words are dropped, which is why this narrows rather than giving up.
 */
export function findLibraryFood(phrase: string): LibraryFood | undefined {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return undefined;

  // Whole phrase, then progressively shorter tails ("greek yogurt" out of
  // "large greek yogurt"), then the longest single word.
  for (let start = 0; start < words.length; start += 1) {
    const hit = searchFoods(words.slice(start).join(' '), 1)[0];
    if (hit) return hit;
  }
  for (const word of [...words].sort((a, b) => b.length - a.length)) {
    if (word.length < 3) continue;
    const hit = searchFoods(word, 1)[0];
    if (hit) return hit;
  }
  return undefined;
}

/** The portion that best matches a countable unit, or the food's default. */
function portionFor(food: LibraryFood, unit: MeasureUnit): Portion {
  const pattern = PORTION_WORDS[unit];
  const named = pattern ? food.portions.find((p) => pattern.test(p.label)) : undefined;
  return named ?? defaultPortion(food);
}

export interface LibraryEstimate {
  item: EntryItem;
  food: LibraryFood;
  grams: number;
}

/**
 * Estimate one mention from the library.
 *
 * Confidence reflects how much of the answer was actually looked up: an exact
 * weight of a matched food is nearly a fact, a named count is a good guess, and
 * an unqualified food name is barely more than a default portion.
 */
export function estimateFromLibrary(mention: FoodMention): LibraryEstimate | undefined {
  const food = findLibraryFood(mention.phrase);
  if (!food) return undefined;

  const q = mention.quantity;
  let grams: number;
  let confidence: number;

  if (q && (q.unit === 'g' || q.unit === 'ml')) {
    grams = q.amount;
    confidence = 0.85;
  } else if (q && isCountable(q.unit)) {
    const portion = portionFor(food, q.unit);
    grams = portion.grams * q.amount;
    // A unit the food actually lists ("1 can (145 g)") is worth more than one
    // we had to substitute a default portion for.
    confidence = PORTION_WORDS[q.unit]?.test(portion.label) ? 0.7 : 0.55;
  } else {
    grams = defaultPortion(food).grams;
    confidence = 0.5;
  }

  const n = scaleFood(food, grams);
  return {
    food,
    grams,
    item: {
      name: food.name,
      calories: n.calories,
      macros: { protein: n.protein, carbs: n.carbs, fat: n.fat },
      fiber: n.fiber,
      source: 'library',
      quantity: q?.amount ?? grams,
      unit: q?.unit ?? (food.liquid ? 'ml' : 'g'),
      confidence,
    },
  };
}
