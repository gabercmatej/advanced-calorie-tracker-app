import type { Macros } from '@/types';

/**
 * AI food estimation — the "AI" in CalAI.
 *
 * `estimateFood` turns a photo and/or a free-text description of a meal into a
 * calorie + macro estimate.
 *
 * When `EXPO_PUBLIC_ANTHROPIC_API_KEY` is set it calls Claude (a vision model)
 * for a real, accurate estimate. Otherwise it falls back to a lightweight
 * offline keyword heuristic so the app is fully functional with no backend and
 * no key. Any network/model failure also falls back to the heuristic, so the
 * logger never blocks.
 *
 * ⚠️ Cost & security: we use Claude Haiku — the cheapest vision-capable model —
 * with a small token budget and a downscaled image, so each estimate costs a
 * fraction of a cent. `EXPO_PUBLIC_*` values are bundled into the client, so a
 * real release must proxy this call through a server you control instead of
 * shipping the key. The `FoodEstimate` shape below is the stable seam: swap the
 * transport, keep the shape.
 */

export interface FoodEstimate {
  name: string;
  calories: number;
  macros: Macros;
  /** Model confidence 0..1, surfaced in the UI so users can sanity-check. */
  confidence: number;
}

export interface EstimateInput {
  /** Free-text description of the meal (optional if a photo is provided). */
  description?: string;
  /** Local URI of a food photo (optional) — used for display / storage. */
  photoUri?: string;
  /** Base64 image bytes (no data: prefix) for the vision model. */
  photoBase64?: string;
  /** MIME type of the photo, e.g. "image/jpeg". */
  photoMediaType?: string;
}

// ---------------------------------------------------------------------------
// Real model call (Claude Haiku vision)
// ---------------------------------------------------------------------------

const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
// Cheapest vision-capable Claude model — accurate enough for meal photos while
// keeping per-estimate cost minimal.
const MODEL = 'claude-haiku-4-5';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT =
  'You are a nutrition estimation expert for a calorie-tracking app. ' +
  'Given a meal photo and/or a text description, estimate the TOTAL nutrition ' +
  'for the entire portion shown or described (not per 100g). Use standard ' +
  'nutrition databases and realistic serving sizes, and account for cooking oil, ' +
  'dressings, and sauces you can reasonably infer. When a photo and text are both ' +
  'given, treat the photo as the primary source and the text as extra context ' +
  '(e.g. portion or brand). Prefer a slight over-estimate to an under-estimate. ' +
  'Return a concise, human-readable meal name. Set "confidence" to your certainty ' +
  '0..1 — lower it when the input is vague or the portion is ambiguous.';

// Structured output schema so the reply is always valid, parseable JSON.
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    calories: { type: 'integer' },
    protein_g: { type: 'integer' },
    carbs_g: { type: 'integer' },
    fat_g: { type: 'integer' },
    confidence: { type: 'number' },
  },
  required: ['name', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'confidence'],
} as const;

interface ModelJson {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: number;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
const nonNeg = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);

async function estimateWithClaude(input: EstimateInput): Promise<FoodEstimate> {
  const description = (input.description ?? '').trim();

  const content: Record<string, unknown>[] = [];
  if (input.photoBase64) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: input.photoMediaType || 'image/jpeg',
        data: input.photoBase64,
      },
    });
  }
  content.push({
    type: 'text',
    text: description
      ? `Estimate the nutrition for this meal: "${description}".`
      : 'Identify the food in this photo and estimate its nutrition for the full portion shown.',
  });

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY as string,
      'anthropic-version': '2023-06-01',
      // Allow the request from a browser (web build) during local testing.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text().catch(() => '')}`);
  }

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((b) => b.type === 'text')?.text ?? '';
  const parsed = JSON.parse(extractJson(text)) as ModelJson;

  return {
    name: parsed.name?.trim() || description || 'Meal',
    calories: nonNeg(parsed.calories),
    macros: {
      protein: nonNeg(parsed.protein_g),
      carbs: nonNeg(parsed.carbs_g),
      fat: nonNeg(parsed.fat_g),
    },
    confidence: clamp01(parsed.confidence),
  };
}

/** Pull the first JSON object out of a text blob, tolerating stray prose. */
function extractJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return text;
  return text.slice(start, end + 1);
}

// ---------------------------------------------------------------------------
// Offline heuristic fallback
// ---------------------------------------------------------------------------

// Rough per-item reference values for common keywords. Intentionally simple —
// this is a stand-in for a real model, not a nutrition database.
const KEYWORD_TABLE: Record<string, { kcal: number; p: number; c: number; f: number }> = {
  egg: { kcal: 78, p: 6, c: 1, f: 5 },
  toast: { kcal: 80, p: 3, c: 14, f: 1 },
  bread: { kcal: 80, p: 3, c: 14, f: 1 },
  butter: { kcal: 100, p: 0, c: 0, f: 11 },
  chicken: { kcal: 165, p: 31, c: 0, f: 4 },
  rice: { kcal: 130, p: 3, c: 28, f: 0 },
  salad: { kcal: 60, p: 2, c: 8, f: 3 },
  banana: { kcal: 105, p: 1, c: 27, f: 0 },
  apple: { kcal: 95, p: 0, c: 25, f: 0 },
  coffee: { kcal: 5, p: 0, c: 1, f: 0 },
  yogurt: { kcal: 120, p: 10, c: 12, f: 4 },
  oats: { kcal: 150, p: 5, c: 27, f: 3 },
  pizza: { kcal: 285, p: 12, c: 36, f: 10 },
  pasta: { kcal: 220, p: 8, c: 43, f: 1 },
  salmon: { kcal: 208, p: 20, c: 0, f: 13 },
};

const DEFAULT_ITEM = { kcal: 200, p: 8, c: 20, f: 9 };

/** Simulated latency so the offline path still exercises loading states. */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function offlineEstimate(input: EstimateInput): Promise<FoodEstimate> {
  await wait(input.photoUri ? 900 : 500);

  const description = input.description ?? '';
  const text = description.toLowerCase();
  const matches = Object.entries(KEYWORD_TABLE).filter(([k]) => text.includes(k));
  const items = matches.length ? matches.map(([, v]) => v) : [DEFAULT_ITEM];

  const summed = items.reduce(
    (acc, v) => ({ kcal: acc.kcal + v.kcal, p: acc.p + v.p, c: acc.c + v.c, f: acc.f + v.f }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );

  const name = description.trim() || (input.photoUri ? 'Scanned meal' : 'Food');
  const base = input.photoUri ? 0.5 : 0.35;
  const confidence = matches.length ? Math.min(0.95, base + matches.length * 0.1) : base;

  return {
    name,
    calories: Math.round(summed.kcal),
    macros: { protein: summed.p, carbs: summed.c, fat: summed.f },
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function estimateFood(input: EstimateInput): Promise<FoodEstimate> {
  if (API_KEY) {
    try {
      return await estimateWithClaude(input);
    } catch (err) {
      // Never block logging — degrade to the offline heuristic on any failure.
      console.warn('[ai] Claude estimate failed, using offline heuristic:', err);
    }
  }
  return offlineEstimate(input);
}
