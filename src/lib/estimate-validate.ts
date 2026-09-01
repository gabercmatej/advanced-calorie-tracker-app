/**
 * Stage C of the food estimator: check the answer against what the user said,
 * before anyone sees it.
 *
 * A language model asked for a meal breakdown will occasionally add an
 * ingredient nobody mentioned, quietly drop one that was mentioned, or return a
 * headline total that disagrees with its own components. None of those are
 * visible in the UI — they look exactly like a correct answer — which is what
 * makes them dangerous in a calorie tracker.
 *
 * Every check here is deterministic, so the normal case costs nothing. Most
 * failures are also *repaired* here rather than sent back to the model: an
 * invented ingredient is dropped, a stated calorie count is restored, a count
 * of one that should have been three is scaled. Only a genuinely missing food
 * needs the model again, which is what keeps the average meal at one call.
 *
 * The rule the whole file serves: never invent something the user did not
 * report, never ignore something they did, never override an exact number with
 * a guess.
 */

import { isCountable, statedCalories, describeMention, type FoodMention } from '@/lib/meal-parse';
import type { EntryItem, ItemSource, Macros } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A component while it is still being checked — carries the model's evidence claim. */
export interface WorkingComponent extends EntryItem {
  /** What the model said this was based on. Absent on components we built. */
  evidence?: 'description' | 'vision' | 'inferred';
}

export type IssueCode =
  | 'missing-food'
  | 'invented-ingredient'
  | 'quantity-mismatch'
  | 'constraint-violated'
  | 'arithmetic'
  | 'unresolved';

export interface ValidationIssue {
  code: IssueCode;
  /** The food or number at fault. */
  subject: string;
  /** Written so it can be sent straight back to the model as a correction. */
  message: string;
  /** True when this file already fixed it without another model call. */
  repaired: boolean;
}

export interface Totals {
  calories: number;
  macros: Macros;
  fiber?: number;
}

export interface ValidationInput {
  mentions: FoodMention[];
  components: WorkingComponent[];
  /** True when photos were supplied — the only thing that licenses a food nobody named. */
  hasPhotos: boolean;
  /** The model's own headline total, when it gave one, purely so we can check it. */
  reportedTotals?: Totals;
}

export interface ValidationResult {
  components: WorkingComponent[];
  totals: Totals;
  issues: ValidationIssue[];
  /** Mentions still not represented by any component. These need the model, or the user. */
  uncovered: FoodMention[];
  confidence: number;
  /** True when nothing is left that another model call could fix. */
  ok: boolean;
}

// ---------------------------------------------------------------------------
// Name matching
// ---------------------------------------------------------------------------

/**
 * Tokens that cannot, on their own, prove that a component covers a mention.
 * "protein powder" must not be considered covered by a component called
 * "milk powder", and "big bowl of rice" must not be covered by "fruit bowl".
 */
const WEAK_TOKENS = new Set([
  'powder', 'shake', 'mix', 'drink', 'meal', 'food', 'plain', 'whole', 'large',
  'small', 'medium', 'fresh', 'homemade', 'bowl', 'plate', 'portion', 'serving',
  'side', 'piece', 'pieces', 'cooked', 'raw', 'canned', 'tinned', 'dried',
]);

/** Different words for the same food, collapsed to one token. */
const SYNONYMS: Record<string, string> = {
  yoghurt: 'yogurt', yogurt: 'yogurt', skyr: 'yogurt',
  roll: 'bread', bun: 'bread', loaf: 'bread', baguette: 'bread',
  toast: 'bread', bread: 'bread', ciabatta: 'bread',
  oat: 'oat', oats: 'oat', oatmeal: 'oat', porridge: 'oat',
  whey: 'protein', gainer: 'protein', isolate: 'protein', casein: 'protein',
  tomatoe: 'tomato', tomato: 'tomato',
  tuna: 'tuna', tunafish: 'tuna',
  crisps: 'chips', fries: 'chips',
  prawn: 'shrimp', prawns: 'shrimp',
  aubergine: 'eggplant', courgette: 'zucchini',
  mince: 'ground', minced: 'ground',
};

/** Crude but predictable stemming — enough to make plurals match. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => SYNONYMS[w] ?? SYNONYMS[stem(w)] ?? stem(w));
}

/**
 * Whether a component accounts for a mention.
 *
 * One shared strong token is enough — "3 cans of tuna, oil drained" is covered
 * by "Tuna, canned in water". When a mention is made only of weak words, every
 * one of them has to match, so vagueness cannot accidentally satisfy itself.
 */
export function componentCovers(component: { name: string }, mention: FoodMention): boolean {
  const want = tokenize(mention.phrase);
  if (want.length === 0) return false;
  const have = new Set(tokenize(component.name));
  const strong = want.filter((t) => !WEAK_TOKENS.has(t));
  if (strong.length > 0) return strong.some((t) => have.has(t));
  return want.every((t) => have.has(t));
}

// ---------------------------------------------------------------------------
// Invented ingredients
// ---------------------------------------------------------------------------

/**
 * Ingredients a recipe usually contains but a meal often doesn't.
 *
 * These are exactly the things a model "completes" a dish with — the drizzle of
 * honey nobody poured, the knob of butter nobody used. Each one is cheap to add
 * and expensive to be wrong about, because they are calorie-dense and invisible
 * in a photo. So they need to have been named, or clearly seen.
 */
const OPTIONAL_INGREDIENT =
  /\b(honey|sugar|sweetener|syrup|agave|maple|jam|marmalade|nutella|chocolate\s*chips?|oil|butter|margarine|ghee|dressing|vinaigrette|mayo|mayonnaise|ketchup|sauce|gravy|cream|creme|crème|milk|cheese|nuts|seeds|granola|croutons|bacon\s*bits|sprinkles|topping|condiment|spread|drizzle|glaze)\b/i;

/** How sure the model has to be about seeing an unnamed extra to keep it. */
const VISION_CONFIDENCE_FLOOR = 0.75;

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function sumComponents(components: EntryItem[]): Totals {
  let fiberKnown = false;
  const totals = components.reduce<Totals>(
    (acc, c) => {
      if (c.fiber != null) fiberKnown = true;
      return {
        calories: acc.calories + (c.calories || 0),
        macros: {
          protein: acc.macros.protein + (c.macros?.protein || 0),
          carbs: acc.macros.carbs + (c.macros?.carbs || 0),
          fat: acc.macros.fat + (c.macros?.fat || 0),
        },
        fiber: (acc.fiber ?? 0) + (c.fiber ?? 0),
      };
    },
    { calories: 0, macros: { protein: 0, carbs: 0, fat: 0 }, fiber: 0 },
  );
  return {
    calories: round(totals.calories),
    macros: {
      protein: round1(totals.macros.protein),
      carbs: round1(totals.macros.carbs),
      fat: round1(totals.macros.fat),
    },
    // Undefined rather than 0 when no component knew its fibre: "not known" and
    // "none" are different facts and the UI shows them differently.
    fiber: fiberKnown ? round1(totals.fiber ?? 0) : undefined,
  };
}

/** How far a total may drift from the sum of its parts before it is a bug. */
function withinTolerance(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(25, b * 0.05);
}

/** Rescale a component's macros with its calories, so a repair stays coherent. */
function scaleComponent(component: WorkingComponent, factor: number): WorkingComponent {
  return {
    ...component,
    calories: round(component.calories * factor),
    macros: {
      protein: round1(component.macros.protein * factor),
      carbs: round1(component.macros.carbs * factor),
      fat: round1(component.macros.fat * factor),
    },
    fiber: component.fiber == null ? undefined : round1(component.fiber * factor),
  };
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

/** What each kind of evidence is worth before anything goes wrong. */
const SOURCE_CONFIDENCE: Record<ItemSource, number> = {
  user: 0.99,
  label: 0.97,
  saved: 0.95,
  library: 0.7,
  estimate: 0.6,
  unresolved: 0,
};

/**
 * Confidence the user can act on.
 *
 * Calorie-weighted, so a scanned protein powder next to a guessed side salad
 * reads as mostly-known, and then capped hard by what went wrong: a meal
 * missing a food the user named is not 75% right, it is incomplete, and the
 * number has to say so.
 */
export function computeConfidence(
  components: WorkingComponent[],
  uncovered: FoodMention[],
  issues: ValidationIssue[],
): number {
  const weighted = components.reduce(
    (acc, c) => {
      const conf = c.confidence ?? SOURCE_CONFIDENCE[c.source];
      const weight = Math.max(c.calories, 1);
      return { sum: acc.sum + conf * weight, weight: acc.weight + weight };
    },
    { sum: 0, weight: 0 },
  );
  let confidence = weighted.weight > 0 ? weighted.sum / weighted.weight : 0.4;

  if (components.some((c) => c.source === 'unresolved')) confidence = Math.min(confidence, 0.35);
  if (uncovered.length > 0) confidence = Math.min(confidence, 0.4);
  if (issues.some((i) => i.repaired)) confidence *= 0.9;

  return Math.max(0.05, Math.min(0.99, Math.round(confidence * 100) / 100));
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

/**
 * Reconcile a breakdown against the description it came from.
 *
 * Returns repaired components and recomputed totals — the totals are always the
 * sum of the parts, which makes the "components add to 760 but the meal says
 * 490" failure structurally impossible rather than merely unlikely.
 */
export function validateEstimate(input: ValidationInput): ValidationResult {
  const { mentions, hasPhotos } = input;
  const issues: ValidationIssue[] = [];
  let components = [...input.components];

  // --- 1. Drop ingredients nobody reported ---------------------------------
  // Only meaningful when the user described the meal: with a photo and no
  // words, there is nothing to contradict, and everything is a visual finding.
  if (mentions.length > 0) {
    const kept: WorkingComponent[] = [];
    for (const component of components) {
      const named = mentions.some((m) => componentCovers(component, m));
      const optional = OPTIONAL_INGREDIENT.test(component.name);
      const seen =
        hasPhotos &&
        component.evidence === 'vision' &&
        (component.confidence ?? 0) >= VISION_CONFIDENCE_FLOOR;
      const exact = component.source === 'user' || component.source === 'label' || component.source === 'saved';

      if (!named && optional && !seen && !exact) {
        issues.push({
          code: 'invented-ingredient',
          subject: component.name,
          message: `Removed "${component.name}" (${component.calories} kcal): it was not mentioned and not clearly visible.`,
          repaired: true,
        });
        continue;
      }
      kept.push(component);
    }
    components = kept;
  }

  // --- 2. Restore counts the user gave -------------------------------------
  for (const mention of mentions) {
    const q = mention.quantity;
    if (!q) continue;
    const index = components.findIndex((c) => componentCovers(c, mention));
    if (index === -1) continue;
    const component = components[index];
    // Only comparable when the component counts the same kind of thing. A
    // component in grams may legitimately express "3 cans" as 435 g.
    if (component.unit !== q.unit || !component.quantity || component.quantity <= 0) continue;
    if (Math.abs(component.quantity - q.amount) < 0.01) continue;

    const factor = q.amount / component.quantity;
    components[index] = { ...scaleComponent(component, factor), quantity: q.amount, unit: q.unit };
    issues.push({
      code: 'quantity-mismatch',
      subject: mention.phrase,
      message: `"${describeMention(mention)}" was counted as ${component.quantity} ${component.unit}; rescaled to ${q.amount}.`,
      repaired: true,
    });
  }

  // --- 3. Honour numbers the user stated outright --------------------------
  for (const mention of mentions) {
    const stated = mention.stated;
    if (!stated) continue;
    const target = statedCalories(mention);
    const index = components.findIndex((c) => componentCovers(c, mention));
    if (index === -1) continue; // handled as a missing food below

    const component = components[index];
    let next = component;

    if (target != null && Math.abs(component.calories - target) > Math.max(1, target * 0.02)) {
      // Macros ride along with the correction so the component stays coherent;
      // with no calories to scale from, they are left as estimated.
      next = component.calories > 0 ? scaleComponent(component, target / component.calories) : component;
      next = { ...next, calories: round(target) };
      issues.push({
        code: 'constraint-violated',
        subject: mention.phrase,
        message: `"${mention.phrase}" was stated as ${round(target)} kcal but came back as ${component.calories}; restored to ${round(target)}.`,
        repaired: true,
      });
    }

    // A stated macro is a fact in its own right, whatever the calories did.
    const macros = { ...next.macros };
    const perUnit = stated.basis === 'perUnit' && mention.quantity && isCountable(mention.quantity.unit)
      ? mention.quantity.amount
      : 1;
    if (stated.protein != null) macros.protein = round1(stated.protein * perUnit);
    if (stated.carbs != null) macros.carbs = round1(stated.carbs * perUnit);
    if (stated.fat != null) macros.fat = round1(stated.fat * perUnit);
    const fiber = stated.fiber != null ? round1(stated.fiber * perUnit) : next.fiber;

    components[index] = {
      ...next,
      macros,
      fiber,
      // The numbers are now the user's, so the provenance has to say so.
      source: target != null ? 'user' : next.source,
      confidence: target != null ? 0.99 : next.confidence,
    };
  }

  // --- 4. Every named food must be somewhere -------------------------------
  const uncovered = mentions.filter((m) => !components.some((c) => componentCovers(c, m)));
  for (const mention of uncovered) {
    issues.push({
      code: 'missing-food',
      subject: mention.phrase,
      message: `"${describeMention(mention)}" was named but is missing from the breakdown.`,
      repaired: false,
    });
  }

  // --- 5. Arithmetic --------------------------------------------------------
  const totals = sumComponents(components);
  if (input.reportedTotals && !withinTolerance(input.reportedTotals.calories, totals.calories)) {
    issues.push({
      code: 'arithmetic',
      subject: 'total',
      message: `Reported total ${input.reportedTotals.calories} kcal does not match the components' ${totals.calories} kcal; using the components.`,
      repaired: true,
    });
  }

  // --- 6. The floor a stated number puts under the meal ---------------------
  const statedFloor = mentions.reduce((sum, m) => sum + (statedCalories(m) ?? 0), 0);
  if (statedFloor > 0 && totals.calories + 1 < round(statedFloor)) {
    issues.push({
      code: 'constraint-violated',
      subject: 'total',
      message: `The meal totals ${totals.calories} kcal but the user stated components worth ${round(statedFloor)} kcal on their own.`,
      repaired: false,
    });
  }

  for (const component of components) {
    if (component.source === 'unresolved') {
      issues.push({
        code: 'unresolved',
        subject: component.name,
        message: `"${component.name}" could not be given a number.`,
        repaired: false,
      });
    }
  }

  return {
    components,
    totals,
    issues,
    uncovered,
    confidence: computeConfidence(components, uncovered, issues),
    ok: issues.every((i) => i.repaired),
  };
}

/** The issues that another model call could plausibly fix. */
export function retryableIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter(
    (i) => !i.repaired && (i.code === 'missing-food' || i.code === 'constraint-violated'),
  );
}
