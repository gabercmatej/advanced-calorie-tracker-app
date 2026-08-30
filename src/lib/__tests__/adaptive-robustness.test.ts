import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeAdaptivePlan, type PlanAnchor } from '../nutrition.ts';
import { currentTrendWeight, trendSlope } from '../weight-trend.ts';
import type { FoodEntry, UserMetrics, WeightEntry } from '../../types/index.ts';

/**
 * The engine against data that is actually ugly.
 *
 * `adaptive-plan.test.ts` covers the gates and the arithmetic. These are the
 * shapes real logging takes on a long cut — a salty weekend, a week of not
 * weighing, a day logged half-way — and the property being asserted is almost
 * always the same one: the target may be wrong, but it must not *lurch*. A
 * target that swings a few hundred calories because of water weight is one the
 * user stops believing, and a user who stops believing the target stops logging.
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

function shift(from: string, days: number): string {
  const d = new Date(`${from}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Daily weigh-ins ending today, falling steadily, with optional per-day noise. */
function weighIns(days: number, startKg = 85, kgPerDay = -0.06, noise: number[] = []): WeightEntry[] {
  return Array.from({ length: days }, (_, i) => ({
    date: shift(TODAY, -(days - 1 - i)),
    weightKg: startKg + kgPerDay * i + (noise[i] ?? 0),
  }));
}

/** Noise array that is flat except for one spike on the final morning. */
function spikeOnLastDay(days: number, kg: number): number[] {
  const noise = new Array<number>(days).fill(0);
  noise[days - 1] = kg;
  return noise;
}

/** One logged meal per day for `days` complete days, ending yesterday. */
function intake(days: number, kcal = 2200, skip: number[] = []): FoodEntry[] {
  return Array.from({ length: days }, (_, i) => i + 1)
    .filter((d) => !skip.includes(d))
    .map((d) => ({
      id: `e${d}`,
      name: 'Meal',
      date: shift(TODAY, -d),
      meal: 'lunch' as const,
      calories: kcal,
      macros: { protein: 150, carbs: 200, fat: 70 },
      quantity: 1,
      createdAt: d,
    }));
}

const plan = (entries: FoodEntry[], weights: WeightEntry[], anchor?: PlanAnchor | null) =>
  computeAdaptivePlan(metrics, entries, weights, anchor, TODAY)!;

// ---------------------------------------------------------------------------

describe('a single large weight spike', () => {
  it('does not flip the direction of the fitted trend', () => {
    // Eight mornings falling 0.1 kg/day, then 1.5 kg of water on the last one.
    // Endpoint differencing reads +0.11 kg/day here, and least squares reads
    // +0.03 — both the wrong sign, both would cut calories for a salty dinner.
    const points = Array.from({ length: 8 }, (_, i) => ({
      date: shift(TODAY, -(7 - i)),
      weightKg: 85 - 0.1 * i + (i === 7 ? 1.5 : 0),
    }));
    const fit = trendSlope(points);
    assert.ok(fit);
    assert.ok(fit.kgPerDay < 0, `slope was ${fit.kgPerDay}`);
    assert.ok(Math.abs(fit.kgPerDay - -0.1) < 0.02);
  });

  it('barely moves the calorie target', () => {
    const clean = plan(intake(14), weighIns(14));
    const spiked = plan(intake(14), weighIns(14, 85, -0.06, spikeOnLastDay(14, 1.5)));
    assert.ok(
      Math.abs(spiked.calories - clean.calories) <= 60,
      `spike moved the target by ${spiked.calories - clean.calories} kcal`,
    );
  });

  it('barely moves the smoothed weight the plan is built from', () => {
    const clean = currentTrendWeight(weighIns(14))!;
    const spiked = currentTrendWeight(weighIns(14, 85, -0.06, spikeOnLastDay(14, 1.5)))!;
    assert.ok(Math.abs(spiked - clean) < 0.35, `trend moved ${spiked - clean} kg`);
  });
});

describe('water-weight oscillation', () => {
  it('keeps the target steady across a week of ±0.8 kg swings', () => {
    // The same underlying trend, sampled on days that happen to be heavy or
    // light. Nothing real has changed, so nothing much should.
    const swing = [0.8, -0.6, 0.7, -0.8, 0.5, -0.7, 0.6, -0.5, 0.8, -0.6, 0.4, -0.8, 0.7, -0.4];
    const noisy = plan(intake(14), weighIns(14, 85, -0.06, swing));
    const smooth = plan(intake(14), weighIns(14, 85, -0.06));
    assert.ok(
      Math.abs(noisy.calories - smooth.calories) <= 100,
      `noise moved the target by ${noisy.calories - smooth.calories} kcal`,
    );
  });

  it('never moves more than the daily cap between consecutive days', () => {
    // Walk a fortnight one day at a time, re-anchoring each morning exactly as
    // the app does, and assert the target only ever walks.
    let anchor: PlanAnchor = { calories: 2200, date: shift(TODAY, -14) };
    const swing = [0.9, -0.7, 0.8, -0.9, 0.6, -0.8, 0.7, -0.6, 0.9, -0.7, 0.5, -0.9, 0.8, -0.5];

    for (let day = 13; day >= 0; day -= 1) {
      const today = shift(TODAY, -day);
      const weights = weighIns(14, 85, -0.06, swing).filter((w) => w.date <= today);
      const entries = intake(14).filter((e) => e.date < today);
      const p = computeAdaptivePlan(metrics, entries, weights, anchor, today)!;
      const daysSince = Math.max(1, Math.round((Date.parse(`${today}T12:00:00`) - Date.parse(`${anchor.date}T12:00:00`)) / 86_400_000));
      assert.ok(
        Math.abs(p.calories - anchor.calories) <= 75 * daysSince + 10,
        `${today}: jumped ${p.calories - anchor.calories} kcal in ${daysSince} day(s)`,
      );
      anchor = { calories: p.calories, date: today };
    }
  });
});

describe('sparse and missing data', () => {
  it('falls back to the formula on a single weigh-in', () => {
    const p = plan(intake(14), [{ date: shift(TODAY, -1), weightKg: 85 }]);
    assert.equal(p.basis, 'formula');
    assert.equal(p.observedTdee, null);
    assert.equal(p.blend, 0);
  });

  it('falls back to the formula with no weigh-ins at all', () => {
    const p = plan(intake(14), []);
    assert.equal(p.basis, 'formula');
    assert.ok(p.calories > 0);
  });

  it('falls back to the formula with no logged food at all', () => {
    const p = plan([], weighIns(14));
    assert.equal(p.basis, 'formula');
  });

  it('survives a fortnight of nothing whatsoever', () => {
    const p = plan([], []);
    assert.equal(p.basis, 'formula');
    assert.ok(Number.isFinite(p.calories));
    assert.ok(p.calories >= 1500);
    assert.equal(p.trendWeightKg, metrics.weightKg);
  });

  it('does not read skipped days as fasting', () => {
    // Four missed days out of fourteen, every logged day identical. If gaps
    // counted as 0 kcal the mean would collapse from 2200 to ~1570, observed
    // maintenance would follow it down, and the engine would invent a deficit
    // that never happened. The estimate of maintenance must be untouched.
    const withGaps = plan(intake(14, 2200, [3, 6, 9, 12]), weighIns(14));
    const full = plan(intake(14, 2200), weighIns(14));
    assert.equal(withGaps.observedTdee, full.observedTdee);
    assert.equal(withGaps.intakeDays, 10);
  });

  it('trusts a gappy fortnight less than a complete one', () => {
    // Same conclusion, less evidence for it. The gaps do not change *what* the
    // data says, only how far the target is allowed to follow it — so a gappy
    // window must sit closer to the formula, not further from it.
    const withGaps = plan(intake(14, 2200, [3, 6, 9, 12]), weighIns(14));
    const full = plan(intake(14, 2200), weighIns(14));
    assert.ok(withGaps.blend < full.blend, 'gaps should reduce confidence');
    assert.ok(
      Math.abs(withGaps.calories - full.calories) <= 200,
      `even so, ${withGaps.calories - full.calories} kcal is too big a gap to explain by confidence alone`,
    );
  });

  it('stops trusting intake once too much of the fortnight is missing', () => {
    const p = plan(intake(14, 2200, [2, 4, 6, 8, 10, 12]), weighIns(14));
    assert.equal(p.basis, 'formula');
  });
});

describe('a partially logged today', () => {
  it('is ignored entirely, however little has been eaten', () => {
    const breakfast: FoodEntry = {
      id: 'today',
      name: 'Coffee',
      date: TODAY,
      meal: 'breakfast',
      calories: 40,
      macros: { protein: 1, carbs: 2, fat: 3 },
      quantity: 1,
      createdAt: 1,
    };
    const without = plan(intake(14), weighIns(14));
    const with40 = plan([...intake(14), breakfast], weighIns(14));
    assert.equal(with40.calories, without.calories);
    assert.equal(with40.intakeDays, without.intakeDays);
  });

  it('holds steady as today fills up through the day', () => {
    const base = intake(14);
    const targets = [40, 600, 1400, 2100].map((kcal) => {
      const sofar: FoodEntry = {
        id: 'today',
        name: 'So far',
        date: TODAY,
        meal: 'lunch',
        calories: kcal,
        macros: { protein: 10, carbs: 10, fat: 10 },
        quantity: 1,
        createdAt: 1,
      };
      return plan([...base, sofar], weighIns(14)).calories;
    });
    assert.equal(new Set(targets).size, 1, `target drifted through the day: ${targets}`);
  });
});

describe('clean data', () => {
  it('goes adaptive on a full, well-weighed fortnight', () => {
    const p = plan(intake(14), weighIns(14));
    assert.equal(p.basis, 'adaptive');
    assert.ok(p.blend > 0.5, `blend was only ${p.blend}`);
    assert.equal(p.coverage, 1);
  });

  it('still keeps the observation inside the formula band', () => {
    // A fortnight of deliberately absurd logging (900 kcal/day while holding
    // weight) must not conclude that maintenance is 900.
    const p = plan(intake(14, 900), weighIns(14, 85, 0));
    assert.ok(p.observedTdee !== null);
    assert.ok(p.observedTdee! > 1800, `observed TDEE collapsed to ${p.observedTdee}`);
  });
});

describe('date boundaries', () => {
  it('treats date keys as whole days regardless of local timezone', () => {
    // Date keys are parsed at noon precisely so a DST shift or a UTC offset
    // cannot move a reading onto the previous or next day. Spring-forward in
    // most of Europe is 2026-03-29.
    const around = ['2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31'];
    const fit = trendSlope(around.map((date, i) => ({ date, weightKg: 85 - 0.1 * i })));
    assert.ok(fit);
    assert.equal(fit.spanDays, 4, `span across DST read as ${fit.spanDays} days`);
    assert.ok(Math.abs(fit.kgPerDay - -0.1) < 1e-9);
  });

  it('gives the same answer whichever day-of-month "today" falls on', () => {
    // Month and year boundaries are the classic place a hand-rolled date helper
    // is off by one.
    for (const today of ['2026-02-28', '2026-03-01', '2026-12-31', '2027-01-01']) {
      const weights = Array.from({ length: 14 }, (_, i) => ({
        date: shift(today, -(13 - i)),
        weightKg: 85 - 0.06 * i,
      }));
      const entries = Array.from({ length: 14 }, (_, i) => ({
        id: `e${i}`,
        name: 'Meal',
        date: shift(today, -(i + 1)),
        meal: 'lunch' as const,
        calories: 2200,
        macros: { protein: 150, carbs: 200, fat: 70 },
        quantity: 1,
        createdAt: i,
      }));
      const p = computeAdaptivePlan(metrics, entries, weights, null, today)!;
      assert.equal(p.coverage, 1, `coverage wrong on ${today}`);
      assert.equal(p.basis, 'adaptive', `basis wrong on ${today}`);
    }
  });
});

describe('malformed input', () => {
  it('does not produce NaN from a zero-quantity or zero-calorie entry', () => {
    const junk: FoodEntry[] = [
      { id: 'z', name: '', date: shift(TODAY, -1), meal: 'lunch', calories: 0, macros: { protein: 0, carbs: 0, fat: 0 }, quantity: 0, createdAt: 1 },
    ];
    const p = plan([...intake(14), ...junk], weighIns(14));
    assert.ok(Number.isFinite(p.calories));
    assert.ok(Number.isFinite(p.macros.protein));
  });

  it('ignores weigh-ins that fall outside the window rather than fitting through them', () => {
    const ancient: WeightEntry = { date: '2025-01-01', weightKg: 110 };
    const p = plan(intake(14), [ancient, ...weighIns(14)]);
    assert.ok(p.trendWeightKg < 90, `ancient reading dragged the trend to ${p.trendWeightKg}`);
  });
});
