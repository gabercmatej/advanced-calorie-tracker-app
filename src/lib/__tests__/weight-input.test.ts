import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  clampTenths,
  convertTenths,
  formatTenths,
  fromTenths,
  parseWeightInput,
  sanitizeWeightText,
  toTenths,
  WEIGHT_BOUNDS,
} from '../weight-input.ts';

/**
 * The failure modes here are all cosmetic-looking and all destructive to trust:
 * a weight that reads "82.10000000000001", a value that shifts after you let go
 * of the control, a field that eats the first digit you type. Each of those was
 * a real bug in the old picker, and each is a one-line arithmetic mistake.
 */

describe('tenths round-trip', () => {
  it('never produces a floating-point artifact', () => {
    // The classic: 0.1 arithmetic on floats. Every tenth from 30.0 to 250.0.
    for (let t = 300; t <= 2500; t += 1) {
      const v = fromTenths(t);
      assert.equal(String(v).length <= 5, true, `${t} rendered as ${v}`);
      assert.equal(toTenths(v), t);
    }
  });

  it('round-trips a value through tenths unchanged', () => {
    for (const v of [82, 82.1, 91.4, 100.9, 249.9, 30]) {
      assert.equal(fromTenths(toTenths(v)), v);
    }
  });

  it('snaps a value that is between two tenths', () => {
    assert.equal(fromTenths(toTenths(82.14)), 82.1);
    assert.equal(fromTenths(toTenths(82.15)), 82.2);
    assert.equal(fromTenths(toTenths(82.06)), 82.1);
  });

  it('formats with exactly one decimal, always', () => {
    assert.equal(formatTenths(820), '82.0');
    assert.equal(formatTenths(821), '82.1');
    assert.equal(formatTenths(914), '91.4');
    assert.equal(formatTenths(1000), '100.0');
  });

  it('walks every tenth between two weights without drift', () => {
    // Dragging 82.0 → 91.4 is 94 individual steps. Accumulated float error
    // would show up here as a missed or repeated value.
    const seen: string[] = [];
    for (let t = toTenths(82); t <= toTenths(91.4); t += 1) seen.push(formatTenths(t));
    assert.equal(seen.length, 95);
    assert.equal(seen[0], '82.0');
    assert.equal(seen[1], '82.1');
    assert.equal(seen[seen.length - 1], '91.4');
    assert.equal(new Set(seen).size, seen.length, 'a value repeated');
  });
});

describe('clamping', () => {
  it('holds values inside the unit bounds', () => {
    assert.equal(clampTenths(10, 'kg'), WEIGHT_BOUNDS.kg.min);
    assert.equal(clampTenths(99999, 'kg'), WEIGHT_BOUNDS.kg.max);
    assert.equal(clampTenths(820, 'kg'), 820);
  });

  it('respects explicit bounds over the unit defaults', () => {
    assert.equal(clampTenths(300, 'kg', { min: 400 }), 400);
    assert.equal(clampTenths(2000, 'kg', { max: 1600 }), 1600);
  });

  it('is total — never returns NaN or a fraction', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const out = clampTenths(bad, 'kg');
      assert.equal(Number.isInteger(out), true);
    }
    assert.equal(Number.isInteger(clampTenths(820.4, 'kg')), true);
  });
});

describe('parsing typed input', () => {
  it('accepts a complete number', () => {
    assert.equal(parseWeightInput('82'), 820);
    assert.equal(parseWeightInput('82.1'), 821);
    assert.equal(parseWeightInput('91.4'), 914);
  });

  it('accepts a comma as a decimal separator', () => {
    assert.equal(parseWeightInput('82,4'), 824);
  });

  it('returns null for input that is not yet a number', () => {
    // This is the fix for the field that ate keystrokes: "8" on the way to "82"
    // must not be published, or it clamps to the minimum and rewrites the box.
    assert.equal(parseWeightInput(''), null);
    assert.equal(parseWeightInput('.'), null);
    assert.equal(parseWeightInput('abc'), null);
  });

  it('treats a trailing separator as the number so far', () => {
    assert.equal(parseWeightInput('82.'), 820);
  });
});

describe('sanitising typed input', () => {
  it('strips anything that is not part of a weight', () => {
    assert.equal(sanitizeWeightText('8a2.1kg'), '82.1');
  });

  it('keeps at most one separator and one decimal', () => {
    assert.equal(sanitizeWeightText('82.1.5'), '82.1');
    assert.equal(sanitizeWeightText('82.15'), '82.1');
  });

  it('leaves a partially typed value alone', () => {
    assert.equal(sanitizeWeightText('8'), '8');
    assert.equal(sanitizeWeightText('82.'), '82.');
  });
});

describe('unit conversion', () => {
  it('is a no-op within the same unit', () => {
    assert.equal(convertTenths(914, 'kg', 'kg'), 914);
  });

  it('converts kg to lb and back within a tenth', () => {
    const kg = 914; // 91.4 kg
    const lb = convertTenths(kg, 'kg', 'lbs');
    assert.ok(Math.abs(lb - 2015) <= 1, `91.4 kg became ${formatTenths(lb)} lb`);
    const back = convertTenths(lb, 'lbs', 'kg');
    // A single round-trip may lose a tenth to rounding, but never more — which
    // is what stops the unit toggle drifting the number every time it is tapped.
    assert.ok(Math.abs(back - kg) <= 1, `round-trip gave ${formatTenths(back)}`);
  });

  it('keeps a converted value inside the destination unit bounds', () => {
    const out = convertTenths(WEIGHT_BOUNDS.kg.max, 'kg', 'lbs');
    assert.ok(out <= WEIGHT_BOUNDS.lbs.max);
  });
});

describe('drag arithmetic', () => {
  /** What the picker does on every pan move: start + a whole number of steps. */
  const drag = (startTenths: number, dxPx: number, pxPerTenth = 6) =>
    startTenths - Math.round(dxPx / pxPerTenth);

  it('is deterministic — the same gesture always yields the same value', () => {
    assert.equal(drag(820, -60), 830);
    assert.equal(drag(820, -60), 830);
  });

  it('never lands between two tenths', () => {
    for (let dx = -200; dx <= 200; dx += 1) {
      assert.equal(Number.isInteger(drag(820, dx)), true);
    }
  });

  it('does not move at all for a sub-step twitch', () => {
    // Holding still (or a 2px tremor) must not change the number, which is what
    // made the old position-based slider feel like it was drifting.
    assert.equal(drag(820, 0), 820);
    assert.equal(drag(820, 2), 820);
    assert.equal(drag(820, -2), 820);
  });

  it('returns exactly to the start when the finger comes back', () => {
    // The value is derived from the gesture's total delta, not accumulated per
    // move, so a there-and-back drag cannot leave a residue.
    const start = 914;
    assert.equal(drag(start, -300), start + 50);
    assert.equal(drag(start, 0), start);
  });

  it('reaches a specific tenth with a realistic thumb movement', () => {
    // 82.0 → 82.1 is one step, six pixels. On the old slider the same tenth was
    // less than a pixel of travel across a 220 kg range.
    assert.equal(drag(toTenths(82), -6), toTenths(82.1));
  });
});
