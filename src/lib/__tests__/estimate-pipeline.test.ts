import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  runEstimate,
  type EstimateRequest,
  type ModelRequest,
} from '@/lib/estimate-pipeline';
import { rememberProduct, type ScannedProductInput } from '@/lib/product-memory';
import type { EntryItem } from '@/types';

/**
 * The estimator end to end, with a scripted model.
 *
 * Every case here is a real failure observed while using the app, replayed
 * against the pipeline. They are worth having as tests rather than as prompt
 * wording because a prompt cannot be asserted on: the point of the validation
 * layer is that it holds even when the model ignores what it was told, so every
 * test below scripts a model that *does* ignore it.
 */

// --- scripted model --------------------------------------------------------

interface ScriptedComponent {
  name: string;
  quantity?: number;
  unit?: string;
  calories: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  evidence?: 'description' | 'vision' | 'inferred';
  confidence?: number;
}

function reply(components: ScriptedComponent[], name = 'Meal') {
  return {
    name,
    components: components.map((c) => ({
      quantity: 1,
      unit: 'serving',
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      evidence: 'description' as const,
      confidence: 0.7,
      ...c,
    })),
    unresolved: [],
  };
}

/** A model that answers with the given replies in order, recording its prompts. */
function scriptedModel(...replies: unknown[]) {
  const prompts: ModelRequest[] = [];
  const call = async (request: ModelRequest) => {
    prompts.push(request);
    const next = replies[Math.min(prompts.length - 1, replies.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  };
  return { call, prompts };
}

const PHOTO = { base64: 'ZmFrZQ==', mimeType: 'image/jpeg' };

const text = (request: ModelRequest) =>
  request.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

const named = (items: EntryItem[], pattern: RegExp) => items.filter((i) => pattern.test(i.name));

const sumCalories = (items: EntryItem[]) => items.reduce((sum, i) => sum + i.calories, 0);

// ---------------------------------------------------------------------------
// Test A — no hallucinated ingredients
// ---------------------------------------------------------------------------

describe('Test A — the estimator does not invent ingredients', () => {
  const request: EstimateRequest = {
    description: 'oatmeal, Greek yogurt, banana, raspberries, protein powder',
    photos: [PHOTO],
  };

  it('drops a honey drizzle nobody mentioned', async () => {
    // The real failure: a bowl of oats came back with "Honey or sweetener
    // drizzle — 69 kcal" attached to it.
    const model = scriptedModel(
      reply([
        { name: 'Oatmeal', calories: 190 },
        { name: 'Greek yogurt', calories: 120 },
        { name: 'Banana', calories: 105 },
        { name: 'Raspberries', calories: 40 },
        { name: 'Protein powder', calories: 120 },
        { name: 'Honey or sweetener drizzle', calories: 69, evidence: 'inferred' },
      ]),
    );

    const result = await runEstimate(request, model.call);

    assert.equal(named(result.items, /honey|sweeten/i).length, 0);
    assert.equal(result.items.length, 5);
    assert.equal(result.calories, 575, 'the invented calories are gone from the total too');
    assert.ok(result.notes.some((n) => /honey/i.test(n)), 'and the removal is said out loud');
  });

  it('drops inferred oil, butter and dressing the same way', async () => {
    const model = scriptedModel(
      reply([
        { name: 'Chicken breast', calories: 250 },
        { name: 'Salad', calories: 30 },
        { name: 'Olive oil for cooking', calories: 120, evidence: 'inferred' },
        { name: 'Butter', calories: 74, evidence: 'inferred' },
        { name: 'Ranch dressing', calories: 145, evidence: 'inferred' },
      ]),
    );
    const result = await runEstimate({ description: 'chicken breast and salad' }, model.call);
    assert.deepEqual(result.items.map((i) => i.name), ['Chicken breast', 'Salad']);
    assert.equal(result.calories, 280);
  });

  it('keeps an optional ingredient the user did mention', async () => {
    const model = scriptedModel(
      reply([
        { name: 'Oatmeal', calories: 190 },
        { name: 'Honey', calories: 64 },
      ]),
    );
    const result = await runEstimate({ description: 'oatmeal with honey' }, model.call);
    assert.equal(named(result.items, /honey/i).length, 1);
    assert.equal(result.calories, 254);
  });

  it('keeps an optional ingredient the model can actually see', async () => {
    // The one licence to add something unmentioned: it is visible in a photo
    // and the model says so with high confidence.
    const model = scriptedModel(
      reply([
        { name: 'Pancakes', calories: 350 },
        { name: 'Maple syrup', calories: 100, evidence: 'vision', confidence: 0.9 },
      ]),
    );
    const result = await runEstimate({ description: 'pancakes', photos: [PHOTO] }, model.call);
    assert.equal(named(result.items, /syrup/i).length, 1);
  });

  it('does not strip a food from a photo-only meal', async () => {
    // With no description there is nothing to contradict, so everything the
    // model reports is a visual finding and all of it stands.
    const model = scriptedModel(
      reply([
        { name: 'Toast', calories: 160 },
        { name: 'Butter', calories: 74, evidence: 'vision', confidence: 0.6 },
      ]),
    );
    const result = await runEstimate({ photos: [PHOTO] }, model.call);
    assert.equal(result.items.length, 2);
  });
});

// ---------------------------------------------------------------------------
// Test B — stated calories are hard constraints
// ---------------------------------------------------------------------------

describe('Test B — a number the user stated cannot be overridden', () => {
  const request: EstimateRequest = {
    description: '300 ml milk which is 150 kcal + one scoop protein powder',
  };

  it('restores the stated milk calories and keeps the meal above them', async () => {
    // The real failure: milk stated at 150 kcal, whole meal came back as ~120.
    const model = scriptedModel(
      reply([
        { name: 'Milk', calories: 90, protein_g: 6 },
        { name: 'Protein powder', calories: 30, protein_g: 5 },
      ]),
    );

    const result = await runEstimate(request, model.call);
    const milk = named(result.items, /milk/i)[0];

    assert.equal(milk.calories, 150, 'the stated number wins');
    assert.equal(milk.source, 'user', 'and is recorded as the user\'s, not a guess');
    assert.equal(named(result.items, /protein/i).length, 1, 'the other food survives');
    assert.ok(result.calories > 150, `total ${result.calories} must exceed the known component`);
    assert.equal(result.calories, sumCalories(result.items));
  });

  it('scales the macros with the corrected calories', async () => {
    const model = scriptedModel(
      reply([{ name: 'Milk', calories: 75, protein_g: 5, carbs_g: 7, fat_g: 2 }]),
    );
    const result = await runEstimate({ description: '300 ml milk which is 150 kcal' }, model.call);
    const milk = result.items[0];
    assert.equal(milk.calories, 150);
    // Doubling the calories doubles the macros rather than leaving an
    // internally incoherent component behind.
    assert.equal(milk.macros.protein, 10);
    assert.equal(milk.macros.carbs, 14);
  });

  it('takes a stated macro literally even when the calories were right', async () => {
    const model = scriptedModel(
      reply([{ name: 'Whey', calories: 126, protein_g: 12 }]),
    );
    const result = await runEstimate(
      { description: '1 scoop whey is 126 kcal and 20 g protein' },
      model.call,
    );
    assert.equal(result.items[0].macros.protein, 20);
  });

  it('tells the model the constraint up front', async () => {
    const model = scriptedModel(reply([{ name: 'Milk', calories: 150 }]));
    await runEstimate(request, model.call);
    assert.match(text(model.prompts[0]), /USER STATED — use exactly: exactly 150 kcal/);
  });
});

// ---------------------------------------------------------------------------
// Test C / D — nothing named may disappear, and counts survive
// ---------------------------------------------------------------------------

describe('Test C — a food the user named cannot disappear', () => {
  const request: EstimateRequest = {
    description: '3 cans tuna in oil, drained + cherry tomatoes + 1 bread roll',
    photos: [PHOTO],
  };

  it('asks the model again when a named food is missing', async () => {
    // The real failure: the three cans of tuna — the largest protein source in
    // the meal — simply were not in the breakdown.
    const model = scriptedModel(
      reply([
        { name: 'Cherry tomatoes', calories: 30 },
        { name: 'Bread roll', calories: 150 },
      ]),
      reply([
        { name: 'Tuna, drained', quantity: 3, unit: 'can', calories: 400, protein_g: 78 },
        { name: 'Cherry tomatoes', calories: 30 },
        { name: 'Bread roll', calories: 150 },
      ]),
    );

    const result = await runEstimate(request, model.call);

    assert.equal(model.prompts.length, 2, 'exactly one corrective call');
    assert.equal(named(result.items, /tuna/i).length, 1);
    assert.equal(named(result.items, /tomato/i).length, 1);
    assert.equal(named(result.items, /bread/i).length, 1);
    assert.equal(result.calories, 580);
  });

  it('names the missing food in the correction, and does not resend the photo', async () => {
    const model = scriptedModel(
      reply([{ name: 'Cherry tomatoes', calories: 30 }, { name: 'Bread roll', calories: 150 }]),
      reply([
        { name: 'Tuna', quantity: 3, unit: 'can', calories: 400 },
        { name: 'Cherry tomatoes', calories: 30 },
        { name: 'Bread roll', calories: 150 },
      ]),
    );
    await runEstimate(request, model.call);

    const correction = model.prompts[1];
    assert.match(text(correction), /tuna/i);
    assert.equal(
      correction.content.some((b) => b.type === 'image'),
      false,
      'vision is the expensive part and it was already done',
    );
    assert.equal(model.prompts[0].content.some((b) => b.type === 'image'), true);
  });

  it('falls back to the food table when the retry also drops it', async () => {
    const dropped = reply([
      { name: 'Cherry tomatoes', calories: 30 },
      { name: 'Bread roll', calories: 150 },
    ]);
    const model = scriptedModel(dropped, dropped);

    const result = await runEstimate(request, model.call);

    const tuna = named(result.items, /tuna/i);
    assert.equal(tuna.length, 1, 'the food is still in the breakdown');
    assert.equal(tuna[0].source, 'library');
    assert.ok(tuna[0].calories > 300, `three cans is ${tuna[0].calories} kcal, not a token amount`);
    assert.equal(result.modelCalls, 2);
  });

  it('shows a food it truly cannot resolve rather than dropping it', async () => {
    const model = scriptedModel(reply([{ name: 'Salad', calories: 40 }]));
    const result = await runEstimate(
      { description: 'salad and 2 portions of grandmas zganci' },
      model.call,
    );
    assert.deepEqual(result.needsClarification.length > 0, true);
    const unresolved = result.items.find((i) => i.source === 'unresolved');
    assert.ok(unresolved, 'it is present in the breakdown as an open question');
    assert.equal(unresolved.calories, 0, 'with no invented number attached');
    assert.ok(result.confidence <= 0.35, `confidence ${result.confidence} must reflect the gap`);
  });
});

describe('Test D — quantities are preserved', () => {
  it('rescales a component the model counted as one instead of three', async () => {
    const model = scriptedModel(
      reply([
        { name: 'Tuna, canned', quantity: 1, unit: 'can', calories: 150, protein_g: 26 },
        { name: 'Bread roll', calories: 150 },
      ]),
    );
    const result = await runEstimate(
      { description: '3 cans tuna and 1 bread roll' },
      model.call,
    );

    const tuna = named(result.items, /tuna/i)[0];
    assert.equal(tuna.quantity, 3);
    assert.equal(tuna.calories, 450);
    assert.equal(tuna.macros.protein, 78);
    assert.ok(result.notes.some((n) => /rescaled to 3/.test(n)));
  });

  it('leaves a component alone when it expressed the count as a weight', async () => {
    // 3 cans stated as 435 g is not an error, and must not be tripled.
    const model = scriptedModel(
      reply([{ name: 'Tuna, canned', quantity: 435, unit: 'g', calories: 505 }]),
    );
    const result = await runEstimate({ description: '3 cans tuna' }, model.call);
    assert.equal(result.items[0].calories, 505);
  });

  it('passes the count to the model in the first place', async () => {
    const model = scriptedModel(reply([{ name: 'Tuna', calories: 500 }]));
    await runEstimate({ description: '3 cans tuna, oil drained' }, model.call);
    const prompt = text(model.prompts[0]);
    assert.match(prompt, /3 cans tuna/);
    assert.match(prompt, /drained/);
  });
});

// ---------------------------------------------------------------------------
// Test E / F — remembered products
// ---------------------------------------------------------------------------

const GAINER: ScannedProductInput = {
  barcode: '111',
  name: 'Battery Nutrition Rebel Gainer Chocolate',
  perServing: { calories: 126, macros: { protein: 20, carbs: 8, fat: 2 }, label: '1 scoop (30 g)' },
  per100: { calories: 420, macros: { protein: 67, carbs: 27, fat: 7 } },
  servingGrams: 30,
};

const OTHER_WHEY: ScannedProductInput = {
  barcode: '222',
  name: 'Myprotein Impact Whey Vanilla',
  perServing: { calories: 103, macros: { protein: 21, carbs: 1, fat: 2 }, label: '1 scoop (25 g)' },
  per100: { calories: 412, macros: { protein: 84, carbs: 4, fat: 8 } },
  servingGrams: 25,
};

describe('Test E — a remembered product is used instead of a guess', () => {
  const savedProducts = rememberProduct([], GAINER, 1_000);

  it('resolves "protein powder" to the saved product with its exact numbers', async () => {
    const model = scriptedModel(reply([{ name: 'Oatmeal', calories: 190, carbs_g: 34 }]));
    const result = await runEstimate(
      { description: 'oatmeal with one scoop protein powder', savedProducts },
      model.call,
    );

    const powder = result.items.find((i) => /rebel gainer/i.test(i.name));
    assert.ok(powder, 'the saved product is what got logged');
    assert.equal(powder.source, 'saved');
    assert.equal(powder.calories, 126, 'the label number, not an estimate');
    assert.equal(powder.macros.protein, 20);
    assert.equal(result.calories, 316);
  });

  it('does not ask the model to estimate it', async () => {
    const model = scriptedModel(reply([{ name: 'Oatmeal', calories: 190 }]));
    await runEstimate(
      { description: 'oatmeal with one scoop protein powder', savedProducts },
      model.call,
    );

    const prompt = text(model.prompts[0]);
    assert.match(prompt, /ALREADY KNOWN EXACTLY[\s\S]*Rebel Gainer/);
    // The only thing left to work out is the oats.
    assert.match(prompt, /Foods to account for[\s\S]*oatmeal/);
    assert.equal(/Foods to account for[\s\S]*protein powder/.test(prompt), false);
  });

  it('spends no model call at all when memory covers the whole meal', async () => {
    const model = scriptedModel(new Error('the model must not be called'));
    const result = await runEstimate(
      { description: '2 scoops protein powder', savedProducts },
      model.call,
    );
    assert.equal(model.prompts.length, 0);
    assert.equal(result.modelCalls, 0);
    assert.equal(result.calories, 252, 'two scoops of the saved product');
    assert.equal(result.confidence >= 0.9, true);
  });

  it('scales a remembered product by weight using its per-100 g figures', async () => {
    const model = scriptedModel(new Error('the model must not be called'));
    const result = await runEstimate({ description: '45 g protein powder', savedProducts }, model.call);
    assert.equal(result.calories, 189, '45 g at 420 kcal/100 g');
  });

  it('lets a number the user typed override even the saved product', async () => {
    // The evidence hierarchy in one assertion: user > barcode.
    const model = scriptedModel(new Error('the model must not be called'));
    const result = await runEstimate(
      { description: '1 scoop protein powder which is 140 kcal', savedProducts },
      model.call,
    );
    assert.equal(result.calories, 140);
    assert.equal(result.items[0]?.source ?? result.items[0], 'user');
  });
});

describe('Test F — scanning a replacement switches the default', () => {
  let savedProducts = rememberProduct([], GAINER, 1_000);
  savedProducts = rememberProduct(savedProducts, OTHER_WHEY, 2_000);

  it('uses the newly scanned product for the generic phrase', async () => {
    const model = scriptedModel(new Error('the model must not be called'));
    const result = await runEstimate(
      { description: 'one scoop protein powder', savedProducts },
      model.call,
    );
    assert.match(result.items[0]?.name ?? result.name, /Myprotein/);
    assert.equal(result.calories, 103);
  });

  it('still uses the old product when it is named', async () => {
    const model = scriptedModel(new Error('the model must not be called'));
    const result = await runEstimate(
      { description: 'one scoop rebel gainer', savedProducts },
      model.call,
    );
    assert.equal(result.calories, 126);
  });
});

// ---------------------------------------------------------------------------
// Test G — arithmetic
// ---------------------------------------------------------------------------

describe('Test G — the total is always the sum of the parts', () => {
  it('adds the components up', async () => {
    const model = scriptedModel(
      reply([
        { name: 'Rice', calories: 330 },
        { name: 'Chicken', calories: 195 },
        { name: 'Broccoli', calories: 34 },
        { name: 'Cashews', calories: 203 },
      ]),
    );
    const result = await runEstimate(
      { description: 'rice, chicken, broccoli, cashews' },
      model.call,
    );
    assert.equal(result.calories, 762);
    assert.equal(result.calories, sumCalories(result.items));
  });

  it('adds the macros up too', async () => {
    const model = scriptedModel(
      reply([
        { name: 'Rice', calories: 330, protein_g: 7, carbs_g: 72, fat_g: 1 },
        { name: 'Chicken', calories: 195, protein_g: 36, carbs_g: 0, fat_g: 4 },
      ]),
    );
    const result = await runEstimate({ description: 'rice and chicken' }, model.call);
    assert.deepEqual(result.macros, { protein: 43, carbs: 72, fat: 5 });
  });

  it('sums scanned and estimated components together', async () => {
    const model = scriptedModel(reply([{ name: 'Side salad', calories: 60 }]));
    const result = await runEstimate(
      {
        description: 'side salad',
        knownItems: [
          { name: 'Protein bar', calories: 220, macros: { protein: 20, carbs: 22, fat: 7 }, quantity: 2 },
        ],
      },
      model.call,
    );
    assert.equal(result.calories, 500, '220 × 2 scanned, plus 60 estimated');
    assert.equal(result.calories, sumCalories(result.items));
  });
});

// ---------------------------------------------------------------------------
// Cost and degradation
// ---------------------------------------------------------------------------

describe('cost', () => {
  it('spends one model call on a normal successful meal', async () => {
    const model = scriptedModel(
      reply([
        { name: 'Oatmeal', calories: 190 },
        { name: 'Banana', calories: 105 },
      ]),
    );
    const result = await runEstimate(
      { description: 'oatmeal and banana', photos: [PHOTO] },
      model.call,
    );
    assert.equal(result.modelCalls, 1);
  });

  it('spends none on a scan-only meal', async () => {
    const model = scriptedModel(new Error('the model must not be called'));
    const result = await runEstimate(
      {
        knownItems: [
          { name: 'Protein bar', calories: 220, macros: { protein: 20, carbs: 22, fat: 7 }, quantity: 1 },
        ],
      },
      model.call,
    );
    assert.equal(result.modelCalls, 0);
    assert.equal(result.calories, 220);
  });

  it('does not retry for an invented ingredient, which it can fix itself', async () => {
    const model = scriptedModel(
      reply([
        { name: 'Oatmeal', calories: 190 },
        { name: 'Honey', calories: 69, evidence: 'inferred' },
      ]),
    );
    const result = await runEstimate({ description: 'oatmeal' }, model.call);
    assert.equal(result.modelCalls, 1);
    assert.equal(result.items.length, 1);
  });

  it('does not retry for a count it can rescale itself', async () => {
    const model = scriptedModel(
      reply([{ name: 'Tuna', quantity: 1, unit: 'can', calories: 150 }]),
    );
    const result = await runEstimate({ description: '3 cans tuna' }, model.call);
    assert.equal(result.modelCalls, 1);
    assert.equal(result.calories, 450);
  });
});

describe('degradation', () => {
  it('falls back to the food table when the transport fails', async () => {
    const model = scriptedModel(new Error('offline'));
    const result = await runEstimate(
      { description: '150 g chicken breast and 100 g rice', photos: [PHOTO] },
      model.call,
    );
    assert.equal(result.estimatedOffline, true, 'the UI must be able to say the photo was not read');
    assert.equal(result.items.length, 2);
    assert.ok(result.calories > 300, `${result.calories} kcal from the reference table`);
  });

  it('honours stated numbers even with no model at all', async () => {
    const result = await runEstimate({ description: '300 ml milk which is 150 kcal' }, undefined);
    assert.equal(result.calories, 150);
    assert.equal(result.items[0].source, 'user');
  });

  it('keeps scanned products exact with no model at all', async () => {
    const result = await runEstimate(
      {
        description: 'and a side salad',
        knownItems: [
          { name: 'Skyr', calories: 120, macros: { protein: 20, carbs: 7, fat: 0 }, quantity: 1 },
        ],
      },
      undefined,
    );
    assert.equal(named(result.items, /skyr/i)[0].calories, 120);
  });
});

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

describe('confidence means something', () => {
  it('is high when everything is exact', async () => {
    const result = await runEstimate(
      {
        knownItems: [
          { name: 'Skyr', calories: 120, macros: { protein: 20, carbs: 7, fat: 0 }, quantity: 1 },
          { name: 'Protein bar', calories: 220, macros: { protein: 20, carbs: 22, fat: 7 }, quantity: 1 },
        ],
      },
      undefined,
    );
    assert.ok(result.confidence >= 0.95, `expected high confidence, got ${result.confidence}`);
  });

  it('is capped low when a named food could not be resolved', async () => {
    const model = scriptedModel(reply([{ name: 'Salad', calories: 40 }]));
    const result = await runEstimate(
      { description: 'salad and 2 portions of grandmas zganci' },
      model.call,
    );
    assert.ok(result.confidence <= 0.35, `expected a low number, got ${result.confidence}`);
  });

  it('is knocked down when the answer had to be repaired', async () => {
    const clean = scriptedModel(reply([{ name: 'Oatmeal', calories: 190, confidence: 0.8 }]));
    const repaired = scriptedModel(
      reply([
        { name: 'Oatmeal', calories: 190, confidence: 0.8 },
        { name: 'Honey', calories: 69, evidence: 'inferred', confidence: 0.8 },
      ]),
    );
    const a = await runEstimate({ description: 'oatmeal' }, clean.call);
    const b = await runEstimate({ description: 'oatmeal' }, repaired.call);
    assert.ok(b.confidence < a.confidence, `${b.confidence} should be under ${a.confidence}`);
  });
});
