/**
 * The editable draft that sits between an estimate and a diary entry.
 *
 * Pulled out of the logger screen so the last step of the pipeline — what
 * actually gets written to `FoodEntry` — is testable. The screen owns the text
 * fields; this owns what those fields mean. That split matters because the
 * failures this whole pass is about are invisible in the UI: a breakdown can
 * look right on screen while the stored totals disagree with it.
 *
 * Draft numbers are strings because they are bound to text inputs, and a
 * half-typed "1" must not become 1 while the user is still typing "150".
 */

import type { FoodEstimate } from '@/lib/ai';
import { scaleFood, type LibraryFood } from '@/lib/food-library';
import type { EntryItem, FoodEntry, MealType } from '@/types';

export interface Draft {
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  /** Blank when unknown — distinct from a known 0 g. */
  fiber: string;
  quantity: string;
  confidence: number;
  /**
   * Set when the draft came from the food library. Holds the amount in grams so
   * the numbers can be rescaled exactly rather than multiplied by a serving.
   */
  basis?: { foodId: string; grams: number };
  /** Provenance of the original estimate. Display only — edits don't rewrite it. */
  items?: EntryItem[];
  /** The photos were not analysed — offline estimate only. */
  estimatedOffline?: boolean;
  /** Foods named in the description that could not be given a number. */
  needsClarification?: string[];
  /** What validation corrected, shown so a silent repair is never invisible. */
  notes?: string[];
}

const num = (value: string, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
};

/** A draft for `grams` of a library food, with every field rescaled exactly. */
export function draftFromLibrary(food: LibraryFood, grams: number): Draft {
  const n = scaleFood(food, grams);
  return {
    name: food.name,
    calories: String(n.calories),
    protein: String(Math.round(n.protein)),
    carbs: String(Math.round(n.carbs)),
    fat: String(Math.round(n.fat)),
    fiber: String(Math.round(n.fiber)),
    quantity: '1',
    // A reference lookup, not a guess.
    confidence: 1,
    basis: { foodId: food.id, grams },
  };
}

export function draftFromEstimate(estimate: FoodEstimate): Draft {
  return {
    name: estimate.name,
    calories: String(estimate.calories),
    protein: String(Math.round(estimate.macros.protein)),
    carbs: String(Math.round(estimate.macros.carbs)),
    fat: String(Math.round(estimate.macros.fat)),
    fiber: estimate.fiber == null ? '' : String(Math.round(estimate.fiber)),
    quantity: '1',
    confidence: estimate.confidence,
    items: estimate.items,
    estimatedOffline: estimate.estimatedOffline,
    needsClarification: estimate.needsClarification,
    notes: estimate.notes,
  };
}

export interface CommitContext {
  date: string;
  meal: MealType;
  photoUris?: string[];
  /** True when the user typed a description or attached a photo for this meal. */
  captured: boolean;
}

/**
 * Turn a reviewed draft into the row that goes in the diary.
 *
 * `aiEstimated` is decided by provenance rather than by how the screen was
 * used: a meal built entirely from scans, saved products, stated numbers and
 * reference-table lookups was never guessed at, however it was captured.
 */
export function draftToEntry(draft: Draft, context: CommitContext): Omit<FoodEntry, 'id' | 'createdAt'> {
  const uris = context.photoUris ?? [];
  const guessed = draft.items?.some((i) => i.source === 'estimate' || i.source === 'library');
  return {
    name: draft.name.trim() || 'Food',
    date: context.date,
    meal: context.meal,
    calories: Math.round(num(draft.calories)),
    macros: {
      protein: num(draft.protein),
      carbs: num(draft.carbs),
      fat: num(draft.fat),
    },
    fiber: draft.fiber.trim() === '' ? undefined : num(draft.fiber),
    quantity: Math.max(0.25, num(draft.quantity, 1) || 1),
    aiEstimated: guessed ?? context.captured,
    photoUri: uris[0],
    photoUris: uris.length > 1 ? uris : undefined,
    items: draft.items,
  };
}
