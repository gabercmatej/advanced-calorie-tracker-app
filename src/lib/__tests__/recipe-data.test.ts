import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { INGREDIENTS, RECIPES } from '../recipe-data.ts';
import { DIET_TYPES, MEAL_TYPES } from '../../types/index.ts';

/**
 * The recipe corpus is hand-written, and its failure modes are silent: an
 * ingredient id that does not exist quietly makes a recipe un-matchable by the
 * pantry, and a wrong macro number quietly corrupts a logged entry. The app
 * only warned about the first of these, in development, in the console.
 */

const ingredientIds = new Set(INGREDIENTS.map((i) => i.id));

describe('ingredients', () => {
  it('has no duplicate ids', () => {
    const ids = INGREDIENTS.map((i) => i.id);
    assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
  });

  it('gives every ingredient a label and a group', () => {
    const bad = INGREDIENTS.filter((i) => !i.label?.trim() || !i.group);
    assert.deepEqual(bad.map((i) => i.id), []);
  });
});

describe('recipes', () => {
  it('has the intended breadth', () => {
    assert.ok(RECIPES.length >= 100, `only ${RECIPES.length} recipes`);
  });

  it('has no duplicate ids', () => {
    const ids = RECIPES.map((r) => r.id);
    assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
  });

  it('has no duplicate names', () => {
    const names = RECIPES.map((r) => r.name.toLowerCase());
    assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), []);
  });

  it('only references ingredients that exist', () => {
    const unknown: string[] = [];
    for (const recipe of RECIPES) {
      for (const id of recipe.ingredients) {
        if (!ingredientIds.has(id)) unknown.push(`${recipe.id} → ${id}`);
      }
    }
    assert.deepEqual(unknown, []);
  });

  it('uses only valid meal slots', () => {
    const bad = RECIPES.filter((r) => r.meals.some((m) => !MEAL_TYPES.includes(m)));
    assert.deepEqual(bad.map((r) => r.id), []);
  });

  it('uses only valid diet tags', () => {
    const bad = RECIPES.filter((r) => r.diets.some((d) => !DIET_TYPES.includes(d)));
    assert.deepEqual(bad.map((r) => r.id), []);
  });

  it('gives every recipe at least one meal slot, ingredient and step', () => {
    const bad = RECIPES.filter(
      (r) => r.meals.length === 0 || r.ingredients.length === 0 || r.steps.length === 0,
    );
    assert.deepEqual(bad.map((r) => r.id), []);
  });

  it('has plausible calories and cooking times', () => {
    const bad = RECIPES.filter(
      (r) => !(r.calories > 50 && r.calories < 1200) || !(r.minutes > 0 && r.minutes <= 120),
    );
    assert.deepEqual(bad.map((r) => r.id), []);
  });

  it('has calories that roughly match its macros', () => {
    const off: string[] = [];
    for (const r of RECIPES) {
      const fromMacros = r.macros.protein * 4 + r.macros.carbs * 4 + r.macros.fat * 9;
      if (Math.abs(r.calories - fromMacros) > Math.max(60, fromMacros * 0.15)) {
        off.push(`${r.id} (${r.calories} vs ${Math.round(fromMacros)})`);
      }
    }
    assert.deepEqual(off, []);
  });

  it('keeps fibre within total carbohydrate', () => {
    const bad = RECIPES.filter((r) => r.fiber != null && r.fiber > r.macros.carbs);
    assert.deepEqual(bad.map((r) => r.id), []);
  });

  it('has no non-finite or negative nutrition values', () => {
    const bad = RECIPES.filter((r) =>
      [r.calories, r.macros.protein, r.macros.carbs, r.macros.fat, r.fiber ?? 0].some(
        (v) => !Number.isFinite(v) || v < 0,
      ),
    );
    assert.deepEqual(bad.map((r) => r.id), []);
  });

  it('covers every meal slot properly', () => {
    for (const meal of MEAL_TYPES) {
      const count = RECIPES.filter((r) => r.meals.includes(meal)).length;
      assert.ok(count >= 12, `only ${count} recipes for ${meal}`);
    }
  });

  it('is genuinely biased toward high-protein cooking, which is the point', () => {
    // At least half the main meals should clear 25 g of protein.
    const mains = RECIPES.filter((r) => r.meals.some((m) => m === 'lunch' || m === 'dinner'));
    const highProtein = mains.filter((r) => r.macros.protein >= 25);
    assert.ok(
      highProtein.length >= mains.length / 2,
      `${highProtein.length} of ${mains.length} mains are high protein`,
    );
  });

  it('offers enough for restricted diets to be usable', () => {
    for (const diet of ['vegetarian', 'vegan'] as const) {
      const count = RECIPES.filter((r) => r.diets.includes(diet)).length;
      assert.ok(count >= 8, `only ${count} ${diet} recipes`);
    }
  });

  it('uses kebab-case ids', () => {
    const bad = RECIPES.filter((r) => !/^[a-z0-9-]+$/.test(r.id));
    assert.deepEqual(bad.map((r) => r.id), []);
  });
});
