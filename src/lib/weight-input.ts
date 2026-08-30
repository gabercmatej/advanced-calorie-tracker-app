/**
 * Weight entry, in integer tenths.
 *
 * Every weight the user types or drags is held as a whole number of tenths of a
 * unit — 914 means 91.4 kg — and only converted to a float at the edges. That is
 * not fussiness. `Math.round(v / 0.1) * 0.1` produces 82.10000000000001, which
 * then renders as "82.10000000000001", fails an equality check against the value
 * the slider reported, and re-renders the field mid-edit. Snapping in integers
 * removes the entire class of problem: two equal weights are `===` equal, and a
 * value can never land between two representable steps.
 *
 * Pure and dependency-free so the arithmetic is testable on its own —
 * see `src/lib/__tests__/weight-input.test.ts`.
 */

/** Smallest change the UI can express: 0.1 of the active unit. */
export const TENTH = 0.1;

/** Sensible bounds per unit, as tenths. Wide enough not to obstruct anybody. */
export const WEIGHT_BOUNDS = {
  kg: { min: 300, max: 2500 }, // 30.0 – 250.0 kg
  lbs: { min: 660, max: 5500 }, // 66.0 – 550.0 lb
} as const;

export type WeightUnit = keyof typeof WEIGHT_BOUNDS;

/** A display value in the active unit → integer tenths. */
export function toTenths(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10);
}

/** Integer tenths → a display value with exactly one decimal and no artifacts. */
export function fromTenths(tenths: number): number {
  // Dividing by 10 is exact enough for one decimal in IEEE-754 for every value
  // this app can hold, and `toFixed` guarantees the string form regardless.
  return Number((Math.round(tenths) / 10).toFixed(1));
}

/** Clamp tenths into the bounds for a unit (or explicit bounds). */
export function clampTenths(
  tenths: number,
  unit: WeightUnit,
  bounds?: { min?: number; max?: number },
): number {
  const b = WEIGHT_BOUNDS[unit];
  const min = bounds?.min ?? b.min;
  const max = bounds?.max ?? b.max;
  if (!Number.isFinite(tenths)) return min;
  return Math.max(min, Math.min(max, Math.round(tenths)));
}

/** Format tenths for display — always one decimal place, e.g. "82.0". */
export function formatTenths(tenths: number): string {
  return (Math.round(tenths) / 10).toFixed(1);
}

/**
 * Convert a value between units, in tenths, so a unit toggle round-trips
 * without drifting. kg ⇄ lb at the exact factor, rounded once.
 */
const LB_PER_KG = 2.2046226218487757;

export function convertTenths(tenths: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return Math.round(tenths);
  const factor = to === 'lbs' ? LB_PER_KG : 1 / LB_PER_KG;
  return clampTenths(Math.round(tenths * factor), to);
}

/**
 * Parse whatever is currently in a text field into tenths.
 *
 * Returns null for anything that is not yet a number — an empty box, a lone
 * "." or "82." mid-typing — so the caller can leave the field alone instead of
 * rewriting it under the user's cursor. That rewriting is what made the old
 * field impossible to type in: it clamped every keystroke, so typing "8" of
 * "82" snapped to the minimum and replaced the text.
 */
export function parseWeightInput(text: string): number | null {
  const cleaned = text.replace(/,/g, '.').trim();
  if (!/^\d*\.?\d*$/.test(cleaned)) return null;
  if (cleaned === '' || cleaned === '.') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return toTenths(n);
}

/** Keep only the characters a weight can contain, and at most one separator. */
export function sanitizeWeightText(text: string): string {
  const cleaned = text.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  // Drop any further separators, and never keep more than one decimal.
  const whole = cleaned.slice(0, firstDot);
  const rest = cleaned.slice(firstDot + 1).replace(/\./g, '');
  return `${whole}.${rest.slice(0, 1)}`;
}
