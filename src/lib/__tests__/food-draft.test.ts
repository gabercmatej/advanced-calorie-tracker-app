import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { draftFromEstimate, draftToEntry } from '@/lib/food-draft';
import { runEstimate, type ModelRequest } from '@/lib/estimate-pipeline';
import { rememberProduct } from '@/lib/product-memory';
import { EXACT_SOURCES, type FoodEntry } from '@/types';

/**
 * What actually lands in the diary.
 *
 * The three failures this pass exists to fix were all invisible on screen — the
 * review card looked plausible in every one of them. So the assertions that
 * matter are about the stored `FoodEntry`: its totals, and the `items` array
 * that records where each number came from. This walks the whole path, from the
 * sentence the user typed to the row that gets written.
 */

function reply(components: { name: string; calories: number; quantity?: number; unit?: string; protein_g?: number; carbs_g?: number; fat_g?: number; evidence?: 'description' | 'vision' | 'inferred' }[]) {
  return {
    name: 'Meal',
    components: components.map((c) => ({
      quantity: 1, unit: 'serving', protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0,
      evidence: 'description' as const, confidence: 0.7, ...c,
    })),
    unresolved: [],
  };
}

function model(...replies: unknown[]) {
  let n = 0;
  return async (_request: ModelRequest) => replies[Math.min(n++, replies.length - 1)];
}

/** Everything the logger screen supplies around the draft itself. */
const CONTEXT = { date: '2026-08-31', meal: 'breakfast' as const, captured: true };

/** The invariant that makes a breakdown trustworthy at all. */
function assertCoherent(entry: Omit<FoodEntry, 'id' | 'createdAt'>) {
  if (!entry.items?.length) return;
  const sum = entry.items.reduce((total, item) => total + item.calories, 0);
  assert.equal(entry.calories, sum, 'the stored total must equal the stored breakdown');
}

describe('the breakfast that grew a honey drizzle', () => {
  it('stores five components and no honey', async () => {
    const estimate = await runEstimate(
      {
        description: 'oatmeal, Greek yogurt, banana, raspberries, protein powder',
        photos: [{ base64: 'ZmFrZQ==', mimeType: 'image/jpeg' }],
      },
      model(
        reply([
          { name: 'Oatmeal', calories: 190, carbs_g: 34 },
          { name: 'Greek yogurt', calories: 120, protein_g: 20 },
          { name: 'Banana', calories: 105, carbs_g: 27 },
          { name: 'Raspberries', calories: 40, carbs_g: 9 },
          { name: 'Protein powder', calories: 120, protein_g: 24 },
          { name: 'Honey or sweetener drizzle', calories: 69, evidence: 'inferred' },
        ]),
      ),
    );
    const entry = draftToEntry(draftFromEstimate(estimate), CONTEXT);

    assert.equal(entry.items?.length, 5);
    assert.equal(entry.items?.some((i) => /honey/i.test(i.name)), false);
    assert.equal(entry.calories, 575);
    assert.equal(entry.macros.protein, 44);
    assertCoherent(entry);
  });
});

describe('the shake that came back lighter than its own milk', () => {
  it('stores the stated milk calories and a total above them', async () => {
    const estimate = await runEstimate(
      { description: '300 ml milk which is 150 kcal + one scoop protein powder' },
      model(
        reply([
          { name: 'Milk', calories: 90, protein_g: 6 },
          { name: 'Protein powder', calories: 30, protein_g: 5 },
        ]),
      ),
    );
    const entry = draftToEntry(draftFromEstimate(estimate), CONTEXT);

    const milk = entry.items?.find((i) => /milk/i.test(i.name));
    assert.equal(milk?.calories, 150);
    assert.equal(milk?.source, 'user');
    assert.ok(entry.calories > 150, `stored total ${entry.calories} must exceed the known milk`);
    assertCoherent(entry);
  });
});

describe('the dinner that lost three cans of tuna', () => {
  it('stores tuna, tomatoes and bread, with the tuna counted three times', async () => {
    const estimate = await runEstimate(
      {
        description: '3 cans tuna in oil, drained + cherry tomatoes and 1 bread roll',
        photos: [{ base64: 'ZmFrZQ==', mimeType: 'image/jpeg' }],
      },
      model(
        // First answer drops the tuna, exactly as it did in real use.
        reply([
          { name: 'Cherry tomatoes', calories: 30, carbs_g: 6 },
          { name: 'Bread roll', calories: 150, carbs_g: 29 },
        ]),
        reply([
          { name: 'Tuna, drained', quantity: 3, unit: 'can', calories: 400, protein_g: 78 },
          { name: 'Cherry tomatoes', calories: 30, carbs_g: 6 },
          { name: 'Bread roll', calories: 150, carbs_g: 29 },
        ]),
      ),
    );
    const entry = draftToEntry(draftFromEstimate(estimate), CONTEXT);

    assert.equal(entry.items?.length, 3);
    const tuna = entry.items?.find((i) => /tuna/i.test(i.name));
    assert.equal(tuna?.quantity, 3);
    assert.equal(entry.macros.protein, 78, 'the meal\'s main protein source is in the macros');
    assert.equal(entry.calories, 580);
    assertCoherent(entry);
  });
});

describe('provenance survives into storage', () => {
  it('marks a meal built from facts as not AI-estimated', async () => {
    const savedProducts = rememberProduct([], {
      barcode: '111',
      name: 'Battery Nutrition Rebel Gainer Chocolate',
      perServing: { calories: 126, macros: { protein: 20, carbs: 8, fat: 2 }, label: '1 scoop (30 g)' },
      servingGrams: 30,
    });
    const estimate = await runEstimate(
      { description: '2 scoops protein powder, 300 ml milk which is 150 kcal', savedProducts },
      undefined,
    );
    const entry = draftToEntry(draftFromEstimate(estimate), CONTEXT);

    assert.equal(entry.aiEstimated, false, 'nothing here was guessed at');
    assert.ok(entry.items?.every((i) => EXACT_SOURCES.includes(i.source)));
    assert.equal(entry.calories, 402, '126 × 2 from the label, plus the stated 150');
    assertCoherent(entry);
  });

  it('marks a meal containing a guess as AI-estimated', async () => {
    const estimate = await runEstimate(
      { description: 'oatmeal and a banana' },
      model(reply([{ name: 'Oatmeal', calories: 190 }, { name: 'Banana', calories: 105 }])),
    );
    const entry = draftToEntry(draftFromEstimate(estimate), CONTEXT);
    assert.equal(entry.aiEstimated, true);
  });

  it('keeps an unresolved food in the stored breakdown', async () => {
    // It must be impossible to end up with a diary row that quietly forgot a
    // food. Zero calories and a visible source beat a silent omission.
    const estimate = await runEstimate(
      { description: 'salad and 2 portions of grandmas zganci' },
      model(reply([{ name: 'Salad', calories: 40 }])),
    );
    const entry = draftToEntry(draftFromEstimate(estimate), CONTEXT);
    assert.equal(entry.items?.some((i) => i.source === 'unresolved'), true);
    assertCoherent(entry);
  });
});

describe('the user has the last word', () => {
  it('stores what the user typed over the estimate', async () => {
    const estimate = await runEstimate(
      { description: 'mystery restaurant pasta' },
      model(reply([{ name: 'Pasta dish', calories: 600, protein_g: 20 }])),
    );
    // The review card is editable, and an edit is the highest-ranked evidence
    // there is — it must reach storage untouched.
    const edited = { ...draftFromEstimate(estimate), calories: '780', protein: '35' };
    const entry = draftToEntry(edited, CONTEXT);
    assert.equal(entry.calories, 780);
    assert.equal(entry.macros.protein, 35);
  });

  it('keeps fibre unknown rather than storing a zero', () => {
    const entry = draftToEntry(
      { name: 'Soup', calories: '200', protein: '5', carbs: '20', fat: '9', fiber: '', quantity: '1', confidence: 0.6 },
      CONTEXT,
    );
    assert.equal(entry.fiber, undefined);
  });
});
