import type { FoodEstimate } from './ai';

/**
 * Barcode → nutrition lookup.
 *
 * `lookupBarcode` turns a scanned product barcode (EAN/UPC) into a calorie +
 * macro estimate by querying the free, key-less Open Food Facts database. Unlike
 * the photo/description AI in `src/lib/ai.ts`, this reads the actual label off a
 * packaged product, so it is far more accurate — we surface a high confidence to
 * reflect that.
 *
 * It returns the same `FoodEstimate` shape as `estimateFood`, so the logger can
 * treat a scan and an AI estimate interchangeably. Returns `null` when the
 * product isn't in the database or has no usable calorie data; throws on a
 * network/HTTP failure so the caller can distinguish "not found" from "offline".
 */

const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product';
const FIELDS = 'product_name,brands,nutriments,serving_size';

/** Coerce an Open Food Facts numeric field (string or number) to a finite number. */
function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : undefined;
}

const nonNeg = (n: number | undefined) => Math.max(0, Math.round(n ?? 0));

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

export async function lookupBarcode(code: string): Promise<FoodEstimate | null> {
  const url = `${OFF_URL}/${encodeURIComponent(code)}.json?fields=${FIELDS}`;
  const res = await fetch(url, {
    // Open Food Facts asks API clients to identify themselves.
    headers: { 'User-Agent': 'CalAI/1.0 (personal calorie tracker)' },
  });
  if (!res.ok) throw new Error(`Open Food Facts error ${res.status}`);

  const data = (await res.json()) as {
    status?: number;
    product?: { product_name?: string; brands?: string; nutriments?: Nutriments };
  };
  if (data.status !== 1 || !data.product) return null;

  const p = data.product;
  const n = p.nutriments ?? {};

  // Prefer per-serving values (what the user actually eats). Fall back to the
  // per-100g values, and flag that basis in the name so "1 serving" reads as 100g.
  let calories = kcalFor(n, 'serving');
  let basis: 'serving' | '100g' = 'serving';
  if (calories == null) {
    calories = kcalFor(n, '100g');
    basis = '100g';
  }
  // Without calories there is nothing to track — treat as not found.
  if (calories == null) return null;

  const brand = p.brands?.split(',')[0]?.trim();
  const productName = p.product_name?.trim();
  // Prepend the brand, unless the name already leads with it (avoids "Nutella Nutella").
  const withBrand =
    brand && !productName?.toLowerCase().startsWith(brand.toLowerCase())
      ? [brand, productName].filter(Boolean).join(' ')
      : productName;
  const displayName = withBrand || brand || 'Scanned product';

  return {
    name: basis === '100g' ? `${displayName} (per 100g)` : displayName,
    calories: nonNeg(calories),
    macros: {
      protein: nonNeg(num(n[`proteins_${basis}`])),
      carbs: nonNeg(num(n[`carbohydrates_${basis}`])),
      fat: nonNeg(num(n[`fat_${basis}`])),
    },
    // Label-sourced data is far more reliable than a photo/text guess.
    confidence: 0.95,
  };
}
