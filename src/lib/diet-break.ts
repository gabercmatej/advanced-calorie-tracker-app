import { trendSlope, weightsInWindow } from '@/lib/weight-trend';
import type { FoodEntry, WeightEntry } from '@/types';

/**
 * Long-cut safeguards.
 *
 * Over eight months the thing that goes wrong is almost never that the deficit
 * was too small. It is that the deficit quietly got too big, adherence slipped,
 * and muscle went with the fat. This module looks at the last several weeks and
 * says something about it — and *only* says something. It never changes the
 * calorie target.
 *
 * That restraint is the whole design. The adaptive engine already reduces
 * calories on its own when the scale stops moving, because a flat trend lowers
 * its estimate of maintenance. Layering an automatic diet-break trigger on top
 * of that would mean two mechanisms reacting to the same noise, and a fortnight
 * of water retention could push the target down and then declare a diet break
 * about it. So the rules here are deliberately slow: nothing fires before two
 * months of cutting, nothing fires on less than three weeks of flat trend, and
 * nothing fires at all when the data is too thin to trust.
 */

/** Nothing is said before this much continuous cutting. */
const MIN_WEEKS_BEFORE_ADVICE = 8;
/** Consecutive flat weeks before a stall is called a stall. */
const MIN_FLAT_WEEKS = 3;
/** Weekly change below this share of bodyweight counts as "flat". */
const FLAT_THRESHOLD_PCT = 0.0025;
/** Losing faster than this share of bodyweight per week risks muscle. */
const FAST_LOSS_PCT = 0.011;
/** Logged-day coverage required before any of this is trusted. */
const MIN_COVERAGE = 0.7;
/** Intake this far above target, sustained, is an adherence signal. */
const OVER_TARGET_KCAL = 200;

export type AdviceKind = 'plateau' | 'adherence' | 'fast-loss';

export interface CutAdvice {
  kind: AdviceKind;
  title: string;
  body: string;
}

export interface CutReview {
  /** Weeks of logged history behind this review. */
  weeksLogged: number;
  /** Consecutive recent weeks with an essentially flat trend. */
  flatWeeks: number;
  /** Measured rate over the recent window, kg/week. Null when unknown. */
  weeklyChangeKg: number | null;
  /** Share of the recent window that carried a food log, 0..1. */
  coverage: number;
  /** What to tell the user, or null when there is nothing worth saying. */
  advice: CutAdvice | null;
}

function shiftDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Calories per day that were actually logged, over an inclusive date range. */
function intakeOver(entries: FoodEntry[], from: string, to: string) {
  const byDay = new Map<string, number>();
  for (const e of entries) {
    if (e.date >= from && e.date <= to) {
      byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.calories * e.quantity);
    }
  }
  const days = byDay.size;
  const total = [...byDay.values()].reduce((a, b) => a + b, 0);
  return { days, average: days > 0 ? total / days : 0 };
}

/**
 * Count back how many consecutive recent weeks had a flat trend.
 *
 * Each week is fitted separately rather than differencing endpoints, and a week
 * without enough readings stops the count instead of being assumed flat —
 * "I did not weigh myself" is not evidence of a stall.
 */
function countFlatWeeks(
  weights: WeightEntry[],
  today: string,
  trendWeightKg: number,
  maxWeeks = 8,
): number {
  const threshold = trendWeightKg * FLAT_THRESHOLD_PCT;
  let flat = 0;

  for (let week = 0; week < maxWeeks; week += 1) {
    const end = shiftDays(today, -week * 7);
    // A fortnight-wide window per step: a single week rarely holds enough
    // readings to fit, and overlapping windows make the count less jumpy.
    const start = shiftDays(end, -13);
    const fit = trendSlope(weightsInWindow(weights, start, end));
    if (!fit || fit.points < 4 || fit.spanDays < 7) break;
    if (Math.abs(fit.kgPerDay * 7) > threshold) break;
    flat += 1;
  }

  return flat;
}

/**
 * Review the recent cut and decide whether anything is worth saying.
 *
 * Returns advice at most — the caller displays it, and the calorie target is
 * never touched. Order matters: an adherence explanation beats a metabolic one,
 * because "you are eating more than you think" is both more common and more
 * actionable than "your metabolism has adapted".
 */
export function reviewCut(
  entries: FoodEntry[],
  weights: WeightEntry[],
  options: {
    today: string;
    /** Current daily calorie target. */
    targetCalories: number;
    /** Smoothed bodyweight the plan is built from. */
    trendWeightKg: number;
    /** True only while actively cutting. */
    isCutting: boolean;
  },
): CutReview {
  const { today, targetCalories, trendWeightKg, isCutting } = options;

  const windowStart = shiftDays(today, -27);
  const { days: loggedDays, average: avgIntake } = intakeOver(
    entries,
    windowStart,
    shiftDays(today, -1),
  );
  const coverage = loggedDays / 28;

  const fit = trendSlope(weightsInWindow(weights, windowStart, today));
  const weeklyChangeKg = fit ? fit.kgPerDay * 7 : null;

  // How long there has been anything to look at, in whole weeks.
  const dates = entries.map((e) => e.date).sort();
  const weeksLogged =
    dates.length > 0
      ? Math.floor(
          (Date.parse(`${today}T12:00:00`) - Date.parse(`${dates[0]}T12:00:00`)) /
            (7 * 86_400_000),
        )
      : 0;

  const flatWeeks = isCutting ? countFlatWeeks(weights, today, trendWeightKg) : 0;

  const base: CutReview = { weeksLogged, flatWeeks, weeklyChangeKg, coverage, advice: null };

  // Say nothing when not cutting, when the data is thin, or when it is early.
  if (!isCutting) return base;
  if (coverage < MIN_COVERAGE || !fit || fit.points < 6) return base;

  // Losing too fast is the one thing worth flagging immediately — waiting two
  // months to mention it defeats the purpose of protecting muscle.
  if (weeklyChangeKg != null && weeklyChangeKg < -(trendWeightKg * FAST_LOSS_PCT)) {
    return {
      ...base,
      advice: {
        kind: 'fast-loss',
        title: 'Losing faster than planned',
        body:
          `You're down about ${Math.abs(weeklyChangeKg).toFixed(1)} kg a week, which is above the ` +
          'muscle-sparing range. Eating a little more — and keeping protein high — will keep more ' +
          'of the weight you lose as fat rather than lean tissue.',
      },
    };
  }

  if (weeksLogged < MIN_WEEKS_BEFORE_ADVICE) return base;

  // Adherence before metabolism: if logged intake sits well above the target,
  // a stall is arithmetic, not adaptation, and a diet break would be wrong.
  if (avgIntake > targetCalories + OVER_TARGET_KCAL) {
    return {
      ...base,
      advice: {
        kind: 'adherence',
        title: 'Intake is running above target',
        body:
          `Your logged intake has averaged about ${Math.round(avgIntake)} kcal against a ` +
          `${targetCalories} kcal target. That gap explains a slow month more simply than anything ` +
          'metabolic. Tightening up logging — or the portions themselves — comes before any other change.',
      },
    };
  }

  if (flatWeeks >= MIN_FLAT_WEEKS) {
    return {
      ...base,
      advice: {
        kind: 'plateau',
        title: `Trend flat for ${flatWeeks} weeks`,
        body:
          'Weight has held steady for several weeks at a target you have been hitting. After a long ' +
          'stretch in deficit that is usually worth a planned week at maintenance rather than a ' +
          'deeper cut — it restores training quality and makes the next block work better. ' +
          'Nothing has been changed automatically; this is only a suggestion.',
      },
    };
  }

  return base;
}
