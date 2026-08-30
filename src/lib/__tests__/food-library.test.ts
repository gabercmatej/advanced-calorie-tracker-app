import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  defaultPortion,
  findFood,
  FOOD_LIBRARY,
  foodsInGroup,
  scaleFood,
  searchFoods,
  type LibraryFood,
} from '../food-library.ts';

/**
 * The corpus is hand-written, so the risk is not logic bugs but data bugs — a
 * duplicate id, a typo that puts 3000 kcal in 100 g of broccoli, macros that
 * do not add up to the stated calories. These check the data itself.
 */

describe('data integrity', () => {
  it('has a useful number of foods', () => {
    assert.ok(FOOD_LIBRARY.length >= 250, `only ${FOOD_LIBRARY.length} foods`);
  });

  it('has no duplicate ids', () => {
    const ids = FOOD_LIBRARY.map((f) => f.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepEqual(dupes, []);
  });

  it('has no duplicate names', () => {
    const names = FOOD_LIBRARY.map((f) => f.name.toLowerCase());
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    assert.deepEqual(dupes, []);
  });

  it('gives every food at least one portion', () => {
    const missing = FOOD_LIBRARY.filter((f) => f.portions.length === 0);
    assert.deepEqual(missing.map((f) => f.id), []);
  });

  it('has only positive portion weights', () => {
    const bad = FOOD_LIBRARY.filter((f) => f.portions.some((p) => !(p.grams > 0)));
    assert.deepEqual(bad.map((f) => f.id), []);
  });

  it('has no negative or non-finite nutrient values', () => {
    const bad = FOOD_LIBRARY.filter((f) =>
      Object.values(f.per100).some((v) => !Number.isFinite(v) || v < 0),
    );
    assert.deepEqual(bad.map((f) => f.id), []);
  });

  it('keeps macros within 100 g of food', () => {
    // protein + carbs + fat cannot exceed the mass they are measured in.
    const bad = FOOD_LIBRARY.filter(
      (f) => f.per100.protein + f.per100.carbs + f.per100.fat > 100,
    );
    assert.deepEqual(bad.map((f) => f.id), []);
  });

  it('keeps fibre within total carbohydrate', () => {
    // Fibre is a carbohydrate; more fibre than carbs is always a typo.
    const bad = FOOD_LIBRARY.filter((f) => f.per100.fiber > f.per100.carbs + 0.01);
    assert.deepEqual(bad.map((f) => f.id), []);
  });

  it('has calories that roughly match its macros', () => {
    // 4/4/9 kcal per gram. Alcohol carries 7 kcal/g that the macros do not
    // account for, so spirits and wine are legitimately above their macro sum
    // and are checked only for not being *under* it.
    const alcohol = new Set(['beer', 'lager-light', 'wine-red', 'wine-white', 'spirit', 'gin-tonic']);
    const off: string[] = [];
    for (const f of FOOD_LIBRARY) {
      const { protein, carbs, fat, calories } = f.per100;
      const fromMacros = protein * 4 + carbs * 4 + fat * 9;
      if (alcohol.has(f.id)) {
        if (calories + 1 < fromMacros) off.push(f.id);
        continue;
      }
      // Generous tolerance: rounding, fibre's lower yield, and sugar alcohols.
      const tolerance = Math.max(35, fromMacros * 0.25);
      if (Math.abs(calories - fromMacros) > tolerance) {
        off.push(`${f.id} (${calories} vs ${Math.round(fromMacros)})`);
      }
    }
    assert.deepEqual(off, []);
  });

  it('uses kebab-case ids', () => {
    const bad = FOOD_LIBRARY.filter((f) => !/^[a-z0-9-]+$/.test(f.id));
    assert.deepEqual(bad.map((f) => f.id), []);
  });

  it('covers every group', () => {
    for (const group of ['protein', 'dairy', 'carbs', 'legumes', 'veg', 'fruit', 'fats', 'sauces', 'snacks', 'drinks', 'meals'] as const) {
      assert.ok(foodsInGroup(group).length > 0, `no foods in ${group}`);
    }
  });

  it('has a solid base of high-protein options, which is the point', () => {
    const lean = FOOD_LIBRARY.filter(
      (f) => f.per100.protein >= 15 && f.per100.calories <= 250,
    );
    assert.ok(lean.length >= 30, `only ${lean.length} lean protein foods`);
  });
});

describe('scaleFood', () => {
  const chicken = findFood('chicken-breast')!;

  it('scales linearly from the 100 g base', () => {
    assert.deepEqual(scaleFood(chicken, 100), {
      calories: 165,
      protein: 31,
      carbs: 0,
      fat: 3.6,
      fiber: 0,
    });
    const half = scaleFood(chicken, 50);
    assert.equal(half.calories, 83);
    assert.equal(half.protein, 15.5);
  });

  it('handles an arbitrary weight exactly, not as a rounded serving', () => {
    const actual = scaleFood(chicken, 137);
    assert.equal(actual.calories, Math.round(165 * 1.37));
    assert.equal(actual.protein, 42.5);
  });

  it('returns zeroes for zero or negative grams rather than negatives', () => {
    assert.equal(scaleFood(chicken, 0).calories, 0);
    assert.equal(scaleFood(chicken, -50).calories, 0);
  });
});

describe('defaultPortion', () => {
  it('picks the first listed portion', () => {
    const egg = findFood('egg-whole')!;
    assert.equal(defaultPortion(egg).grams, 50);
  });

  it('falls back to 100 g if a food somehow has none', () => {
    const empty = { portions: [] } as unknown as LibraryFood;
    assert.equal(defaultPortion(empty).grams, 100);
  });
});

describe('searchFoods', () => {
  it('returns nothing for an empty query', () => {
    assert.deepEqual(searchFoods(''), []);
    assert.deepEqual(searchFoods('   '), []);
  });

  it('puts the plain food above the composite dish', () => {
    const results = searchFoods('chicken');
    const breast = results.findIndex((f) => f.id === 'chicken-breast');
    const tikka = results.findIndex((f) => f.id === 'curry-chicken-tikka');
    assert.ok(breast !== -1);
    assert.ok(breast < tikka || tikka === -1, 'chicken breast should outrank a curry');
  });

  it('matches aliases', () => {
    assert.ok(searchFoods('shrimp').some((f) => f.id === 'prawns'));
    assert.ok(searchFoods('protein powder').some((f) => f.id === 'whey-protein'));
    assert.ok(searchFoods('zucchini').some((f) => f.id === 'courgette'));
  });

  it('is case insensitive', () => {
    assert.equal(searchFoods('GREEK YOGURT').length, searchFoods('greek yogurt').length);
  });

  it('does not blow up on regex metacharacters', () => {
    assert.doesNotThrow(() => searchFoods('chicken (100g)'));
    assert.doesNotThrow(() => searchFoods('a[b'));
    assert.doesNotThrow(() => searchFoods('*'));
  });

  it('respects the limit', () => {
    assert.ok(searchFoods('e', 5).length <= 5);
  });

  it('finds the staples a cut is actually built on', () => {
    for (const q of ['chicken', 'rice', 'oats', 'greek yogurt', 'whey', 'eggs', 'salmon', 'broccoli']) {
      assert.ok(searchFoods(q).length > 0, `nothing found for "${q}"`);
    }
  });
});
