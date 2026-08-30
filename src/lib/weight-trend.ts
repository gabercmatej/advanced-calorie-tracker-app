import type { WeightEntry } from '@/types';

/**
 * Turning noisy scale readings into a usable signal.
 *
 * Body weight is a terrible daily measurement and a good weekly one. Sodium,
 * carbohydrate, hydration, sleep and gut contents move the number by a kilo or
 * more overnight, while a sensible cut moves it about 0.3–0.6 kg in a *week*.
 * The noise is larger than the signal it sits on, so anything that reads two
 * raw numbers and subtracts them is mostly measuring water.
 *
 * Two tools, for two jobs:
 *
 *  - `trendSeries` — an exponentially weighted moving average, for the chart.
 *    It is causal (each point uses only earlier readings), so the line never
 *    changes shape retroactively as new data arrives.
 *  - `trendSlope` — a Theil–Sen fit over a window, for the rate of change the
 *    calorie engine needs. See the note on that function for why it is not
 *    ordinary least squares.
 *
 * Both are pure and unit-tested; neither pulls in a date or stats library.
 */

/** Days from `a` to `b` for YYYY-MM-DD keys. Local-noon parsing avoids DST drift. */
export function dayDiff(a: string, b: string): number {
  const pa = Date.parse(`${a}T12:00:00`);
  const pb = Date.parse(`${b}T12:00:00`);
  if (Number.isNaN(pa) || Number.isNaN(pb)) return 0;
  return Math.round((pb - pa) / 86_400_000);
}

/** Weigh-ins sorted oldest first, with malformed rows dropped. */
export function sortedWeights(weights: WeightEntry[]): WeightEntry[] {
  return weights
    .filter((w) => w && typeof w.weightKg === 'number' && Number.isFinite(w.weightKg) && w.date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface TrendPoint {
  date: string;
  /** The raw reading on this day. */
  weightKg: number;
  /** The smoothed value — what the body is actually doing. */
  trendKg: number;
}

/**
 * Default smoothing half-life in days.
 *
 * Ten days is the usual compromise for body weight: long enough to swallow a
 * salty meal or a bad night, short enough that a genuine change in trajectory
 * shows up within a week or two rather than a month.
 */
export const TREND_HALF_LIFE_DAYS = 10;

/**
 * Exponentially weighted moving average over irregularly spaced weigh-ins.
 *
 * Gaps are handled properly rather than ignored: the decay is computed from the
 * actual number of days since the previous reading, so a fortnight away from
 * the scale correctly lets the new reading dominate instead of being averaged
 * against stale data as if it were the next morning.
 */
export function trendSeries(
  weights: WeightEntry[],
  halfLifeDays = TREND_HALF_LIFE_DAYS,
): TrendPoint[] {
  const sorted = sortedWeights(weights);
  if (sorted.length === 0) return [];

  const out: TrendPoint[] = [];
  let trend = sorted[0].weightKg;
  let previousDate = sorted[0].date;

  for (const w of sorted) {
    const gap = Math.max(0, dayDiff(previousDate, w.date));
    // Weight the new reading by how much decay has accumulated over the gap.
    const alpha = gap === 0 ? 0.5 : 1 - Math.pow(0.5, gap / halfLifeDays);
    trend = out.length === 0 ? w.weightKg : trend + alpha * (w.weightKg - trend);
    out.push({ date: w.date, weightKg: w.weightKg, trendKg: trend });
    previousDate = w.date;
  }

  return out;
}

/** The smoothed weight as of the latest reading, or null with no data. */
export function currentTrendWeight(weights: WeightEntry[]): number | null {
  const series = trendSeries(weights);
  return series.length ? series[series.length - 1].trendKg : null;
}

export interface SlopeFit {
  /** Rate of change in kg per day. Negative while losing. */
  kgPerDay: number;
  /** Readings that fed the fit. */
  points: number;
  /** Days between the first and last reading used. */
  spanDays: number;
}

/**
 * Rate of weight change, fitted by the Theil–Sen estimator: the median of the
 * slopes between every pair of readings.
 *
 * Least squares was the obvious first choice and it is not good enough here.
 * A single high-leverage outlier at the edge of the window — a salty dinner the
 * night before a weigh-in, which is an ordinary Tuesday, not a freak event —
 * drags an OLS line hard enough to flip its sign. On eight daily readings
 * falling 0.1 kg/day, one 1.5 kg spike on the final morning takes the OLS slope
 * from -0.10 to +0.03 kg/day: the app would conclude you were gaining and cut
 * your calories. Theil–Sen returns -0.10 unchanged, because that outlier
 * contaminates only 7 of the 28 pairwise slopes and the median ignores them.
 *
 * The cost is a pairwise loop, which at fourteen readings is 91 divisions —
 * nothing. Robustness to exactly the noise this data is full of is worth far
 * more than the closed form.
 *
 * Returns null when the data cannot support a slope — fewer than two readings,
 * or every reading on the same day. Callers treat null as "not enough evidence"
 * and fall back to the formula rather than guessing.
 */
export function trendSlope(points: { date: string; weightKg: number }[]): SlopeFit | null {
  if (points.length < 2) return null;

  const base = points[0].date;
  const xs = points.map((p) => dayDiff(base, p.date));
  const ys = points.map((p) => p.weightKg);

  const slopes: number[] = [];
  for (let i = 0; i < xs.length; i += 1) {
    for (let j = i + 1; j < xs.length; j += 1) {
      const dx = xs[j] - xs[i];
      // Two readings on the same day say nothing about a rate.
      if (dx !== 0) slopes.push((ys[j] - ys[i]) / dx);
    }
  }

  if (slopes.length === 0) return null;

  slopes.sort((a, b) => a - b);
  const mid = slopes.length >> 1;
  const kgPerDay =
    slopes.length % 2 === 1 ? slopes[mid] : (slopes[mid - 1] + slopes[mid]) / 2;

  return {
    kgPerDay,
    points: xs.length,
    spanDays: xs[xs.length - 1] - xs[0],
  };
}

/** Weigh-ins inside a date window, inclusive of both ends. */
export function weightsInWindow(
  weights: WeightEntry[],
  fromDate: string,
  toDate: string,
): WeightEntry[] {
  return sortedWeights(weights).filter((w) => w.date >= fromDate && w.date <= toDate);
}
