import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { reviewCut } from '../diet-break.ts';
import type { FoodEntry, WeightEntry } from '../../types/index.ts';

/**
 * The risk here is a false positive. Telling someone to take a diet break
 * because they ate salty food for a fortnight is worse than saying nothing,
 * so most of these tests assert that it stays quiet.
 */

const TODAY = '2026-08-29';

function shift(days: number, from = TODAY): string {
  const d = new Date(`${from}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** `days` of logged food ending yesterday, at `kcal` a day. */
function intake(days: number, kcal = 2000): FoodEntry[] {
  return Array.from({ length: days }, (_, i) => ({
    id: `e${i}`,
    name: 'Meal',
    date: shift(-(i + 1)),
    meal: 'lunch' as const,
    calories: kcal,
    macros: { protein: 150, carbs: 180, fat: 60 },
    quantity: 1,
    createdAt: i,
  }));
}

/** Daily weigh-ins over `days`, changing at `kgPerDay`. */
function weights(days: number, startKg = 85, kgPerDay = 0): WeightEntry[] {
  return Array.from({ length: days }, (_, i) => ({
    date: shift(-(days - 1 - i)),
    weightKg: startKg + kgPerDay * i,
  }));
}

const opts = (over: Partial<Parameters<typeof reviewCut>[2]> = {}) => ({
  today: TODAY,
  targetCalories: 2000,
  trendWeightKg: 85,
  isCutting: true,
  ...over,
});

describe('stays quiet when it should', () => {
  it('says nothing when not cutting', () => {
    const r = reviewCut(intake(120), weights(120), opts({ isCutting: false }));
    assert.equal(r.advice, null);
    assert.equal(r.flatWeeks, 0);
  });

  it('says nothing with no data', () => {
    assert.equal(reviewCut([], [], opts()).advice, null);
  });

  it('says nothing when logging coverage is poor', () => {
    // Plenty of weigh-ins, but only a handful of logged days.
    const r = reviewCut(intake(5), weights(120), opts());
    assert.equal(r.advice, null);
  });

  it('says nothing about a plateau in the first weeks of a cut', () => {
    // Perfectly flat, but only three weeks in — far too early to call.
    const r = reviewCut(intake(21), weights(21), opts());
    assert.equal(r.advice, null);
  });

  it('does not call a two-week flat spell a plateau', () => {
    // Losing steadily for months, then flat for a fortnight — water, not a stall.
    const losing = weights(90, 90, -0.06).slice(0, 76);
    const flat = weights(14, losing[losing.length - 1].weightKg, 0).map((w, i) => ({
      ...w,
      date: shift(-(13 - i)),
    }));
    const r = reviewCut(intake(120), [...losing, ...flat], opts());
    assert.notEqual(r.advice?.kind, 'plateau');
  });

  it('does not call a plateau when weight is still moving', () => {
    const r = reviewCut(intake(120), weights(120, 90, -0.05), opts());
    assert.notEqual(r.advice?.kind, 'plateau');
  });

  it('does not treat missing weigh-ins as a flat trend', () => {
    // Months of logging, but almost nothing on the scale recently.
    const sparse: WeightEntry[] = [
      { date: shift(-60), weightKg: 88 },
      { date: shift(-30), weightKg: 86 },
    ];
    const r = reviewCut(intake(120), sparse, opts());
    assert.equal(r.flatWeeks, 0);
    assert.equal(r.advice, null);
  });
});

describe('speaks up when it should', () => {
  it('flags losing faster than the muscle-sparing range, even early', () => {
    // 1.5% of bodyweight a week.
    const r = reviewCut(intake(28), weights(28, 90, -0.19), opts());
    assert.equal(r.advice?.kind, 'fast-loss');
  });

  it('blames adherence before metabolism when intake is above target', () => {
    const r = reviewCut(intake(120, 2400), weights(120, 85, 0), opts());
    assert.equal(r.advice?.kind, 'adherence');
  });

  it('suggests a maintenance week after a long, genuine, adhered-to stall', () => {
    const r = reviewCut(intake(120, 1980), weights(120, 85, 0), opts());
    assert.equal(r.advice?.kind, 'plateau');
    assert.ok(r.flatWeeks >= 3);
  });

  it('is explicit that nothing was changed automatically', () => {
    const r = reviewCut(intake(120, 1980), weights(120, 85, 0), opts());
    assert.match(r.advice!.body, /nothing has been changed automatically/i);
  });
});

describe('reported figures', () => {
  it('reports the measured weekly change', () => {
    const r = reviewCut(intake(60), weights(60, 90, -0.05), opts());
    assert.ok(r.weeklyChangeKg !== null);
    assert.ok(Math.abs(r.weeklyChangeKg! - -0.35) < 0.05);
  });

  it('reports coverage over the review window', () => {
    const r = reviewCut(intake(14), weights(60), opts());
    assert.ok(Math.abs(r.coverage - 0.5) < 0.01);
  });

  it('reports how many weeks of history there are', () => {
    const r = reviewCut(intake(70), weights(70), opts());
    assert.ok(r.weeksLogged >= 9 && r.weeksLogged <= 10);
  });
});
