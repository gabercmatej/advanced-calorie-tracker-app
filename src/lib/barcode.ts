import type { ProductNutrition, ScannedProductInput } from '@/lib/product-memory';

/**
 * Barcode → nutrition lookup.
 *
 * `lookupBarcode` turns a scanned product barcode (EAN/UPC) into real label
 * data by querying the free, key-less Open Food Facts database. Unlike the
 * photo/description estimator, this reads the actual label, so it outranks
 * anything a model can produce and is never sent back to one for re-estimation.
 *
 * It returns *both* bases where the database has them — per serving and per
 * 100 g — because the two answer different questions. Per serving is what the
 * user eats; per 100 g is what lets "45 g of it" scale exactly later, once the
 * product has been remembered (see `product-memory.ts`).
 *
 * Returns `null` when the product isn't in the database or has no usable
 * calorie data; throws on a network/HTTP failure so the caller can distinguish
 * "not found" from "offline".
 */

const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product';
const FIELDS = 'product_name,brands,nutriments,serving_size,quantity';

/** Coerce an Open Food Facts numeric field (string or number) to a finite number. */
function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : undefined;
}

const nonNeg = (n: number | undefined) => Math.max(0, Math.round((n ?? 0) * 10) / 10);

type Nutriments = Record<string, unknown>;

/**
 * Read kcal for a given basis ("serving" or "100g"). Prefers the direct kcal
 * field; falls back to the kJ field (Open Food Facts stores plain `energy_*` in
 * kJ) converted at 4.184 kJ/kcal.
 */
function kcalFor(n: Nutriments, basis: 'serving' | '100g'): number | undefined {
  const direct = num(n[`energy-kcal_${basis}`]);
  if (direct != null) return direct;
  const kj = num(n[`energy-kj_${basis}`]) ?? num(n[`energy_${basis}`]);
  return kj != null ? kj / 4.184 : undefined;
}

/** Nutrition on one basis, or undefined when the database has no calories for it. */
function nutritionFor(n: Nutriments, basis: 'serving' | '100g'): ProductNutrition | undefined {
  const calories = kcalFor(n, basis);
  if (calories == null) return undefined;
  const fiber = num(n[`fiber_${basis}`]);
  return {
    calories: Math.max(0, Math.round(calories)),
    macros: {
      protein: nonNeg(num(n[`proteins_${basis}`])),
      carbs: nonNeg(num(n[`carbohydrates_${basis}`])),
      fat: nonNeg(num(n[`fat_${basis}`])),
    },
    // Fibre is optional on a label and often absent. Left undefined rather than
    // zeroed, so "not stated" stays distinct from "none".
    fiber: fiber == null ? undefined : nonNeg(fiber),
  };
}

/**
 * Grams (or millilitres) in one serving, from the free-text serving size.
 * Handles "30 g", "250ml", and "1 scoop (30 g)".
 */
export function parseServingGrams(servingSize: string | undefined): number | undefined {
  if (!servingSize) return undefined;
  const match = /(\d+(?:[.,]\d+)?)\s*(g|gr|ml)\b/i.exec(servingSize.replace(',', '.'));
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export async function lookupBarcode(code: string): Promise<ScannedProductInput | null> {
  const url = `${OFF_URL}/${encodeURIComponent(code)}.json?fields=${FIELDS}`;
  const res = await fetch(url, {
    // Open Food Facts asks API clients to identify themselves.
    headers: { 'User-Agent': 'CalAI/1.0 (personal calorie tracker)' },
  });
  if (!res.ok) throw new Error(`Open Food Facts error ${res.status}`);

  const data = (await res.json()) as {
    status?: number;
    product?: {
      product_name?: string;
      brands?: string;
      nutriments?: Nutriments;
      serving_size?: string;
      quantity?: string;
    };
  };
  if (data.status !== 1 || !data.product) return null;

  const p = data.product;
  const n = p.nutriments ?? {};

  const perServing = nutritionFor(n, 'serving');
  const per100 = nutritionFor(n, '100g');
  // Without calories on either basis there is nothing to track.
  if (!perServing && !per100) return null;

  const brand = p.brands?.split(',')[0]?.trim();
  const productName = p.product_name?.trim();
  // Prepend the brand, unless the name already leads with it (avoids "Nutella Nutella").
  const withBrand =
    brand && !productName?.toLowerCase().startsWith(brand.toLowerCase())
      ? [brand, productName].filter(Boolean).join(' ')
      : productName;
  const name = withBrand || brand || 'Scanned product';

  const servingGrams = parseServingGrams(p.serving_size);
  const liquid = /\bml\b|\bl\b/i.test(p.serving_size ?? p.quantity ?? '');

  // With no per-serving figures, 100 g *is* the serving, and the label says so
  // rather than the app silently pretending an unknown portion was measured.
  const serving = perServing
    ? { ...perServing, label: p.serving_size?.trim() || '1 serving' }
    : { ...(per100 as ProductNutrition), label: liquid ? '100 ml' : '100 g' };

  return {
    barcode: code,
    name,
    perServing: serving,
    per100,
    servingGrams: perServing ? servingGrams : 100,
    liquid,
  };
}
