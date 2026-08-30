import { callClaudeJson, hasClaudeKey, type ContentBlock } from '@/lib/claude';
import { matchFoodFacts } from '@/lib/food-facts';
import type { PickedPhoto } from '@/lib/image';
import type { EntryItem, Macros } from '@/types';

/**
 * AI food estimation — the "AI" in CalAI.
 *
 * `estimateFood` fuses three kinds of evidence about one meal into a single
 * result:
 *
 *  - **photos** (up to a handful, often the same plate from different angles);
 *  - **a description** ("2 cans of tuna, salad, olive oil");
 *  - **scanned products**, whose nutrition was read off a real label.
 *
 * The important design decision is that scanned products are *never* sent back
 * through the model for re-estimation. We tell the model what they are so it
 * doesn't count them twice, ask it to estimate only the remaining food, and
 * then compose the final total here. That way a label-derived number stays
 * exactly as accurate as the label, and only the genuinely uncertain part of
 * the plate is a guess.
 *
 * With no API key the whole thing degrades to a keyword heuristic over
 * `food-facts.ts`, so the logger never blocks.
 */

export interface FoodEstimate {
  name: string;
  calories: number;
  macros: Macros;
  /** Dietary fibre in grams, when the source knows it. */
  fiber?: number;
  /** Confidence 0..1, surfaced in the UI so users can sanity-check. */
  confidence: number;
  /** Per-component breakdown, when there is one worth showing. */
  items?: EntryItem[];
  /**
   * True when this came from the offline keyword heuristic rather than the
   * vision model — which means any photos were NOT looked at. The UI must say
   * so, otherwise the headline feature degrades invisibly.
   */
  estimatedOffline?: boolean;
}

/** A product whose nutrition came from a scanned barcode. Per single unit. */
export interface KnownItem {
  name: string;
  calories: number;
  macros: Macros;
  /** Dietary fibre per single unit, when the label carried one. */
  fiber?: number;
  /** How many of this product are in the meal. */
  quantity: number;
}

export interface EstimateInput {
  /** Free-text description of the meal. */
  description?: string;
  /** Photos of the meal — treated as one meal from multiple angles. */
  photos?: PickedPhoto[];
  /** Scanned products with exact, label-derived nutrition. */
  knownItems?: KnownItem[];
}

const nonNeg = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

/** Expand a scanned product into a finished breakdown row (per-unit × count). */
function knownToItem(known: KnownItem): EntryItem {
  const q = Math.max(1, Math.round(known.quantity));
  return {
    name: q > 1 ? `${known.name} ×${q}` : known.name,
    calories: nonNeg(known.calories * q),
    macros: {
      protein: nonNeg(known.macros.protein * q),
      carbs: nonNeg(known.macros.carbs * q),
      fat: nonNeg(known.macros.fat * q),
    },
    source: 'label',
  };
}

function sumItems(items: EntryItem[]): { calories: number; macros: Macros } {
  return items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      macros: {
        protein: acc.macros.protein + item.macros.protein,
        carbs: acc.macros.carbs + item.macros.carbs,
        fat: acc.macros.fat + item.macros.fat,
      },
    }),
    { calories: 0, macros: { protein: 0, carbs: 0, fat: 0 } },
  );
}

/** A readable meal name built from the parts we know about. */
function composeName(items: EntryItem[], modelName?: string, description?: string): string {
  if (modelName?.trim()) return modelName.trim();
  if (description?.trim()) return description.trim().slice(0, 60);
  if (items.length === 1) return items[0].name;
  if (items.length > 1) return items.map((i) => i.name.replace(/\s*×\d+$/, '')).join(', ');
  return 'Meal';
}

// ---------------------------------------------------------------------------
// Model call
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  'You are a nutrition estimation expert for a calorie-tracking app. You are given ' +
  'photos of a single meal, an optional text description, and optionally a list of ' +
  'products the user already scanned from their barcodes.\n\n' +
  'Rules:\n' +
  '1. All photos show the SAME meal, often from different angles. Never count the ' +
  'same food twice because it appears in more than one photo.\n' +
  '2. Any scanned products listed are already accounted for with exact label data. ' +
  'DO NOT include them in your numbers. Estimate only the food that is present in ' +
  'addition to them.\n' +
  '3. Break the remaining food into its visible components and give each one its own ' +
  'realistic total for the portion shown, accounting for cooking oil, dressings and ' +
  'sauces you can reasonably infer.\n' +
  '4. If there is no additional food beyond the scanned products, return zero ' +
  'calories and an empty items list.\n' +
  '5. Give the whole meal a short, human-readable name that covers everything, ' +
  'including the scanned products.\n' +
  'Also estimate total dietary fibre in grams for the food you are estimating.\n' +
  'Prefer a slight over-estimate to an under-estimate. Set "confidence" to your ' +
  'certainty 0..1, lower when portions are ambiguous.';

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    calories: { type: 'integer' },
    protein_g: { type: 'integer' },
    carbs_g: { type: 'integer' },
    fat_g: { type: 'integer' },
    fiber_g: { type: 'integer' },
    confidence: { type: 'number' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          calories: { type: 'integer' },
          protein_g: { type: 'integer' },
          carbs_g: { type: 'integer' },
          fat_g: { type: 'integer' },
        },
        required: ['name', 'calories', 'protein_g', 'carbs_g', 'fat_g'],
      },
    },
  },
  required: ['name', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'confidence', 'items'],
} as const;

interface ModelJson {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  confidence: number;
  items: { name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }[];
}

/** The text block that accompanies the images. */
function buildPrompt(input: EstimateInput): string {
  const parts: string[] = [];
  const photoCount = input.photos?.length ?? 0;

  if (photoCount > 1) {
    parts.push(`There are ${photoCount} photos of the same meal, taken from different angles.`);
  } else if (photoCount === 1) {
    parts.push('There is one photo of the meal.');
  }

  if (input.knownItems?.length) {
    const lines = input.knownItems.map((k) => {
      const q = Math.max(1, Math.round(k.quantity));
      return `- ${k.name} ×${q} (already counted: ${nonNeg(k.calories * q)} kcal, ${nonNeg(k.macros.protein * q)}g protein, ${nonNeg(k.macros.carbs * q)}g carbs, ${nonNeg(k.macros.fat * q)}g fat)`;
    });
    parts.push(
      `The user scanned these products, and their nutrition is already known exactly. Exclude them from your numbers:\n${lines.join('\n')}`,
    );
  }

  if (input.description?.trim()) {
    parts.push(`The user described the meal as: "${input.description.trim()}".`);
  }

  parts.push(
    photoCount > 0
      ? 'Estimate the nutrition of everything else on the plate.'
      : 'Estimate the nutrition of everything else described.',
  );

  return parts.join('\n\n');
}

async function estimateWithClaude(input: EstimateInput): Promise<FoodEstimate> {
  const content: ContentBlock[] = [];

  for (const photo of input.photos ?? []) {
    if (!photo.base64) continue;
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: photo.mimeType || 'image/jpeg',
        data: photo.base64,
      },
    });
  }
  content.push({ type: 'text', text: buildPrompt(input) });

  const parsed = await callClaudeJson<ModelJson>({
    system: SYSTEM_PROMPT,
    content,
    schema: OUTPUT_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 900,
  });

  const knownItems = (input.knownItems ?? []).map(knownToItem);

  // The model's items describe only the un-scanned remainder.
  const estimatedItems: EntryItem[] = (parsed.items ?? [])
    .filter((i) => i.name?.trim())
    .map((i) => ({
      name: i.name.trim(),
      calories: nonNeg(i.calories),
      macros: { protein: nonNeg(i.protein_g), carbs: nonNeg(i.carbs_g), fat: nonNeg(i.fat_g) },
      source: 'estimate' as const,
    }));

  // Trust the model's own total for the remainder over the sum of its parts,
  // but fall back to the parts if it omitted the total.
  const modelTotal = {
    calories: nonNeg(parsed.calories),
    macros: {
      protein: nonNeg(parsed.protein_g),
      carbs: nonNeg(parsed.carbs_g),
      fat: nonNeg(parsed.fat_g),
    },
  };
  const remainder = modelTotal.calories > 0 ? modelTotal : sumItems(estimatedItems);

  const knownTotal = sumItems(knownItems);
  const items = [...knownItems, ...estimatedItems];
  const knownFiber = (input.knownItems ?? []).reduce(
    (sum, k) => sum + (k.fiber ?? 0) * Math.max(1, Math.round(k.quantity)),
    0,
  );
  const estimatedFiber = nonNeg(parsed.fiber_g);

  return {
    name: composeName(items, parsed.name, input.description),
    calories: knownTotal.calories + remainder.calories,
    fiber: knownFiber + estimatedFiber,
    macros: {
      protein: knownTotal.macros.protein + remainder.macros.protein,
      carbs: knownTotal.macros.carbs + remainder.macros.carbs,
      fat: knownTotal.macros.fat + remainder.macros.fat,
    },
    // Label data drags confidence up in proportion to how much of the meal it covers.
    confidence: blendConfidence(clamp01(parsed.confidence), knownTotal.calories, remainder.calories),
    items: items.length > 1 ? items : undefined,
  };
}

/**
 * Confidence for the meal as a whole. A plate that is mostly scanned product is
 * mostly exact, however unsure the model was about the side salad.
 */
function blendConfidence(modelConfidence: number, knownCalories: number, estimatedCalories: number): number {
  const total = knownCalories + estimatedCalories;
  if (total <= 0) return knownCalories > 0 ? 0.98 : modelConfidence;
  const labelShare = knownCalories / total;
  return clamp01(labelShare * 0.98 + (1 - labelShare) * modelConfidence);
}

// ---------------------------------------------------------------------------
// Offline heuristic
// ---------------------------------------------------------------------------

/** Simulated latency so the offline path still exercises loading states. */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DEFAULT_ITEM = { calories: 200, macros: { protein: 8, carbs: 20, fat: 9 } };

async function offlineEstimate(input: EstimateInput): Promise<FoodEstimate> {
  await wait(input.photos?.length ? 900 : 500);

  const knownItems = (input.knownItems ?? []).map(knownToItem);
  const description = input.description?.trim() ?? '';

  const matches = matchFoodFacts(description);
  const estimatedItems: EntryItem[] = matches.map((fact) => ({
    name: fact.name,
    calories: fact.calories,
    macros: { ...fact.macros },
    source: 'estimate' as const,
  }));
  const matchedFiber = matches.reduce((sum, fact) => sum + fact.fiber, 0);

  // Nothing recognised but something was captured — fall back to a generic plate.
  if (estimatedItems.length === 0 && knownItems.length === 0) {
    estimatedItems.push({
      name: description || 'Estimated meal',
      calories: DEFAULT_ITEM.calories,
      macros: { ...DEFAULT_ITEM.macros },
      source: 'estimate',
    });
  }

  const items = [...knownItems, ...estimatedItems];
  const totals = sumItems(items);
  const knownCalories = sumItems(knownItems).calories;

  const base = input.photos?.length ? 0.5 : 0.35;
  const heuristicConfidence = matches.length ? Math.min(0.9, base + matches.length * 0.1) : base;

  const knownFiber = (input.knownItems ?? []).reduce(
    (sum, k) => sum + (k.fiber ?? 0) * Math.max(1, Math.round(k.quantity)),
    0,
  );

  return {
    name: composeName(items, undefined, description),
    calories: totals.calories,
    macros: totals.macros,
    fiber: Math.round(matchedFiber + knownFiber),
    confidence: blendConfidence(heuristicConfidence, knownCalories, totals.calories - knownCalories),
    items: items.length > 1 ? items : undefined,
    estimatedOffline: true,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Estimate a meal from any combination of photos, description, and scanned
 * products. Scanned products alone need no model call at all — their numbers
 * are already exact.
 */
export async function estimateFood(input: EstimateInput): Promise<FoodEstimate> {
  const hasPhotos = (input.photos?.length ?? 0) > 0;
  const hasDescription = Boolean(input.description?.trim());
  const knownItems = (input.knownItems ?? []).map(knownToItem);

  // Only scans: nothing to estimate, so don't spend a call guessing.
  if (!hasPhotos && !hasDescription && knownItems.length > 0) {
    const totals = sumItems(knownItems);
    return {
      name: composeName(knownItems),
      calories: totals.calories,
      macros: totals.macros,
      fiber: Math.round(
        (input.knownItems ?? []).reduce(
          (sum, k) => sum + (k.fiber ?? 0) * Math.max(1, Math.round(k.quantity)),
          0,
        ),
      ),
      confidence: 0.98,
      items: knownItems.length > 1 ? knownItems : undefined,
    };
  }

  if (hasClaudeKey) {
    try {
      return await estimateWithClaude(input);
    } catch (err) {
      // Never block logging — degrade to the offline heuristic on any failure.
      console.warn('[ai] Claude estimate failed, using offline heuristic:', err);
    }
  }
  return offlineEstimate(input);
}
