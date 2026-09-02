/**
 * How much of a known product was actually eaten.
 *
 * A barcode answers one question — *what is this and what is its nutrition
 * density* — and the meal description answers a different one: *how much of it
 * did you have*. Conflating the two is the bug this file exists to make
 * impossible. A label that reads "360 kcal per 100 g" is not a claim that
 * anyone ate 100 g, and a tub whose figures are stored per 100 g does not know
 * that a scoop is half of one.
 *
 * So the reference amount and the consumed amount are separate inputs here, and
 * scaling is arithmetic rather than a model call: a product with real numbers
 * never needs one, and a deterministic multiply cannot hallucinate.
 *
 * The one thing this must never do is guess a conversion it does not have. A
 * scoop of a product that is only known per 100 g is genuinely unknown, and the
 * honest output is `unresolved` — a visible question — not a silent 100 g.
 */

import { type MeasureUnit, type Quantity } from '@/lib/meal-parse';
import type { Macros } from '@/types';

export interface NutritionRef {
  calories: number;
  macros: Macros;
  fiber?: number;
}

/**
 * Everything known about a product's amounts, from a barcode lookup.
 *
 * `perServing` is nutrition for one of whatever the label calls a serving;
 * `per100` is the density. `servingIsReference` marks the case where the
 * database had no per-serving figures at all and the "serving" is really just
 * the 100 g reference block wearing a label — the exact situation in which a
 * scoop or a can cannot be converted.
 */
export interface ProductBasis {
  perServing: NutritionRef;
  /** What the label calls one serving: "1 scoop (30 g)", "100 g", "1 can". */
  servingLabel?: string;
  per100?: NutritionRef;
  /** Grams (or millilitres) in one serving, when the label stated it. */
  servingGrams?: number;
  liquid?: boolean;
  /** True when "one serving" is only the 100 g reference, not a stated portion. */
  servingIsReference?: boolean;
}

export type ScaledAmount =
  | {
      kind: 'scaled';
      nutrition: NutritionRef;
      quantity: number;
      unit: string;
      /** False when a unit had to be read as the label's serving. */
      exact: boolean;
    }
  | {
      kind: 'unresolved';
      quantity: number;
      unit: string;
      /** Plain-language reason, shown to the user rather than swallowed. */
      reason: string;
    };

const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Multiply a nutrition block, rounding only at the end.
 *
 * Everything upstream stays in floats: rounding 70/100 of a 360 kcal label at
 * each step is how 252 becomes 251 or 253, and the drift compounds across
 * macros.
 */
export function scaleNutrition(base: NutritionRef, factor: number): NutritionRef {
  return {
    calories: round(base.calories * factor),
    macros: {
      protein: round1(base.macros.protein * factor),
      carbs: round1(base.macros.carbs * factor),
      fat: round1(base.macros.fat * factor),
    },
    // Undefined stays undefined: "the label did not say" is not "zero".
    fiber: base.fiber == null ? undefined : round1(base.fiber * factor),
  };
}

/** The words a label uses for each countable unit. */
const UNIT_WORDS: Partial<Record<MeasureUnit, RegExp>> = {
  can: /\b(?:can|tin)s?\b/,
  scoop: /\bscoops?\b/,
  slice: /\bslices?\b/,
  piece: /\b(?:piece|pcs?|unit)s?\b/,
  serving: /\b(?:serving|portion)s?\b/,
  package: /\b(?:package|packet|pack|sachet)s?\b/,
  bottle: /\bbottles?\b/,
  bar: /\bbars?\b/,
  egg: /\beggs?\b/,
  tbsp: /\b(?:tbsp|tablespoons?)\b/,
  tsp: /\b(?:tsp|teaspoons?)\b/,
  cup: /\bcups?\b/,
  handful: /\bhandfuls?\b/,
  bowl: /\bbowls?\b/,
  glass: /\bglass(?:es)?\b/,
};

/**
 * Whether the label counts in this unit — "1 scoop (30 g)" does count scoops,
 * "100 g" does not. This is what separates a conversion we hold from one we
 * would have to invent.
 */
export function servingDenotes(label: string | undefined, unit: MeasureUnit): boolean {
  const words = UNIT_WORDS[unit];
  if (!label || !words) return false;
  return words.test(label.toLowerCase());
}

/** Grams or millilitres in one of `unit`, when the label lets us say. */
export function gramsPerUnit(basis: ProductBasis, unit: MeasureUnit): number | undefined {
  if (unit === 'g' || unit === 'ml') return 1;
  if (!basis.servingGrams || basis.servingGrams <= 0) return undefined;
  if (basis.servingIsReference) return undefined;
  if (unit === 'serving' || servingDenotes(basis.servingLabel, unit)) return basis.servingGrams;
  return undefined;
}

/** A weight or volume, against the density if there is one, else the serving. */
function scaleByWeight(basis: ProductBasis, quantity: Quantity): ScaledAmount {
  const { amount, unit } = quantity;
  if (basis.per100) {
    return {
      kind: 'scaled',
      nutrition: scaleNutrition(basis.per100, amount / 100),
      quantity: amount,
      unit,
      exact: true,
    };
  }
  if (basis.servingGrams && basis.servingGrams > 0) {
    return {
      kind: 'scaled',
      nutrition: scaleNutrition(basis.perServing, amount / basis.servingGrams),
      quantity: amount,
      unit,
      exact: true,
    };
  }
  return {
    kind: 'unresolved',
    quantity: amount,
    unit,
    reason: 'the label gives no weight to scale from',
  };
}

/**
 * Nutrition for the amount the user described.
 *
 * With no described amount the caller's own count wins — that is the stepper
 * next to a scanned product, which is a deliberate act rather than a default.
 * With one, the description is absolute: "70 g oatmeal" means seventy grams in
 * total, whatever the label's reference amount happens to be and however many
 * times the barcode was scanned.
 */
export function scaleProduct(
  basis: ProductBasis,
  quantity: Quantity | undefined,
  servings = 1,
): ScaledAmount {
  if (!quantity) {
    const count = Math.max(1, servings);
    return {
      kind: 'scaled',
      nutrition: scaleNutrition(basis.perServing, count),
      quantity: count,
      unit: 'serving',
      exact: true,
    };
  }

  const { amount, unit } = quantity;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { kind: 'unresolved', quantity: amount, unit, reason: 'the amount is not a number' };
  }

  if (unit === 'g' || unit === 'ml') return scaleByWeight(basis, quantity);

  // A serving is whatever the label says a serving is, always.
  if (unit === 'serving' || servingDenotes(basis.servingLabel, unit)) {
    return {
      kind: 'scaled',
      nutrition: scaleNutrition(basis.perServing, amount),
      quantity: amount,
      unit,
      exact: true,
    };
  }

  // Nothing but the 100 g reference block. A scoop is not 100 g, and pretending
  // otherwise is exactly the silent doubling this file exists to prevent.
  if (basis.servingIsReference) {
    return {
      kind: 'unresolved',
      quantity: amount,
      unit,
      reason: `this product is only known per 100 ${basis.liquid ? 'ml' : 'g'}, so one ${unit} is an unknown amount`,
    };
  }

  // The label states a real portion but does not count in this unit. Reading it
  // as one portion is a small, stated assumption rather than a silent one.
  return {
    kind: 'scaled',
    nutrition: scaleNutrition(basis.perServing, amount),
    quantity: amount,
    unit,
    exact: false,
  };
}
