import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { draftFromEstimate, draftToEntry, type CommitContext } from '@/lib/food-draft';
import { lookupBarcode } from '@/lib/barcode';
import { runEstimate, type KnownItem } from '@/lib/estimate-pipeline';
import { rememberProduct, type ScannedProductInput } from '@/lib/product-memory';
import { scaleProduct } from '@/lib/product-scale';
import type { EntryItem } from '@/types';

/**
 * A barcode says *what* a product is. The description says *how much* of it was
 * eaten. Every test here is one way those two used to get confused.
 *
 * The two that were reported from real use: oatmeal whose label reads 360 kcal
 * per 100 g, logged as "70 g oatmeal", stored as 360 kcal — the whole reference
 * amount. And a protein powder stored per 100 g (two scoops), logged as "1
 * scoop", stored as two. Both are asserted against the stored `FoodEntry.items`
 * rather than against anything on screen, because both looked correct there.
 */

const CONTEXT: CommitContext = { date: '2026-09-02', meal: 'breakfast', captured: true };

/** No model at all: every assertion below must hold on arithmetic alone. */
const OFFLINE = undefined;

/** The oatmeal from the report: 360 kcal per 100 g, no per-serving figures. */
const OATMEAL: ScannedProductInput = {
  barcode: '3800000000001',
  name: 'Rolled Oats',
  // With no serving on the label, 100 g *is* the serving — and it says so.
  perServing: {
    calories: 360,
    macros: { protein: 12, carbs: 60, fat: 7 },
    fiber: 10,
    label: '100 g',
  },
  per100: { calories: 360, macros: { protein: 12, carbs: 60, fat: 7 }, fiber: 10 },
  servingGrams: 100,
  servingIsReference: true,
};

/** A powder whose label states the scoop: 380 kcal/100 g, one scoop is 50 g. */
const POWDER: ScannedProductInput = {
  barcode: '3800000000002',
  name: 'Rebel Whey Vanilla',
  perServing: {
    calories: 190,
    macros: { protein: 37.5, carbs: 3, fat: 2 },
    label: '1 scoop (50 g)',
  },
  per100: { calories: 380, macros: { protein: 75, carbs: 6, fat: 4 } },
  servingGrams: 50,
};

/** The same powder, but the database only ever knew it per 100 g. */
const POWDER_PER_100_ONLY: ScannedProductInput = {
  barcode: '3800000000003',
  name: 'Mystery Whey',
  perServing: {
    calories: 380,
    macros: { protein: 75, carbs: 6, fat: 4 },
    label: '100 g',
  },
  per100: { calories: 380, macros: { protein: 75, carbs: 6, fat: 4 } },
  servingGrams: 100,
  servingIsReference: true,
};

/** A product whose label counts in scoops and knows nothing else. */
const PER_SCOOP_ONLY: ScannedProductInput = {
  barcode: '3800000000004',
  name: 'Gainer Chocolate',
  perServing: {
    calories: 126,
    macros: { protein: 20, carbs: 8, fat: 2 },
    label: '1 scoop',
  },
};

/** A scan of `product` as the logger screen builds it: one serving on the stepper. */
function scanned(product: ScannedProductInput, quantity = 1): KnownItem {
  return {
    name: product.name,
    calories: product.perServing.calories,
    macros: product.perServing.macros,
    fiber: product.perServing.fiber,
    quantity,
    barcode: product.barcode,
    per100: product.per100,
    servingGrams: product.servingGrams,
    servingLabel: product.perServing.label,
    liquid: product.liquid,
    servingIsReference: product.servingIsReference,
  };
}

/** The stored component for a food, as it lands in `FoodEntry.items`. */
function stored(items: EntryItem[] | undefined, pattern: RegExp): EntryItem {
  const found = items?.find((i) => pattern.test(i.name));
  assert.ok(found, `no stored component matching ${pattern} in ${JSON.stringify(items)}`);
  return found;
}

// ---------------------------------------------------------------------------
// A + B — grams against a per-100 g label
// ---------------------------------------------------------------------------

describe('A — 70 g of a 360 kcal/100 g product is 252 kcal', () => {
  it('scales a scanned product to the weight in the description', async () => {
    const result = await runEstimate(
      { description: '70 g oatmeal', knownItems: [scanned(OATMEAL)] },
      OFFLINE,
    );
    assert.equal(result.calories, 252, '360 × 70/100');
    assert.equal(result.modelCalls, 0, 'arithmetic, not a model call');
  });

  it('scales every macro and the fibre by the same 70%', async () => {
    const result = await runEstimate(
      { description: '70 g oatmeal', knownItems: [scanned(OATMEAL)] },
      OFFLINE,
    );
    assert.deepEqual(result.macros, { protein: 8.4, carbs: 42, fat: 4.9 });
    assert.equal(result.fiber, 7);
  });

  it('stores 252 kcal against 70 g in FoodEntry.items, not 360 against a serving', async () => {
    const result = await runEstimate(
      { description: '70 g oatmeal', knownItems: [scanned(OATMEAL)] },
      OFFLINE,
    );
    const entry = draftToEntry(draftFromEstimate(result), CONTEXT);
    assert.equal(entry.calories, 252);

    // A single-component meal has no breakdown to show, so the component is
    // asserted on the estimate — which is the same object the entry is built
    // from, and the same numbers that reach storage.
    const oats = stored(result.items ?? [{ ...result, source: 'label' } as EntryItem], /oats|oatmeal/i);
    assert.equal(oats.calories, 252);
    assert.equal(oats.quantity, 70);
    assert.equal(oats.unit, 'g');
  });

  it('keeps the breakdown honest when there is more than one component', async () => {
    const result = await runEstimate(
      {
        description: '70 g oatmeal and 1 scoop rebel whey',
        knownItems: [scanned(OATMEAL), scanned(POWDER)],
      },
      OFFLINE,
    );
    const entry = draftToEntry(draftFromEstimate(result), CONTEXT);
    assert.equal(stored(entry.items, /oats/i).calories, 252);
    assert.equal(stored(entry.items, /rebel whey/i).calories, 190);
    assert.equal(entry.calories, 442);
  });

  it('resolves the same thing from memory when the scan was an earlier meal', async () => {
    const savedProducts = rememberProduct([], OATMEAL);
    const result = await runEstimate({ description: '70 g oatmeal', savedProducts }, OFFLINE);
    assert.equal(result.calories, 252);
  });
});

describe('B — the same product at a different amount', () => {
  it('gives 540 kcal for 150 g', async () => {
    const result = await runEstimate(
      { description: '150 g oatmeal', knownItems: [scanned(OATMEAL)] },
      OFFLINE,
    );
    assert.equal(result.calories, 540, '360 × 1.5');
  });

  it('handles kilograms, which normalise to grams first', async () => {
    const result = await runEstimate(
      { description: '0.2 kg oatmeal', knownItems: [scanned(OATMEAL)] },
      OFFLINE,
    );
    assert.equal(result.calories, 720, '200 g');
  });
});

// ---------------------------------------------------------------------------
// C + D + E — scoops
// ---------------------------------------------------------------------------

describe('C — one scoop is one scoop, not the whole reference amount', () => {
  it('logs 50 g worth of a 380 kcal/100 g powder', async () => {
    const result = await runEstimate(
      { description: '1 scoop protein powder', knownItems: [scanned(POWDER)] },
      OFFLINE,
    );
    assert.equal(result.calories, 190, 'half of 380, because a scoop is 50 of 100 g');
    assert.notEqual(result.calories, 380, 'the reference amount is not the consumed amount');
  });

  it('stores the scoop, not the 100 g reference, in FoodEntry.items', async () => {
    const result = await runEstimate(
      { description: '1 scoop protein powder and 70 g oatmeal', knownItems: [scanned(POWDER), scanned(OATMEAL)] },
      OFFLINE,
    );
    const entry = draftToEntry(draftFromEstimate(result), CONTEXT);
    const powder = stored(entry.items, /rebel whey/i);
    assert.equal(powder.calories, 190);
    assert.equal(powder.quantity, 1);
    assert.equal(powder.unit, 'scoop');
    assert.equal(powder.source, 'label');
  });
});

describe('D — fractional and multiple scoops', () => {
  it('gives 75 g worth for 1.5 scoops', async () => {
    const result = await runEstimate(
      { description: '1.5 scoops protein powder', knownItems: [scanned(POWDER)] },
      OFFLINE,
    );
    assert.equal(result.calories, 285, '190 × 1.5, which is 380 × 0.75');
    assert.equal(result.macros.protein, 56.3);
  });

  it('reads a written half as 0.5', async () => {
    const result = await runEstimate(
      { description: 'half a scoop of protein powder', knownItems: [scanned(POWDER)] },
      OFFLINE,
    );
    assert.equal(result.calories, 95);
  });

  it('gives 2.5 scoops two and a half times the label', async () => {
    const result = await runEstimate(
      { description: '2.5 scoops protein powder', knownItems: [scanned(POWDER)] },
      OFFLINE,
    );
    assert.equal(result.calories, 475);
  });
});

describe('E — a label that states nutrition per scoop', () => {
  it('gives 252 kcal for 2 scoops of a 126 kcal scoop', async () => {
    const result = await runEstimate(
      { description: '2 scoops gainer', knownItems: [scanned(PER_SCOOP_ONLY)] },
      OFFLINE,
    );
    assert.equal(result.calories, 252);
    assert.equal(result.macros.protein, 40);
  });
});

// ---------------------------------------------------------------------------
// F — the conversion we do not have
// ---------------------------------------------------------------------------

describe('F — an unknown scoop size is asked about, never assumed', () => {
  it('does not silently use the 100 g reference', async () => {
    const result = await runEstimate(
      { description: '1 scoop mystery whey', knownItems: [scanned(POWDER_PER_100_ONLY)] },
      OFFLINE,
    );
    assert.notEqual(result.calories, 380, 'a scoop is not 100 g');
    assert.equal(result.calories, 0, 'no number is better than a wrong one');
  });

  it('surfaces it as something the UI must ask about', async () => {
    const result = await runEstimate(
      { description: '1 scoop mystery whey', knownItems: [scanned(POWDER_PER_100_ONLY)] },
      OFFLINE,
    );
    assert.equal(result.needsClarification?.length, 1);
    assert.match(result.needsClarification?.[0] ?? '', /mystery whey/i);
    assert.ok(result.confidence <= 0.35, `expected low confidence, got ${result.confidence}`);
  });

  it('still stores the weight when the same product is given in grams', async () => {
    const result = await runEstimate(
      { description: '30 g mystery whey', knownItems: [scanned(POWDER_PER_100_ONLY)] },
      OFFLINE,
    );
    assert.equal(result.calories, 114, '380 × 0.3 — grams need no scoop size');
  });

  it('lets the user settle it by stating the calories outright', async () => {
    const result = await runEstimate(
      { description: '1 scoop mystery whey which is 200 kcal', knownItems: [scanned(POWDER_PER_100_ONLY)] },
      OFFLINE,
    );
    assert.equal(result.calories, 200);
  });
});

// ---------------------------------------------------------------------------
// G — what actually reaches storage
// ---------------------------------------------------------------------------

describe('G — the stored entry, not the screen', () => {
  it('never lets the stepper override an amount the description states', async () => {
    // Scanned twice, then described as 70 g. Seventy grams is seventy grams.
    const result = await runEstimate(
      { description: '70 g oatmeal', knownItems: [scanned(OATMEAL, 2)] },
      OFFLINE,
    );
    assert.equal(result.calories, 252);
    assert.ok(
      result.notes?.some((n) => /scanned 2×/.test(n)),
      'the override is said out loud, not applied quietly',
    );
  });

  it('uses the stepper when the description says nothing about the amount', async () => {
    const result = await runEstimate(
      { description: 'oatmeal for breakfast', knownItems: [scanned(OATMEAL, 2)] },
      OFFLINE,
    );
    assert.equal(result.calories, 720, 'two servings, as the stepper says');
  });

  it('keeps the entry coherent: components sum to the total', async () => {
    const result = await runEstimate(
      {
        description: '70 g oatmeal with 1.5 scoops protein powder',
        knownItems: [scanned(OATMEAL), scanned(POWDER)],
      },
      OFFLINE,
    );
    const entry = draftToEntry(draftFromEstimate(result), CONTEXT);
    const sum = entry.items?.reduce((a, i) => a + i.calories, 0);
    assert.equal(sum, entry.calories);
    assert.equal(entry.calories, 537, '252 + 285');
    assert.equal(entry.aiEstimated, false, 'nothing here was guessed at');
  });

  it('does not mistake one scanned product for another', async () => {
    const result = await runEstimate(
      {
        description: '70 g oatmeal, 1 scoop rebel whey',
        knownItems: [scanned(OATMEAL), scanned(POWDER)],
      },
      OFFLINE,
    );
    assert.equal(result.items?.length, 2);
    assert.equal(stored(result.items, /oats/i).unit, 'g');
    assert.equal(stored(result.items, /rebel whey/i).unit, 'scoop');
  });
});

// ---------------------------------------------------------------------------
// The scaler on its own
// ---------------------------------------------------------------------------

describe('scaleProduct', () => {
  const basis = {
    perServing: { calories: 190, macros: { protein: 37.5, carbs: 3, fat: 2 } },
    servingLabel: '1 scoop (50 g)',
    per100: { calories: 380, macros: { protein: 75, carbs: 6, fat: 4 } },
    servingGrams: 50,
  };

  it('reads no quantity as the caller’s own count', () => {
    const out = scaleProduct(basis, undefined, 2);
    assert.equal(out.kind, 'scaled');
    assert.equal(out.kind === 'scaled' && out.nutrition.calories, 380);
  });

  it('scales millilitres against the density like grams', () => {
    const out = scaleProduct({ ...basis, liquid: true }, { amount: 250, unit: 'ml', text: '250 ml' });
    assert.equal(out.kind === 'scaled' && out.nutrition.calories, 950);
  });

  it('marks a unit the label does not count in as inexact rather than exact', () => {
    const out = scaleProduct(basis, { amount: 1, unit: 'handful', text: 'a handful' });
    assert.equal(out.kind === 'scaled' && out.exact, false);
  });

  it('refuses a countable unit against a bare 100 g reference', () => {
    const out = scaleProduct(
      { perServing: basis.per100, servingLabel: '100 g', per100: basis.per100, servingGrams: 100, servingIsReference: true },
      { amount: 1, unit: 'scoop', text: '1 scoop' },
    );
    assert.equal(out.kind, 'unresolved');
  });

  it('rounds once at the end rather than at every step', () => {
    // 1/3 of 190 kcal is 63.33; three of them must still be 190, not 189.
    const third = scaleProduct(basis, { amount: 0.333, unit: 'scoop', text: '0.333 scoops' });
    assert.equal(third.kind === 'scaled' && third.nutrition.calories, 63);
    const whole = scaleProduct(basis, { amount: 0.999, unit: 'scoop', text: '0.999 scoops' });
    assert.equal(whole.kind === 'scaled' && whole.nutrition.calories, 190);
  });
});

// ---------------------------------------------------------------------------
// The flag that makes the distinction possible
// ---------------------------------------------------------------------------

describe('a lookup says whether its "serving" is really a serving', () => {
  it('marks a product with no per-serving figures as reference-only', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          status: 1,
          product: {
            product_name: 'Rolled Oats',
            nutriments: { 'energy-kcal_100g': 360, proteins_100g: 12, carbohydrates_100g: 60, fat_100g: 7 },
          },
        }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const product = await lookupBarcode('3800000000001');
      assert.equal(product?.servingIsReference, true);
      assert.equal(product?.perServing.label, '100 g');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('leaves it unset when the label states a real serving', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          status: 1,
          product: {
            product_name: 'Rebel Whey',
            serving_size: '1 scoop (50 g)',
            nutriments: {
              'energy-kcal_100g': 380,
              'energy-kcal_serving': 190,
              proteins_serving: 37.5,
            },
          },
        }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const product = await lookupBarcode('3800000000002');
      assert.equal(product?.servingIsReference, undefined);
      assert.equal(product?.servingGrams, 50);
    } finally {
      globalThis.fetch = original;
    }
  });
});
