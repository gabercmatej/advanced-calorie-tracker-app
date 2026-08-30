import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeAdaptivePlan, estimateTdee, type PlanAnchor } from '../nutrition.ts';
import type { FoodEntry, UserMetrics, WeightEntry } from '../../types/index.ts';

/**
 * The adaptive engine's job is to be *right slowly* rather than wrong quickly.
 * Every test here is a way it could be wrong quickly.
 */

const TODAY = '2026-08-29';

const metrics: UserMetrics = {
  sex: 'male',
  birthDate: '2004-01-01',
  heightCm: 182,
  weightKg: 85,
  workoutsPerWeek: '3-5',
  goalType: 'lose',
  diet: 'balanced',
};

function shiftDate(from: string, days: number): string {
  const d = new Date(`${from}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Weigh-ins for the last `days` days, falling at `kgPerDay`. */
function weighIns(days: number, startKg = 85, kgPerDay = -0.06): WeightEntry[] {
  return Array.from({ length: days }, (_, i) => ({
    date: shiftDate(TODAY, -(days - 1 - i)),
    weightKg: startKg + kgPerDay * i,
  }));
}

/** One entry per day for the last `days` days (day 0 = today), each `kcal`. */
function intake(days: number, kcal = 2200, opts: { includeToday?: boolean } = {}): FoodEntry[] {
  const { includeToday = false } = opts;
  const offset = includeToday ? 0 : 1;
  return Array.from({ length: days }, (_, i) => ({
    id: `e${i}`,
    name: 'Meal',
    date: shiftDate(TODAY, -(i + offset)),
    meal: 'lunch' as const,
    calories: kcal,
    macros: { protein: 150, carbs: 200, fat: 70 },
    quantity: 1,
    createdAt: i,
  }));
}

const plan = (
  entries: FoodEntry[],
  weights: WeightEntry[],
  anchor?: PlanAnchor | null,
  m: UserMetrics = metrics,
) => computeAdaptivePlan(m, entries, weights, anchor, TODAY)!;

describe('applicability', () => {
  it('returns null for maintain and gain goals', () => {
    assert.equal(computeAdaptivePlan({ ...metrics, goalType: 'maintain' }, [], [], null, TODAY), null);
    assert.equal(computeAdaptivePlan({ ...metrics, goalType: 'gain' }, [], [], null, TODAY), null);
  });

  it('returns null before onboarding', () => {
    assert.equal(computeAdaptivePlan(undefined, [], [], null, TODAY), null);
  });
});

describe('falls back to the formula when evidence is thin', () => {
  it('uses the formula with no data at all', () => {
    const p = plan([], []);
    assert.equal(p.basis, 'formula');
    assert.equal(p.observedTdee, null);
    assert.equal(p.blend, 0);
  });

  it('uses the formula when intake is logged but nobody weighed in', () => {
    const p = plan(intake(14), []);
    assert.equal(p.basis, 'formula');
  });

  it('uses the formula when weigh-ins exist but too few days were logged', () => {
    const p = plan(intake(5), weighIns(14));
    assert.equal(p.basis, 'formula');
    assert.equal(p.intakeDays, 5);
  });

  it('uses the formula when weigh-ins are too few to fit', () => {
    const p = plan(intake(14), weighIns(2));
    assert.equal(p.basis, 'formula');
  });

  it('uses the formula when weigh-ins are clustered into too short a span', () => {
    // Three readings on three consecutive days say nothing about a fortnight.
    const p = plan(intake(14), weighIns(3));
    assert.equal(p.basis, 'formula');
  });

  it('goes adaptive once coverage and weigh-ins are both good', () => {
    const p = plan(intake(14), weighIns(14));
    assert.equal(p.basis, 'adaptive');
    assert.ok(p.blend > 0);
  });
});

describe("today's partial intake is excluded", () => {
  it('ignores a part-eaten today, so the target does not sag every morning', () => {
    const complete = intake(14);
    // A single 200 kcal breakfast logged so far today.
    const withToday: FoodEntry[] = [
      ...complete,
      { ...complete[0], id: 'today', date: TODAY, calories: 200 },
    ];
    const a = plan(complete, weighIns(14));
    const b = plan(withToday, weighIns(14));
    assert.equal(a.calories, b.calories);
    assert.equal(a.intakeDays, b.intakeDays);
  });

  it('counts yesterday, which is complete', () => {
    const p = plan(intake(14), weighIns(14));
    assert.equal(p.intakeDays, 14);
  });
});

describe('skipped days are handled safely', () => {
  it('never treats an unlogged day as zero calories', () => {
    // 10 of 14 days logged at 2200. If gaps counted as zero, the average would
    // fall to ~1570 and the target would be cut by hundreds of kcal.
    const sparse = intake(14).filter((_, i) => i % 7 !== 0 && i % 7 !== 1);
    const p = plan(sparse, weighIns(14));
    const dense = plan(intake(14), weighIns(14));
    assert.ok(p.intakeDays < 14);
    // The sparse estimate must not be dramatically below the dense one.
    assert.ok(
      Math.abs(p.calories - dense.calories) < 150,
      `sparse ${p.calories} vs dense ${dense.calories}`,
    );
  });

  it('falls back to the formula entirely once coverage drops too low', () => {
    // 7 of 14 days — half the window missing is not evidence.
    const half = intake(14).filter((_, i) => i % 2 === 0);
    const p = plan(half, weighIns(14));
    assert.equal(p.basis, 'formula');
    assert.ok(p.coverage < 0.7);
  });

  it('reports coverage so the UI can be honest about confidence', () => {
    const p = plan(intake(11), weighIns(14));
    assert.ok(Math.abs(p.coverage - 11 / 14) < 1e-9);
  });
});

describe('conservatism', () => {
  it('never lets observed maintenance stray far from the formula', () => {
    // A wildly implausible week: huge intake, big weight drop.
    const p = plan(intake(14, 6000), weighIns(14, 85, -0.3));
    const formula = estimateTdee({ ...metrics, weightKg: p.trendWeightKg });
    assert.ok(p.observedTdee !== null);
    assert.ok(p.observedTdee! <= formula * 1.25 + 1);
    assert.ok(p.observedTdee! >= formula * 0.75 - 1);
  });

  it('blends toward the formula rather than adopting the observation whole', () => {
    const p = plan(intake(14, 3200), weighIns(14, 85, -0.02));
    const formula = estimateTdee({ ...metrics, weightKg: p.trendWeightKg });
    assert.ok(p.blend <= 0.8);
    // The final target sits between the two, never past the observation.
    const observedTarget = p.observedTdee! - (p.targetWeeklyLossKg * 7700) / 7;
    const formulaTarget = formula - (p.targetWeeklyLossKg * 7700) / 7;
    const lo = Math.min(observedTarget, formulaTarget);
    const hi = Math.max(observedTarget, formulaTarget);
    assert.ok(p.calories >= lo - 15 && p.calories <= hi + 15);
  });

  it('gives thin-but-passing data less influence than rich data', () => {
    const thin = plan(intake(10), weighIns(11));
    const rich = plan(intake(14), weighIns(14));
    assert.ok(thin.blend < rich.blend);
  });

  it('never drops below the calorie floor', () => {
    const aggressive: UserMetrics = {
      ...metrics,
      weightKg: 60,
      targetWeightKg: 50,
      targetDate: shiftDate(TODAY, 20),
    };
    const p = plan(intake(14, 1000), weighIns(14, 60, -0.2), null, aggressive);
    assert.ok(p.calories >= 1500);
  });

  it('caps the loss rate at 1% of bodyweight per week however tight the deadline', () => {
    const rushed: UserMetrics = {
      ...metrics,
      targetWeightKg: 70,
      targetDate: shiftDate(TODAY, 14),
    };
    const p = plan(intake(14), weighIns(14), null, rushed);
    assert.ok(p.targetWeeklyLossKg <= p.trendWeightKg * 0.01 + 1e-9);
  });

  it('holds at maintenance once the target weight is reached', () => {
    const done: UserMetrics = {
      ...metrics,
      targetWeightKg: 90,
      targetDate: shiftDate(TODAY, 60),
    };
    const p = plan(intake(14), weighIns(14), null, done);
    assert.equal(p.targetWeeklyLossKg, 0);
  });
});

describe('smoothed bodyweight', () => {
  it('builds the plan from the trend, not the last reading on the scale', () => {
    const spiked = weighIns(14);
    spiked[spiked.length - 1] = { ...spiked[spiked.length - 1], weightKg: 88 };
    const p = plan(intake(14), spiked);
    assert.ok(p.trendWeightKg < 86, `trend weight was ${p.trendWeightKg}`);
  });

  it('sets protein from the trend weight at 2 g/kg', () => {
    const p = plan(intake(14), weighIns(14));
    assert.equal(p.proteinG, Math.round(p.trendWeightKg * 2));
  });

  it('falls back to the onboarding weight when nothing has been weighed', () => {
    assert.equal(plan([], []).trendWeightKg, 85);
  });
});

describe('rate limiting', () => {
  it('caps how far the target can move in a single day', () => {
    const anchor: PlanAnchor = { calories: 2000, date: shiftDate(TODAY, -1) };
    const p = plan(intake(14, 3400), weighIns(14, 85, -0.01), anchor);
    assert.ok(p.rateLimited);
    assert.ok(Math.abs(p.calories - 2000) <= 75 + 10);
  });

  it('allows a proportionally larger catch-up after a gap', () => {
    const anchor: PlanAnchor = { calories: 2000, date: shiftDate(TODAY, -10) };
    const p = plan(intake(14, 3400), weighIns(14, 85, -0.01), anchor);
    assert.ok(Math.abs(p.calories - 2000) <= 750 + 10);
  });

  it('leaves a small, legitimate change alone', () => {
    const unlimited = plan(intake(14), weighIns(14));
    const anchor: PlanAnchor = { calories: unlimited.calories - 20, date: shiftDate(TODAY, -1) };
    const p = plan(intake(14), weighIns(14), anchor);
    assert.equal(p.rateLimited, false);
    assert.equal(p.calories, unlimited.calories);
  });

  it('still respects the floor when rate limiting pulls the target down', () => {
    const anchor: PlanAnchor = { calories: 1500, date: shiftDate(TODAY, -1) };
    const p = plan(intake(14, 1200), weighIns(14, 60, -0.2), anchor, {
      ...metrics,
      weightKg: 60,
    });
    assert.ok(p.calories >= 1500);
  });

  it('ignores a nonsensical anchor rather than trusting it', () => {
    const p = plan(intake(14), weighIns(14), { calories: 0, date: TODAY });
    assert.equal(p.rateLimited, false);
  });
});

describe('macro targets', () => {
  it('pins protein first and splits what is left', () => {
    const p = plan(intake(14), weighIns(14));
    const kcal = p.macros.protein * 4 + p.macros.carbs * 4 + p.macros.fat * 9;
    assert.ok(Math.abs(kcal - p.calories) < 25, `macros sum to ${kcal} vs ${p.calories}`);
    assert.equal(p.macros.protein, p.proteinG);
  });

  it('keeps carbs low on keto while holding the protein floor', () => {
    const keto = plan(intake(14), weighIns(14), null, { ...metrics, diet: 'keto' });
    const balanced = plan(intake(14), weighIns(14));
    assert.ok(keto.macros.carbs < balanced.macros.carbs);
    assert.equal(keto.macros.protein, keto.proteinG);
  });
});

describe('reported diagnostics', () => {
  it('reports the measured weekly change when it has one', () => {
    const p = plan(intake(14), weighIns(14, 85, -0.06));
    assert.ok(p.observedWeeklyChangeKg !== null);
    assert.ok(Math.abs(p.observedWeeklyChangeKg! - -0.42) < 0.02);
  });

  it('reports null weekly change when there is nothing to fit', () => {
    assert.equal(plan(intake(14), []).observedWeeklyChangeKg, null);
  });
});
