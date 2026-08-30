import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  currentTrendWeight,
  dayDiff,
  trendSlope,
  sortedWeights,
  trendSeries,
  weightsInWindow,
} from '../weight-trend.ts';
import type { WeightEntry } from '../../types/index.ts';

/** A run of daily weigh-ins starting at `start`, one per day. */
function series(start: string, values: number[]): WeightEntry[] {
  const base = new Date(`${start}T12:00:00`);
  return values.map((weightKg, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    return { date: d.toISOString().slice(0, 10), weightKg };
  });
}

describe('dayDiff', () => {
  it('counts whole days forward and backward', () => {
    assert.equal(dayDiff('2026-08-01', '2026-08-15'), 14);
    assert.equal(dayDiff('2026-08-15', '2026-08-01'), -14);
    assert.equal(dayDiff('2026-08-01', '2026-08-01'), 0);
  });

  it('crosses a month boundary correctly', () => {
    assert.equal(dayDiff('2026-08-30', '2026-09-02'), 3);
  });

  it('is unaffected by a daylight-saving transition', () => {
    // Parsed at noon precisely so a 23- or 25-hour day still rounds to 1.
    assert.equal(dayDiff('2026-03-28', '2026-03-30'), 2);
    assert.equal(dayDiff('2026-10-24', '2026-10-26'), 2);
  });
});

describe('sortedWeights', () => {
  it('orders oldest first', () => {
    const sorted = sortedWeights([
      { date: '2026-08-03', weightKg: 84 },
      { date: '2026-08-01', weightKg: 85 },
    ]);
    assert.equal(sorted[0].date, '2026-08-01');
  });

  it('drops rows with a non-finite weight rather than poisoning a fit', () => {
    const sorted = sortedWeights([
      { date: '2026-08-01', weightKg: 85 },
      { date: '2026-08-02', weightKg: Number.NaN },
    ]);
    assert.equal(sorted.length, 1);
  });
});

describe('trendSlope', () => {
  it('recovers a clean linear trend', () => {
    // Exactly -0.1 kg/day.
    const fit = trendSlope(series('2026-08-01', [85, 84.9, 84.8, 84.7, 84.6]));
    assert.ok(fit);
    assert.ok(Math.abs(fit.kgPerDay - -0.1) < 1e-9);
    assert.equal(fit.points, 5);
    assert.equal(fit.spanDays, 4);
  });

  it('is unmoved by one bad reading, where endpoints and least squares are not', () => {
    // A 1.5 kg water spike on the final morning — an ordinary salty dinner.
    // Both the old first-vs-last method and plain least squares read this as a
    // *gain* and would cut calories in response. Theil-Sen must not.
    const clean = series('2026-08-01', [85, 84.9, 84.8, 84.7, 84.6, 84.5, 84.4, 84.3]);
    const spiked = [...clean];
    spiked[spiked.length - 1] = { ...spiked[spiked.length - 1], weightKg: 85.8 };

    const ys = spiked.map((w) => w.weightKg);
    const n = ys.length;
    const meanX = (n - 1) / 2;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    ys.forEach((y, i) => {
      num += (i - meanX) * (y - meanY);
      den += (i - meanX) ** 2;
    });
    const olsSlope = num / den;
    const endpointSlope = (ys[n - 1] - ys[0]) / (n - 1);

    assert.ok(endpointSlope > 0, 'endpoint method flips sign');
    assert.ok(olsSlope > 0, 'least squares also flips sign');

    const spikedFit = trendSlope(spiked)!;
    assert.ok(spikedFit.kgPerDay < 0, 'Theil-Sen must still read this as loss');
    assert.ok(
      Math.abs(spikedFit.kgPerDay - trendSlope(clean)!.kgPerDay) < 1e-9,
      'and should be entirely unaffected',
    );
  });

  it('resists a spike in the middle of the window too', () => {
    const points = series('2026-08-01', [85, 84.9, 84.8, 86.2, 84.6, 84.5, 84.4, 84.3]);
    assert.ok(Math.abs(trendSlope(points)!.kgPerDay - -0.1) < 1e-9);
  });

  it('does follow a real change rather than ignoring everything', () => {
    // Robust does not mean inert: a genuine trend must still register.
    const gaining = series('2026-08-01', [80, 80.15, 80.3, 80.45, 80.6, 80.75]);
    assert.ok(Math.abs(trendSlope(gaining)!.kgPerDay - 0.15) < 1e-9);
  });

  it('returns null with fewer than two readings', () => {
    assert.equal(trendSlope([]), null);
    assert.equal(trendSlope([{ date: '2026-08-01', weightKg: 85 }]), null);
  });

  it('returns null when every reading is on the same day', () => {
    assert.equal(
      trendSlope([
        { date: '2026-08-01', weightKg: 85 },
        { date: '2026-08-01', weightKg: 84 },
      ]),
      null,
    );
  });

  it('handles irregular gaps by weighting on real elapsed days', () => {
    const fit = trendSlope([
      { date: '2026-08-01', weightKg: 85 },
      { date: '2026-08-11', weightKg: 84 },
      { date: '2026-08-21', weightKg: 83 },
    ])!;
    assert.ok(Math.abs(fit.kgPerDay - -0.1) < 1e-9);
    assert.equal(fit.spanDays, 20);
  });

  it('reports a flat trend as zero, not as noise', () => {
    const fit = trendSlope(series('2026-08-01', [85, 85, 85, 85]))!;
    assert.equal(fit.kgPerDay, 0);
  });
});

describe('trendSeries', () => {
  it('starts at the first reading', () => {
    const t = trendSeries(series('2026-08-01', [85, 84, 83]));
    assert.equal(t[0].trendKg, 85);
  });

  it('lags a step change instead of jumping to it', () => {
    // A 2 kg overnight "gain" is water. The trend should move a fraction of it.
    const t = trendSeries(series('2026-08-01', [85, 85, 85, 85, 87]));
    const last = t[t.length - 1];
    assert.equal(last.weightKg, 87);
    assert.ok(last.trendKg > 85 && last.trendKg < 85.4, `trend was ${last.trendKg}`);
  });

  it('tracks a sustained change, trailing it by a predictable lag', () => {
    const t = trendSeries(series('2026-08-01', Array.from({ length: 40 }, (_, i) => 85 - i * 0.05)));
    const last = t[t.length - 1];
    // An EMA on a steady ramp settles at a constant offset behind it —
    // slope * (1 - alpha) / alpha, about 0.7 kg here. That lag is the price of
    // the smoothing and is why the *slope* comes from trendSlope, not from
    // differencing this series.
    const lag = last.trendKg - last.weightKg;
    assert.ok(lag > 0.5 && lag < 0.9, `lag was ${lag}`);
    // It must still be falling, and roughly in parallel with the raw data.
    assert.ok(last.trendKg < t[0].trendKg);
  });

  it('lets a reading after a long gap dominate stale data', () => {
    const t = trendSeries([
      { date: '2026-01-01', weightKg: 95 },
      { date: '2026-08-01', weightKg: 80 },
    ]);
    // Seven months later the old value should carry essentially no weight.
    assert.ok(t[1].trendKg < 80.2, `trend was ${t[1].trendKg}`);
  });

  it('keeps the raw reading alongside the smoothed one', () => {
    const t = trendSeries(series('2026-08-01', [85, 87]));
    assert.equal(t[1].weightKg, 87);
    assert.notEqual(t[1].trendKg, 87);
  });

  it('returns an empty series for no data', () => {
    assert.deepEqual(trendSeries([]), []);
    assert.equal(currentTrendWeight([]), null);
  });
});

describe('weightsInWindow', () => {
  it('includes both endpoints', () => {
    const all = series('2026-08-01', [85, 84.9, 84.8, 84.7, 84.6]);
    const win = weightsInWindow(all, '2026-08-02', '2026-08-04');
    assert.deepEqual(win.map((w) => w.date), ['2026-08-02', '2026-08-03', '2026-08-04']);
  });
});
