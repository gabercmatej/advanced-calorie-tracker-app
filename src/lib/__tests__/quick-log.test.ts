import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { foodKey, isSaved, quickToEntry, recentFoods, savedToQuick } from '../quick-log.ts';
import type { FoodEntry, SavedFood } from '../../types/index.ts';

let seq = 0;
function entry(name: string, date: string, over: Partial<FoodEntry> = {}): FoodEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    name,
    date,
    meal: 'lunch',
    calories: 500,
    macros: { protein: 30, carbs: 40, fat: 20 },
    quantity: 1,
    createdAt: seq,
    ...over,
  };
}

const TODAY = '2026-08-29';

describe('foodKey', () => {
  it('treats case and spacing differences as the same food', () => {
    assert.equal(foodKey('  Chicken   Rice ', 500), foodKey('chicken rice', 500));
  });

  it('keeps different portions of the same food apart', () => {
    // 30 g and 60 g of oats must not merge into one wrong number.
    assert.notEqual(foodKey('oats', 150), foodKey('oats', 300));
  });
});

describe('recentFoods', () => {
  it('collapses repeats of the same food into one row', () => {
    const list = recentFoods(
      [entry('Chicken and rice', '2026-08-27'), entry('Chicken and rice', '2026-08-28')],
      { today: TODAY },
    );
    assert.equal(list.length, 1);
    assert.equal(list[0].timesLogged, 2);
    assert.equal(list[0].lastLogged, '2026-08-28');
  });

  it('puts the most recently eaten food first, however rarely it is eaten', () => {
    // The list is short and is called "recent", so it orders by when a food was
    // last actually eaten. A staple logged eight times last week does not
    // outrank the thing eaten an hour ago.
    const staple = Array.from({ length: 8 }, (_, i) =>
      entry('Chicken and rice', `2026-08-2${i + 1}`),
    );
    const oneOff = [entry('Birthday cake', TODAY)];
    const list = recentFoods([...staple, ...oneOff], { today: TODAY });
    assert.equal(list[0].name, 'Birthday cake');
    assert.equal(list[1].name, 'Chicken and rice');
  });

  it('lets a stale food fade below a current one', () => {
    // Same number of loggings; the older set is several half-lives back.
    const old = Array.from({ length: 3 }, () => entry('Old meal', '2026-05-01'));
    const fresh = Array.from({ length: 3 }, () => entry('New meal', '2026-08-28'));
    const list = recentFoods([...old, ...fresh], { today: TODAY });
    assert.equal(list[0].name, 'New meal');
  });

  it('keeps the newest ten and drops the rest, without touching history', () => {
    // The cap is a display limit applied after grouping, so the eleventh food
    // is merely off the list — it is still in the diary, and still returned by
    // a larger limit.
    const many = Array.from({ length: 30 }, (_, i) =>
      entry(`Food ${i}`, TODAY, { calories: 100 + i, createdAt: i + 1 }),
    );
    const list = recentFoods(many, { today: TODAY, limit: 10 });
    assert.equal(list.length, 10);
    assert.equal(list[0].name, 'Food 29');
    assert.equal(list[9].name, 'Food 20');
    assert.equal(recentFoods(many, { today: TODAY, limit: 30 }).length, 30);
  });

  it('shows one row per repeated food, so the ten are ten different foods', () => {
    const repeats = Array.from({ length: 12 }, (_, i) =>
      entry('Chicken and rice', TODAY, { createdAt: i + 1 }),
    );
    const others = Array.from({ length: 3 }, (_, i) =>
      entry(`Other ${i}`, TODAY, { calories: 200 + i, createdAt: 100 + i }),
    );
    const list = recentFoods([...repeats, ...others], { today: TODAY, limit: 10 });
    assert.equal(list.length, 4);
    assert.equal(list.filter((f) => f.name === 'Chicken and rice').length, 1);
  });

  it('takes values from the most recent logging, so a correction sticks', () => {
    const list = recentFoods(
      [
        entry('Protein shake', '2026-08-20', { calories: 200, createdAt: 1 }),
        entry('Protein shake', '2026-08-28', { calories: 200, createdAt: 2, macros: { protein: 44, carbs: 5, fat: 2 } }),
      ],
      { today: TODAY },
    );
    assert.equal(list[0].macros.protein, 44);
  });

  it('preselects the meal slot the food is usually eaten in', () => {
    const list = recentFoods(
      [
        entry('Oats', '2026-08-26', { meal: 'breakfast' }),
        entry('Oats', '2026-08-27', { meal: 'breakfast' }),
        entry('Oats', '2026-08-28', { meal: 'snack' }),
      ],
      { today: TODAY },
    );
    assert.equal(list[0].usualMeal, 'breakfast');
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 40 }, (_, i) => entry(`Food ${i}`, TODAY));
    assert.equal(recentFoods(many, { today: TODAY, limit: 10 }).length, 10);
  });

  it('handles an empty diary', () => {
    assert.deepEqual(recentFoods([], { today: TODAY }), []);
  });

  it('ignores entries with a blank name', () => {
    assert.equal(recentFoods([entry('   ', TODAY)], { today: TODAY }).length, 0);
  });

  it('does not share macro objects with the source entry', () => {
    // The bug this guards: re-logging then editing would rewrite history.
    const source = entry('Chicken and rice', TODAY);
    const [quick] = recentFoods([source], { today: TODAY });
    quick.macros.protein = 999;
    assert.equal(source.macros.protein, 30);
  });
});

describe('quickToEntry', () => {
  const [quick] = recentFoods([entry('Chicken and rice', TODAY, { fiber: 4 })], { today: TODAY });

  it('produces a fresh entry that cannot alias the original', () => {
    const draft = quickToEntry(quick, 'dinner', '2026-08-29');
    draft.macros.protein = 999;
    assert.equal(quick.macros.protein, 30);
  });

  it('carries calories, macros and fibre across', () => {
    const draft = quickToEntry(quick, 'dinner', '2026-08-29');
    assert.equal(draft.calories, 500);
    assert.equal(draft.macros.carbs, 40);
    assert.equal(draft.fiber, 4);
  });

  it('is never badged as AI-estimated — it is a lookup, not a guess', () => {
    assert.equal(quickToEntry(quick, 'lunch', TODAY).aiEstimated, false);
  });

  it('applies the requested date, meal and quantity', () => {
    const draft = quickToEntry(quick, 'breakfast', '2026-07-01', 2.5);
    assert.equal(draft.date, '2026-07-01');
    assert.equal(draft.meal, 'breakfast');
    assert.equal(draft.quantity, 2.5);
    // Per-serving values stay per-serving; quantity is the multiplier.
    assert.equal(draft.calories, 500);
  });
});

describe('saved foods', () => {
  const saved: SavedFood[] = [
    {
      id: 's1',
      name: 'Whey shake',
      calories: 120,
      macros: { protein: 24, carbs: 3, fat: 2 },
      createdAt: 1,
    },
  ];

  it('recognises an already-pinned food regardless of case', () => {
    assert.equal(isSaved(saved, { name: 'whey SHAKE', calories: 120 }), true);
  });

  it('treats a different portion as a different food', () => {
    assert.equal(isSaved(saved, { name: 'Whey shake', calories: 240 }), false);
  });

  it('converts to the same shape as a recent food', () => {
    const quick = savedToQuick(saved[0]);
    assert.equal(quick.name, 'Whey shake');
    assert.equal(quick.calories, 120);
    assert.ok(quick.key.startsWith('saved:'));
  });

  it('does not share macros with the stored record', () => {
    const quick = savedToQuick(saved[0]);
    quick.macros.protein = 1;
    assert.equal(saved[0].macros.protein, 24);
  });
});
