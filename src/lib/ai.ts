import { callClaudeJson, hasClaudeKey } from '@/lib/claude';
import {
  runEstimate,
  type EstimateRequest,
  type EstimateResult,
  type KnownItem,
  type ModelRequest,
} from '@/lib/estimate-pipeline';
import type { PickedPhoto } from '@/lib/image';
import type { SavedProduct } from '@/lib/product-memory';
import type { EntryItem, Macros } from '@/types';

/**
 * AI food estimation — the "AI" in CalAI.
 *
 * This file is now only the wiring: it hands the real Claude transport to the
 * pipeline in `estimate-pipeline.ts` and adapts the result to the shape the
 * logger screen expects. Every rule about what the model is allowed to say, and
 * every check on what it said, lives in the pipeline and in
 * `estimate-validate.ts`, where it can be tested without a network.
 *
 * The design decisions worth knowing at this level:
 *
 *  - **Scanned and remembered products are never re-estimated.** Their label
 *    numbers go into the answer untouched; the model is only asked about the
 *    rest of the plate.
 *  - **Numbers the user typed are constraints, not hints.** "the milk is 150
 *    kcal" is enforced after the fact, not merely requested beforehand.
 *  - **The meal total is the sum of its components**, computed here, so a model
 *    total that disagrees with its own breakdown cannot reach the diary.
 *  - **Nothing the user named is ever dropped.** A food that survives the model,
 *    a corrective retry and the reference library becomes a visible unresolved
 *    row that the UI asks about.
 *
 * With no proxy configured the whole thing still runs, resolving scans, saved
 * products and the reference library offline, and says that the photos were
 * never looked at.
 */

export type { KnownItem } from '@/lib/estimate-pipeline';

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
   * True when this came from the offline path rather than the vision model —
   * which means any photos were NOT looked at. The UI must say so, otherwise
   * the headline feature degrades invisibly.
   */
  estimatedOffline?: boolean;
  /** Foods the user named that could not be given numbers. The UI asks about these. */
  needsClarification?: string[];
  /** What validation changed, in plain language, for the review card. */
  notes?: string[];
  /** Saved products with their usage bumped, when memory resolved something. */
  usedProducts?: SavedProduct[];
  /** Model calls this estimate cost. Zero for scan-only and offline meals. */
  modelCalls: number;
}

export interface EstimateInput {
  /** Free-text description of the meal. */
  description?: string;
  /** Photos of the meal — treated as one meal from multiple angles. */
  photos?: PickedPhoto[];
  /** Scanned products with exact, label-derived nutrition. */
  knownItems?: KnownItem[];
  /** Products remembered from earlier scans, newest first. */
  savedProducts?: SavedProduct[];
}

/** The injected transport: the pipeline's request shape, on the real proxy. */
async function callModel(request: ModelRequest): Promise<unknown> {
  return callClaudeJson<unknown>({
    system: request.system,
    content: request.content,
    schema: request.schema,
    maxTokens: request.maxTokens,
  });
}

function toEstimate(result: EstimateResult): FoodEstimate {
  return {
    name: result.name,
    calories: result.calories,
    macros: result.macros,
    fiber: result.fiber,
    confidence: result.confidence,
    // A single component is the meal itself — showing a one-row breakdown of
    // the thing it is a breakdown of is noise.
    items: result.items.length > 1 ? result.items : undefined,
    estimatedOffline: result.estimatedOffline,
    needsClarification: result.needsClarification.length ? result.needsClarification : undefined,
    notes: result.notes.length ? result.notes : undefined,
    usedProducts: result.usedProducts,
    modelCalls: result.modelCalls,
  };
}

/**
 * Estimate a meal from any combination of photos, description, scanned products
 * and remembered products.
 */
export async function estimateFood(input: EstimateInput): Promise<FoodEstimate> {
  const request: EstimateRequest = {
    description: input.description,
    photos: input.photos?.map((p) => ({ base64: p.base64, mimeType: p.mimeType })),
    knownItems: input.knownItems,
    savedProducts: input.savedProducts,
  };
  return toEstimate(await runEstimate(request, hasClaudeKey ? callModel : undefined));
}
