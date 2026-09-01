import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aliasesFor,
  categoryFor,
  defaultForCategory,
  markProductUsed,
  rememberProduct,
  resolveProduct,
  type SavedProduct,
  type ScannedProductInput,
} from '@/lib/product-memory';

/**
 * Scanned-product memory.
 *
 * The value of this file is that a scan stops being a one-meal fact. The risk
 * it has to avoid is the mirror image: a scan claiming a generic word it has no
 * business claiming, so that "milk" silently resolves to a tin of paprika. Both
 * directions are tested.
 */

const scan = (barcode: string, name: string, calories: number, protein = 0): ScannedProductInput => ({
  barcode,
  name,
  perServing: { calories, macros: { protein, carbs: 0, fat: 0 }, label: '1 scoop (30 g)' },
  per100: { calories: calories * (100 / 30), macros: { protein: protein * (100 / 30), carbs: 0, fat: 0 } },
  servingGrams: 30,
});

const GAINER = scan('111', 'Battery Nutrition Rebel Gainer Chocolate', 126, 20);
const OTHER_WHEY = scan('222', 'Myprotein Impact Whey Vanilla', 103, 21);

describe('category detection', () => {
  it('recognises the generic word a product answers to', () => {
    assert.equal(categoryFor('Battery Nutrition Rebel Gainer Chocolate'), 'protein-powder');
    assert.equal(categoryFor('Myprotein Impact Whey Vanilla'), 'protein-powder');
    assert.equal(categoryFor('Spar 1.5% Milk'), 'milk');
    assert.equal(categoryFor('Fage Total Greek Yogurt 0%'), 'greek-yogurt');
    assert.equal(categoryFor('Hovis Wholemeal Bread'), 'bread');
    assert.equal(categoryFor('John West Tuna Chunks in Brine'), 'tuna');
  });

  it('prefers the more specific category when two could match', () => {
    // Peanut butter is not the default butter, and a protein bar is not a tub
    // of protein powder. Getting either wrong silently swaps one food for another.
    assert.equal(categoryFor('Meridian Peanut Butter Smooth'), 'peanut-butter');
    assert.equal(categoryFor('Grenade Carb Killa Protein Bar'), 'protein-bar');
    assert.equal(categoryFor('Fage Total Greek Yogurt'), 'greek-yogurt');
  });

  it('does not claim a generic word it has no business claiming', () => {
    // The restraint that stops the newest scan hijacking every phrase.
    assert.equal(categoryFor('Podravka Vegeta Seasoning'), undefined);
    assert.equal(categoryFor('Milka Milk Chocolate Bar'), 'chocolate');
  });

  it('builds aliases from both the product name and its category', () => {
    const aliases = aliasesFor('Battery Nutrition Rebel Gainer Chocolate', 'protein-powder');
    assert.ok(aliases.includes('protein powder'));
    assert.ok(aliases.includes('whey'));
    assert.ok(aliases.some((a) => a.includes('rebel')));
  });
});

describe('remembering a scan', () => {
  it('keeps the newest scan first and does not duplicate a re-scan', () => {
    let products: SavedProduct[] = [];
    products = rememberProduct(products, GAINER, 1_000);
    products = rememberProduct(products, OTHER_WHEY, 2_000);
    products = rememberProduct(products, GAINER, 3_000);
    assert.equal(products.length, 2);
    assert.equal(products[0].barcode, '111');
  });

  it('carries usage across a re-scan of the same product', () => {
    let products = rememberProduct([], GAINER, 1_000);
    products = markProductUsed(products, '111', 1_500);
    products = rememberProduct(products, GAINER, 2_000);
    assert.equal(products[0].timesUsed, 1);
  });
});

describe('Test E — a generic phrase resolves to the saved product', () => {
  const products = rememberProduct([], GAINER, 1_000);

  it('resolves "protein powder" to the scanned tub', () => {
    const match = resolveProduct(products, 'protein powder');
    assert.equal(match?.product.barcode, '111');
    assert.equal(match?.product.perServing.calories, 126);
    assert.equal(match?.product.perServing.macros.protein, 20);
  });

  it('resolves the other words for the same thing', () => {
    for (const phrase of ['whey', 'protein', 'gainer', 'protein shake']) {
      assert.equal(resolveProduct(products, phrase)?.product.barcode, '111', phrase);
    }
  });

  it('resolves by the product name too', () => {
    assert.equal(resolveProduct(products, 'rebel gainer')?.product.barcode, '111');
  });

  it('does not resolve a phrase about a different food', () => {
    assert.equal(resolveProduct(products, 'banana'), undefined);
    assert.equal(resolveProduct(products, 'cherry tomatoes'), undefined);
  });

  it('matches whole words only', () => {
    // "proteinaceous" is not a request for the user's protein powder.
    assert.equal(resolveProduct(products, 'proteinaceous slurry'), undefined);
  });
});

describe('Test F — scanning a replacement changes the default', () => {
  let products = rememberProduct([], GAINER, 1_000);
  products = rememberProduct(products, OTHER_WHEY, 2_000);

  it('sends the generic phrase to the newest scan', () => {
    assert.equal(resolveProduct(products, 'protein powder')?.product.barcode, '222');
    assert.equal(defaultForCategory(products, 'protein-powder')?.barcode, '222');
  });

  it('still resolves the old product by its own name', () => {
    // The old tub is not deleted — a half-used one is still a real food.
    const match = resolveProduct(products, 'rebel gainer');
    assert.equal(match?.product.barcode, '111');
    assert.equal(match?.specific, true);
  });

  it('scanning the old one again makes it the default again', () => {
    const rescanned = rememberProduct(products, GAINER, 3_000);
    assert.equal(resolveProduct(rescanned, 'protein powder')?.product.barcode, '111');
  });

  it('keeps categories independent of each other', () => {
    const withMilk = rememberProduct(products, scan('333', 'Spar 1.5% Milk', 47), 3_000);
    assert.equal(resolveProduct(withMilk, 'milk')?.product.barcode, '333');
    // The newest scan overall is the milk, but protein powder is unaffected.
    assert.equal(resolveProduct(withMilk, 'protein powder')?.product.barcode, '222');
  });
});
