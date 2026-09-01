import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseMealDescription, statedCalories, type FoodMention } from '@/lib/meal-parse';

/**
 * Stage A of the estimator, tested on the sentences people actually type.
 *
 * Everything downstream — the hard calorie constraints, the coverage check, the
 * count that must survive to the diary — is built on what this file extracts.
 * A miss here is not a parsing bug, it is a silently wrong calorie count.
 */

const find = (mentions: FoodMention[], word: string) =>
  mentions.find((m) => m.phrase.includes(word));

describe('food mentions', () => {
  it('splits a list into one mention per food', () => {
    const { mentions } = parseMealDescription(
      'oatmeal, Greek yogurt, banana, raspberries, protein powder',
    );
    assert.deepEqual(
      mentions.map((m) => m.phrase),
      ['oatmeal', 'greek yogurt', 'banana', 'raspberries', 'protein powder'],
    );
  });

  it('splits on + and "and" as well as commas', () => {
    const { mentions } = parseMealDescription('chicken + rice and broccoli');
    assert.deepEqual(mentions.map((m) => m.phrase), ['chicken', 'rice', 'broccoli']);
  });

  it('treats "with" as a separator for a second food', () => {
    const { mentions } = parseMealDescription('oatmeal with one scoop protein powder');
    assert.deepEqual(mentions.map((m) => m.phrase), ['oatmeal', 'protein powder']);
  });
});

describe('quantity preservation', () => {
  // Test D. Three cans that become one can is a ~340 kcal error on one meal.
  it('keeps a count of three cans as three', () => {
    const { mentions } = parseMealDescription('3 cans tuna');
    assert.equal(mentions.length, 1);
    assert.equal(mentions[0].quantity?.amount, 3);
    assert.equal(mentions[0].quantity?.unit, 'can');
  });

  it('keeps a volume as stated', () => {
    const { mentions } = parseMealDescription('300 ml milk');
    assert.equal(mentions[0].quantity?.amount, 300);
    assert.equal(mentions[0].quantity?.unit, 'ml');
  });

  it('keeps a count of scoops as stated', () => {
    const { mentions } = parseMealDescription('2 scoops of whey');
    assert.equal(mentions[0].quantity?.amount, 2);
    assert.equal(mentions[0].quantity?.unit, 'scoop');
  });

  it('reads counts written as words', () => {
    const { mentions } = parseMealDescription('two eggs and one banana');
    assert.equal(find(mentions, 'egg')?.quantity?.amount, 2);
    assert.equal(find(mentions, 'banana')?.quantity?.amount, 1);
  });

  it('normalises mass and volume to grams and millilitres', () => {
    assert.equal(parseMealDescription('1.5 kg potatoes').mentions[0].quantity?.amount, 1500);
    assert.equal(parseMealDescription('0.5 l milk').mentions[0].quantity?.amount, 500);
  });

  it('reads halves and fractions', () => {
    assert.equal(parseMealDescription('half package of rice').mentions[0].quantity?.amount, 0.5);
    assert.equal(parseMealDescription('1/2 avocado').mentions[0].quantity?.amount, 0.5);
  });

  it('does not lose a food name that doubles as a unit', () => {
    // "bar" is a unit *and* half the name of the food. Consuming it would
    // rename "protein bar" to "protein".
    const { mentions } = parseMealDescription('this protein bar is 220 calories');
    assert.equal(mentions[0].phrase, 'protein bar');
    assert.equal(statedCalories(mentions[0]), 220);
  });
});

describe('nutrition the user states outright', () => {
  // Test B's input, at the parsing layer.
  it('reads a calorie figure attached to one food', () => {
    const { mentions } = parseMealDescription('300 ml milk which is 150 kcal + protein powder');
    const milk = find(mentions, 'milk')!;
    assert.equal(statedCalories(milk), 150);
    assert.equal(milk.quantity?.amount, 300);
    // The other food is still its own mention with nothing stated.
    assert.equal(find(mentions, 'protein powder')?.stated, undefined);
  });

  it('does not mistake a portion size for a calorie figure', () => {
    const { mentions } = parseMealDescription('300 ml milk');
    assert.equal(mentions[0].stated, undefined);
    assert.equal(statedCalories(mentions[0]), undefined);
  });

  it('multiplies a per-unit figure by the count', () => {
    const { mentions } = parseMealDescription('2 scoops whey, 126 kcal per scoop');
    assert.equal(statedCalories(mentions[0]), 252);
  });

  it('applies a per-100 g figure to a stated weight', () => {
    const { mentions } = parseMealDescription('150 g cereal, 390 kcal per 100 g');
    assert.equal(statedCalories(mentions[0]), 585);
  });

  it('leaves a per-100 g figure unresolved when no weight was given', () => {
    const { mentions } = parseMealDescription('cereal, 390 kcal per 100 g');
    assert.equal(mentions[0].stated?.calories, 390);
    assert.equal(mentions[0].stated?.basis, 'per100');
    // No amount to apply the rate to, so there is no hard total. Saying "we do
    // not know" here is the point: guessing 100 g would be inventing a portion.
    assert.equal(statedCalories(mentions[0]), undefined);
  });

  it('reads stated macros alongside calories', () => {
    const { mentions } = parseMealDescription('1 scoop whey is 126 kcal and 20 g protein');
    assert.equal(mentions[0].stated?.calories, 126);
    assert.equal(mentions[0].stated?.protein, 20);
  });

  it('never discards a calorie figure just because no food was named', () => {
    const { mentions } = parseMealDescription('3 cans are 570 kcal');
    assert.equal(mentions.length, 1);
    assert.equal(statedCalories(mentions[0]), 570);
    assert.equal(mentions[0].quantity?.amount, 3);
  });
});

describe('preparation details', () => {
  it('records drained oil as a note and not as an ingredient', () => {
    const { mentions } = parseMealDescription('3 cans of tuna with the oil drained');
    assert.equal(mentions.length, 1, 'the drained oil is not a second food');
    assert.equal(mentions[0].phrase, 'tuna');
    assert.equal(mentions[0].quantity?.amount, 3);
    assert.ok(mentions[0].qualifiers.some((q) => q.includes('drained')));
  });

  it('handles "in oil, drained" as two notes on one food', () => {
    const { mentions } = parseMealDescription('3 cans tuna in oil, drained');
    assert.equal(mentions.length, 1);
    assert.equal(mentions[0].phrase, 'tuna');
    assert.ok(mentions[0].qualifiers.includes('in oil'));
    assert.ok(mentions[0].qualifiers.includes('drained'));
  });

  it('keeps cooked and dry weight qualifiers', () => {
    assert.ok(
      parseMealDescription('100 g rice, dry weight').mentions[0].qualifiers.some((q) =>
        q.includes('dry weight'),
      ),
    );
    assert.ok(
      parseMealDescription('150 g cooked chicken').mentions[0].qualifiers.includes('cooked'),
    );
  });

  it('keeps fat percentages and removals', () => {
    assert.ok(
      parseMealDescription('yogurt 0% fat').mentions[0].qualifiers.some((q) => q.includes('0%')),
    );
    assert.ok(
      parseMealDescription('salad, no dressing').mentions[0].qualifiers.some((q) =>
        q.includes('no dressing'),
      ),
    );
    assert.ok(
      parseMealDescription('chicken thigh, skin removed').mentions[0].qualifiers.some((q) =>
        q.includes('removed'),
      ),
    );
  });
});

describe('empty input', () => {
  it('produces no mentions for a photo-only meal', () => {
    assert.deepEqual(parseMealDescription(undefined).mentions, []);
    assert.deepEqual(parseMealDescription('   ').mentions, []);
  });
});
