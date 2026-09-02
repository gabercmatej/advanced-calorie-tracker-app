/**
 * The food estimator, as a pipeline.
 *
 *   A. Extract deterministically   what the user typed: foods, counts, numbers
 *   B. Resolve what is already known   scanned products, remembered products
 *   C. One model call for the rest, then check the answer against A
 *   D. One corrective call, only if the check found something only the model
 *      can fix
 *
 * The shape exists to make a specific promise cheap to keep: lower-grade
 * evidence never overrides higher-grade evidence. A number the user typed beats
 * a barcode, a barcode beats the model, and the model is only ever asked about
 * the part nobody else can answer. Everything the model is not asked about
 * costs nothing and cannot be got wrong.
 *
 * The model transport is injected rather than imported, so this whole file —
 * including the prompts and every repair rule — is testable without a network,
 * a key, or a Supabase project.
 */

import {
  sumComponents,
  retryableIssues,
  validateEstimate,
  computeConfidence,
  componentCovers,
  type Totals,
  type ValidationIssue,
  type WorkingComponent,
} from '@/lib/estimate-validate';
import { estimateFromLibrary } from '@/lib/library-estimate';
import { formatFact, matchFoodFacts } from '@/lib/food-facts';
import {
  describeMention,
  parseMealDescription,
  statedCalories,
  type FoodMention,
} from '@/lib/meal-parse';
import { markProductUsed, resolveProduct, type SavedProduct } from '@/lib/product-memory';
import {
  scaleProduct,
  type NutritionRef,
  type ProductBasis,
  type ScaledAmount,
} from '@/lib/product-scale';
import type { EntryItem, Macros } from '@/types';

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

/**
 * A product whose nutrition came from a barcode scanned for *this* meal.
 *
 * `calories`/`macros` are one serving and `quantity` is how many servings the
 * stepper is set to. The rest is the label's reference data, and it is what
 * lets a described amount ("70 g", "1 scoop") be converted exactly instead of
 * being ignored in favour of the reference serving.
 */
export interface KnownItem {
  name: string;
  calories: number;
  macros: Macros;
  fiber?: number;
  quantity: number;
  /** The barcode, when this came from a scan — lets memory record the use. */
  barcode?: string;
  /** Per 100 g/ml from the label, when the database had it. */
  per100?: NutritionRef;
  /** Grams (or ml) in one serving, when the label stated it. */
  servingGrams?: number;
  /** What the label calls one serving: "1 scoop (30 g)", "100 g". */
  servingLabel?: string;
  liquid?: boolean;
  /** True when "one serving" is only the 100 g reference block. */
  servingIsReference?: boolean;
}

/** A prompt block. Structurally identical to the transport's own block type. */
export type PromptBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface ModelRequest {
  system: string;
  content: PromptBlock[];
  schema: Record<string, unknown>;
  maxTokens: number;
}

/** The injected transport. Throwing is fine — the caller degrades. */
export type ModelCaller = (request: ModelRequest) => Promise<unknown>;

export interface EstimateRequest {
  description?: string;
  photos?: { base64?: string; mimeType?: string }[];
  /** Products scanned while building this meal. */
  knownItems?: KnownItem[];
  /** Products remembered from earlier scans, newest first. */
  savedProducts?: SavedProduct[];
}

export interface EstimateResult {
  name: string;
  calories: number;
  macros: Macros;
  fiber?: number;
  confidence: number;
  items: EntryItem[];
  /** Foods the user named that still have no numbers. The UI must ask. */
  needsClarification: string[];
  /** What the validator changed, in plain language. */
  notes: string[];
  /** True when no model was reached, so photos were never looked at. */
  estimatedOffline?: boolean;
  /** How many model calls this meal cost. Asserted in tests. */
  modelCalls: number;
  /** Saved products updated with their new usage counts, or undefined if none were used. */
  usedProducts?: SavedProduct[];
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * The rules the model is held to.
 *
 * Rule 2 is the one that matters most and is the reverse of what a helpful
 * assistant does by default: it must not complete the recipe. An earlier
 * version of this prompt asked it to account for "cooking oil, dressings and
 * sauces you can reasonably infer", and it duly added a honey drizzle to a bowl
 * of oats that never had one.
 */
export const SYSTEM_PROMPT = [
  'You are the estimation engine of a calorie tracker. You are given a meal: optionally photos, ',
  'optionally the user\'s own description, a list of components whose nutrition is ALREADY KNOWN ',
  'exactly, and a list of foods you must account for.',
  '',
  'Evidence ranks in this order, and lower-ranked evidence may never override higher-ranked:',
  '  1. numbers the user stated outright   2. known/scanned product data',
  '  3. foods named in the description     4. foods clearly visible in a photo',
  '  5. reasonable inference',
  '',
  'Rules:',
  '1. Every food in "Foods to account for" MUST appear as a component, with the count the user ',
  'gave. Three cans is three cans. If you genuinely cannot estimate one, put it in "unresolved" ',
  'rather than dropping it or folding it into another component.',
  '2. Do NOT invent ingredients. Never add oil, butter, honey, sugar, sweetener, sauce, dressing, ',
  'cheese, milk, cream, nuts, syrup, toppings or condiments unless the user named them or you can ',
  'clearly see them. Do not complete a typical recipe: if the user lists oats, banana and yogurt, ',
  'estimate exactly oats, banana and yogurt. A plausible-but-uncertain ingredient must be omitted.',
  '3. Components listed as already known are counted elsewhere. Do NOT include them or re-estimate ',
  'them. Estimate only what is in "Foods to account for" plus anything clearly visible that the ',
  'user did not mention.',
  '4. Where the user stated a number ("the milk is 150 kcal"), return exactly that number for that ',
  'component and estimate only the parts they did not state.',
  '5. The description is authoritative about WHAT the food is. Photos are evidence about HOW MUCH ',
  'there is and how it was prepared. If they disagree, follow the description. Never let a photo ',
  'delete a food the user named.',
  '6. Honour preparation details. "Oil drained" means the canning oil was poured away — do not ',
  'count it. Respect cooked vs dry weight, skin removed, no sauce, low-fat, 0%, half a package.',
  '7. All photos show ONE meal from different angles. Never count the same food twice.',
  '8. "quantity" and "unit" must describe the amount the component\'s calories cover.',
  '9. Set "evidence" to how you know each component exists: "description" if the user named it, ',
  '"vision" if you can see it in a photo, "inferred" otherwise. Set per-component "confidence" ',
  '0..1 honestly — low when the portion is a guess.',
  '10. Do not return a meal total. The app computes it by adding your components.',
].join('\n');

export const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    components: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
          calories: { type: 'integer' },
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' },
          fiber_g: { type: 'number' },
          evidence: { type: 'string', enum: ['description', 'vision', 'inferred'] },
          confidence: { type: 'number' },
        },
        required: [
          'name', 'quantity', 'unit', 'calories', 'protein_g',
          'carbs_g', 'fat_g', 'fiber_g', 'evidence', 'confidence',
        ],
      },
    },
    unresolved: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { name: { type: 'string' }, reason: { type: 'string' } },
        required: ['name', 'reason'],
      },
    },
  },
  required: ['name', 'components', 'unresolved'],
} as const;

interface ModelComponent {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  evidence: 'description' | 'vision' | 'inferred';
  confidence: number;
}

interface ModelJson {
  name?: string;
  components?: ModelComponent[];
  unresolved?: { name: string; reason: string }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const nonNeg = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, n) : 0);
const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

function clamp01(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5;
}

/** How an amount reads on a component's name: "(70 g)", "×2", or nothing. */
function amountLabel(quantity: number, unit: string): string {
  if (unit === 'serving') return quantity > 1 ? ` ×${round1(quantity)}` : '';
  return ` (${round1(quantity)} ${unit})`;
}

/**
 * A known product plus a described amount, as one finished component.
 *
 * The two inputs answer different questions and are kept apart on purpose: the
 * label supplies the nutrition, the description supplies how much of it was
 * eaten. When the amount cannot be converted the component is `unresolved` with
 * no number rather than quietly falling back to the reference serving — a
 * visible question is recoverable, a wrong number is not.
 */
function productComponent(
  name: string,
  basis: ProductBasis,
  source: 'label' | 'saved',
  mention: FoodMention | undefined,
  servings: number,
): WorkingComponent {
  const scaled: ScaledAmount = scaleProduct(basis, mention?.quantity, servings);

  if (scaled.kind === 'unresolved') {
    return {
      name: `${name} (${round1(scaled.quantity)} ${scaled.unit})`,
      calories: 0,
      macros: { protein: 0, carbs: 0, fat: 0 },
      source: 'unresolved',
      quantity: scaled.quantity,
      unit: scaled.unit,
      confidence: 0,
    };
  }

  return {
    name: `${name}${amountLabel(scaled.quantity, scaled.unit)}`,
    ...scaled.nutrition,
    source,
    quantity: scaled.quantity,
    unit: scaled.unit,
    // An assumed unit is still label data, but it is not the 0.97 that a
    // stated portion earns.
    confidence: scaled.exact ? (source === 'label' ? 0.97 : 0.95) : 0.75,
  };
}

/** The label reference behind a product scanned for this meal. */
function basisOfKnown(known: KnownItem): ProductBasis {
  return {
    perServing: { calories: known.calories, macros: known.macros, fiber: known.fiber },
    servingLabel: known.servingLabel,
    per100: known.per100,
    servingGrams: known.servingGrams,
    liquid: known.liquid,
    servingIsReference: known.servingIsReference,
  };
}

/** The label reference behind a product remembered from an earlier scan. */
function basisOfSaved(product: SavedProduct): ProductBasis {
  return {
    perServing: product.perServing,
    servingLabel: product.perServing.label,
    per100: product.per100,
    servingGrams: product.servingGrams,
    liquid: product.liquid,
    servingIsReference: product.servingIsReference,
  };
}

/** The reference lines given to the model as a sanity anchor, not as an answer. */
function referenceLines(mentions: FoodMention[]): string[] {
  const facts = mentions.flatMap((m) => matchFoodFacts(m.phrase).slice(0, 2));
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const fact of facts) {
    if (seen.has(fact.name)) continue;
    seen.add(fact.name);
    lines.push(formatFact(fact));
    if (lines.length >= 12) break;
  }
  return lines;
}

function constraintLine(mention: FoodMention): string {
  const stated = mention.stated;
  if (!stated) return '';
  const bits: string[] = [];
  const total = statedCalories(mention);
  if (total != null) bits.push(`exactly ${round(total)} kcal in total`);
  else if (stated.calories != null) {
    bits.push(`${stated.calories} kcal ${stated.basis === 'per100' ? 'per 100 g/ml' : 'per unit'}`);
  }
  if (stated.protein != null) bits.push(`${stated.protein} g protein`);
  if (stated.carbs != null) bits.push(`${stated.carbs} g carbs`);
  if (stated.fat != null) bits.push(`${stated.fat} g fat`);
  if (stated.fiber != null) bits.push(`${stated.fiber} g fibre`);
  return bits.length ? `  USER STATED — use exactly: ${bits.join(', ')}` : '';
}

function buildPrompt(
  request: EstimateRequest,
  known: WorkingComponent[],
  required: FoodMention[],
): string {
  const parts: string[] = [];
  const photoCount = request.photos?.length ?? 0;

  if (photoCount > 1) {
    parts.push(`There are ${photoCount} photos of the same meal, from different angles.`);
  } else if (photoCount === 1) {
    parts.push('There is one photo of the meal.');
  } else {
    parts.push('There is no photo — work only from the description.');
  }

  if (request.description?.trim()) {
    parts.push(`The user described the meal as:\n"""\n${request.description.trim()}\n"""`);
  }

  if (known.length) {
    const lines = known.map(
      (k) =>
        `- ${k.name}: ${k.calories} kcal, ${k.macros.protein} g protein, ${k.macros.carbs} g carbs, ${k.macros.fat} g fat`,
    );
    parts.push(
      `ALREADY KNOWN EXACTLY — already counted, do NOT include these in your components:\n${lines.join('\n')}`,
    );
  }

  if (required.length) {
    const lines = required.map((m) => {
      const constraint = constraintLine(m);
      return `- ${describeMention(m)}${constraint ? `\n${constraint}` : ''}`;
    });
    parts.push(`Foods to account for — every one of these MUST appear as a component:\n${lines.join('\n')}`);
  } else if (photoCount > 0) {
    parts.push('Account for every food you can see in the photo.');
  }

  const references = referenceLines(required);
  if (references.length) {
    parts.push(
      `Reference values from the app's food table, for calibration only — the portion in front of you may differ:\n${references.join('\n')}`,
    );
  }

  return parts.join('\n\n');
}

/** The corrective follow-up. Deliberately text-only: the photos were already read. */
function buildCorrection(previous: ModelJson, issues: ValidationIssue[], required: FoodMention[]): string {
  return [
    'Your previous answer failed validation.',
    '',
    'Your answer was:',
    JSON.stringify(previous),
    '',
    'Problems that must be fixed:',
    ...issues.map((i) => `- ${i.message}`),
    '',
    'Foods that must each appear as a component:',
    ...required.map((m) => `- ${describeMention(m)}${constraintLine(m) ? `\n${constraintLine(m)}` : ''}`),
    '',
    'Return corrected JSON in the same schema. Keep every component that was already correct, ',
    'add the missing ones, and do not add anything nobody mentioned.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Model response → components
// ---------------------------------------------------------------------------

function toComponents(parsed: ModelJson): WorkingComponent[] {
  return (parsed.components ?? [])
    .filter((c) => c?.name?.trim())
    .map((c) => ({
      name: c.name.trim(),
      calories: round(nonNeg(c.calories)),
      macros: {
        protein: round1(nonNeg(c.protein_g)),
        carbs: round1(nonNeg(c.carbs_g)),
        fat: round1(nonNeg(c.fat_g)),
      },
      fiber: round1(nonNeg(c.fiber_g)),
      source: 'estimate' as const,
      quantity: typeof c.quantity === 'number' && Number.isFinite(c.quantity) ? c.quantity : undefined,
      unit: typeof c.unit === 'string' && c.unit.trim() ? c.unit.trim().toLowerCase() : undefined,
      confidence: clamp01(c.confidence),
      evidence: c.evidence,
    }));
}

// ---------------------------------------------------------------------------
// Resolution (stage B)
// ---------------------------------------------------------------------------

interface Resolution {
  known: WorkingComponent[];
  required: FoodMention[];
  mentions: FoodMention[];
  usedBarcodes: string[];
  /** Amounts the description changed, said out loud rather than applied quietly. */
  notes: string[];
}

/**
 * Work out what is already known before spending anything.
 *
 * Scanned products come first because they were scanned for this meal;
 * remembered products fill in generic phrases like "protein powder"; whatever
 * is left is what the model is actually asked about.
 *
 * The subtle part is what a scan does *not* settle. A barcode says what the
 * product is and what its nutrition density is; it says nothing about how much
 * of it went into this meal. So a mention that names a scanned product claims
 * it — and if that mention carries an amount, the amount wins over the stepper
 * and over the label's reference serving. Scanning oatmeal whose label reads
 * per 100 g and then writing "70 g oatmeal" used to log 100 g, because the
 * mention was treated as already covered and thrown away here.
 */
export function resolveKnown(request: EstimateRequest): Resolution {
  const { mentions } = parseMealDescription(request.description);
  const items = request.knownItems ?? [];
  /** Which mention, if any, states how much of each scanned product was eaten. */
  const claims: (FoodMention | undefined)[] = items.map(() => undefined);
  const saved: WorkingComponent[] = [];
  const usedBarcodes: string[] = [];
  const required: FoodMention[] = [];
  const notes: string[] = [];

  for (const mention of mentions) {
    // Scanned for this meal. One mention per scan, so "2 scoops whey and a
    // second scoop later" cannot both rewrite the same row.
    const index = items.findIndex(
      (item, i) => !claims[i] && componentCovers({ name: item.name }, mention),
    );
    if (index !== -1) {
      claims[index] = mention;
      continue;
    }
    // Already covered by a product resolved from memory earlier in this loop.
    if (saved.some((c) => componentCovers(c, mention))) continue;

    const match = resolveProduct(request.savedProducts ?? [], mention.phrase);
    if (match) {
      saved.push(
        productComponent(match.product.name, basisOfSaved(match.product), 'saved', mention, 1),
      );
      usedBarcodes.push(match.product.barcode);
      continue;
    }
    required.push(mention);
  }

  const scanned = items.map((item, i) => {
    const mention = claims[i];
    const servings = Math.max(1, Math.round(item.quantity));
    const component = productComponent(item.name, basisOfKnown(item), 'label', mention, servings);
    if (mention?.quantity && servings > 1) {
      notes.push(
        `"${item.name}" was scanned ${servings}× but you wrote ${mention.quantity.text}; the description was used.`,
      );
    }
    return component;
  });

  return { known: [...scanned, ...saved], required, mentions, usedBarcodes, notes };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function composeName(name: string | undefined, mentions: FoodMention[], items: EntryItem[]): string {
  if (name?.trim()) return name.trim();
  if (mentions.length) return mentions.map((m) => m.phrase).join(', ').slice(0, 60);
  if (items.length === 1) return items[0].name;
  if (items.length > 1) return items.map((i) => i.name.replace(/\s*×\d+$/, '')).join(', ').slice(0, 60);
  return 'Meal';
}

/** Strip the model's evidence claim — it is scaffolding, not something to store. */
function toEntryItems(components: WorkingComponent[]): EntryItem[] {
  return components.map(({ evidence: _evidence, ...item }) => item);
}

/**
 * Last resort for a food the user named that nothing has explained.
 *
 * The reference library is tried first, because a table value for "cherry
 * tomatoes" is a real answer. Only when even that fails does the food become an
 * `unresolved` component: zero calories, visible in the breakdown, and the
 * caller is told to ask. It is never silently dropped.
 */
function fillUncovered(uncovered: FoodMention[]): WorkingComponent[] {
  return uncovered.map((mention) => {
    const fromLibrary = estimateFromLibrary(mention);
    if (fromLibrary) return fromLibrary.item;
    return {
      name: describeMention(mention),
      calories: 0,
      macros: { protein: 0, carbs: 0, fat: 0 },
      source: 'unresolved' as const,
      quantity: mention.quantity?.amount,
      unit: mention.quantity?.unit,
      confidence: 0,
    };
  });
}

function finish(
  request: EstimateRequest,
  resolution: Resolution,
  components: WorkingComponent[],
  issues: ValidationIssue[],
  modelCalls: number,
  modelName: string | undefined,
  estimatedOffline: boolean,
): EstimateResult {
  const totals: Totals = sumComponents(components);
  const items = toEntryItems(components);
  const needsClarification = components
    .filter((c) => c.source === 'unresolved')
    .map((c) => c.name);

  const usedProducts = resolution.usedBarcodes.length
    ? resolution.usedBarcodes.reduce(
        (products, barcode) => markProductUsed(products, barcode),
        request.savedProducts ?? [],
      )
    : undefined;

  return {
    name: composeName(modelName, resolution.mentions, items),
    calories: totals.calories,
    macros: totals.macros,
    fiber: totals.fiber,
    confidence: computeConfidence(components, [], issues),
    items,
    needsClarification,
    notes: [...resolution.notes, ...issues.filter((i) => i.repaired).map((i) => i.message)],
    estimatedOffline: estimatedOffline || undefined,
    modelCalls,
    usedProducts,
  };
}

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

/**
 * Estimate a meal.
 *
 * `callModel` is injected; pass `undefined` to run fully offline, which resolves
 * everything it can from scans, memory and the reference library and marks the
 * result so the UI can say the photos were never looked at.
 */
export async function runEstimate(
  request: EstimateRequest,
  callModel?: ModelCaller,
): Promise<EstimateResult> {
  const resolution = resolveKnown(request);
  const hasPhotos = (request.photos?.length ?? 0) > 0;

  // Nothing left to work out: a purely scanned or fully remembered meal needs
  // no model at all, and paying for one would only add a chance of being wrong.
  if (!hasPhotos && resolution.required.length === 0) {
    const checked = validateEstimate({
      mentions: resolution.mentions,
      components: resolution.known,
      hasPhotos: false,
    });
    return finish(request, resolution, checked.components, checked.issues, 0, undefined, false);
  }

  if (!callModel) return offlineEstimate(request, resolution);

  let modelCalls = 0;
  let parsed: ModelJson;
  try {
    const content: PromptBlock[] = [];
    for (const photo of request.photos ?? []) {
      if (!photo.base64) continue;
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: photo.mimeType || 'image/jpeg', data: photo.base64 },
      });
    }
    content.push({ type: 'text', text: buildPrompt(request, resolution.known, resolution.required) });

    parsed = (await callModel({
      system: SYSTEM_PROMPT,
      content,
      schema: OUTPUT_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 1400,
    })) as ModelJson;
    modelCalls += 1;
  } catch {
    // The transport failed. Fall back rather than block the log.
    return offlineEstimate(request, resolution);
  }

  let components = [...resolution.known, ...toComponents(parsed)];
  let checked = validateEstimate({
    mentions: resolution.mentions,
    components,
    hasPhotos,
  });

  // --- Stage D: one corrective call, only for what only the model can fix ---
  const retryable = retryableIssues(checked.issues);
  if (retryable.length > 0) {
    try {
      const corrected = (await callModel({
        system: SYSTEM_PROMPT,
        // No images: the model already read them, and re-sending them is the
        // single most expensive thing this pipeline could do.
        content: [{ type: 'text', text: buildCorrection(parsed, retryable, resolution.required) }],
        schema: OUTPUT_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 1400,
      })) as ModelJson;
      modelCalls += 1;

      const retryChecked = validateEstimate({
        mentions: resolution.mentions,
        components: [...resolution.known, ...toComponents(corrected)],
        hasPhotos,
      });
      // Keep the retry only if it actually covered more of the meal.
      if (retryChecked.uncovered.length < checked.uncovered.length) {
        checked = retryChecked;
        parsed = corrected;
      }
    } catch {
      // Keep the first answer; the fill-in below still runs.
    }
  }

  components = checked.components;
  const issues = [...checked.issues];

  // Anything the model still failed to cover falls back to the library, and
  // failing that becomes visibly unresolved.
  if (checked.uncovered.length > 0) {
    const filled = fillUncovered(checked.uncovered);
    components = [...components, ...filled];
    for (const item of filled) {
      issues.push({
        code: item.source === 'unresolved' ? 'unresolved' : 'missing-food',
        subject: item.name,
        message:
          item.source === 'unresolved'
            ? `"${item.name}" could not be estimated — check it before saving.`
            : `"${item.name}" was missing from the estimate and was filled in from the food table.`,
        repaired: item.source !== 'unresolved',
      });
    }
    // Re-run so stated numbers and counts apply to the fillers too.
    const rechecked = validateEstimate({ mentions: resolution.mentions, components, hasPhotos });
    components = rechecked.components;
    for (const issue of rechecked.issues) {
      if (!issues.some((existing) => existing.code === issue.code && existing.subject === issue.subject)) {
        issues.push(issue);
      }
    }
  }

  return finish(request, resolution, components, issues, modelCalls, parsed.name, false);
}

// ---------------------------------------------------------------------------
// Offline
// ---------------------------------------------------------------------------

/**
 * Everything the app can work out with no model at all.
 *
 * This is a real answer, not a placeholder: scans and remembered products are
 * exact, the reference library covers most named foods, and stated numbers are
 * still honoured. What it cannot do is look at a photo, which is why the result
 * is flagged and the UI says so.
 */
function offlineEstimate(request: EstimateRequest, resolution: Resolution): EstimateResult {
  const filled = fillUncovered(resolution.required);
  const checked = validateEstimate({
    mentions: resolution.mentions,
    components: [...resolution.known, ...filled],
    hasPhotos: false,
  });
  return finish(request, resolution, checked.components, checked.issues, 0, undefined, true);
}
