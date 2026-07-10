import type {
  DietType,
  FoodEntry,
  Goals,
  GoalType,
  Macros,
  UserMetrics,
  WeightEntry,
  WorkoutsPerWeek,
} from '@/types';

/** Empty macro object. */
export const emptyMacros = (): Macros => ({ protein: 0, carbs: 0, fat: 0 });

/** Sum two macro objects. */
export function addMacros(a: Macros, b: Macros): Macros {
  return {
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

/** Totals (calories + macros) for a list of entries, accounting for quantity. */
export function totalsFor(entries: FoodEntry[]): { calories: number; macros: Macros } {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories * e.quantity,
      macros: addMacros(acc.macros, {
        protein: e.macros.protein * e.quantity,
        carbs: e.macros.carbs * e.quantity,
        fat: e.macros.fat * e.quantity,
      }),
    }),
    { calories: 0, macros: emptyMacros() },
  );
}

/** Remaining calories against a goal (never below 0). */
export function remaining(consumed: number, goal: number): number {
  return Math.max(0, Math.round(goal - consumed));
}

/** Fraction 0..1 of a goal that has been consumed. */
export function progress(consumed: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(1, consumed / goal);
}

/**
 * Whether a streak length is a "milestone" worth a confetti celebration —
 * the first few landmarks, then every full month.
 */
export function isStreakMilestone(days: number): boolean {
  if (days <= 0) return false;
  if ([3, 7, 14, 21, 50, 100].includes(days)) return true;
  return days % 30 === 0;
}

// ---------------------------------------------------------------------------
// Units & conversions
// ---------------------------------------------------------------------------

const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;

export const kgToLb = (kg: number) => kg * LB_PER_KG;
export const lbToKg = (lb: number) => lb / LB_PER_KG;
export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const inToCm = (inch: number) => inch * CM_PER_IN;

/** Split total inches into feet + inches. */
export function inchesToFtIn(totalInches: number): { ft: number; in: number } {
  const rounded = Math.round(totalInches);
  return { ft: Math.floor(rounded / 12), in: rounded % 12 };
}

export const ftInToCm = (ft: number, inch: number) => inToCm(ft * 12 + inch);

/** Format a weight (stored in kg) for display in the user's units. */
export function formatWeight(kg: number, units: 'metric' | 'imperial'): string {
  return units === 'imperial'
    ? `${Math.round(kgToLb(kg))} lbs`
    : `${Math.round(kg * 10) / 10} kg`;
}

/** Format a height (stored in cm) for display in the user's units. */
export function formatHeight(cm: number, units: 'metric' | 'imperial'): string {
  if (units === 'imperial') {
    const { ft, in: inch } = inchesToFtIn(cmToIn(cm));
    return `${ft}' ${inch}"`;
  }
  return `${Math.round(cm)} cm`;
}

// ---------------------------------------------------------------------------
// Goal calculation
// ---------------------------------------------------------------------------

/** TDEE multiplier for each weekly-training bucket. */
const WORKOUT_FACTOR: Record<WorkoutsPerWeek, number> = {
  '0-2': 1.375,
  '3-5': 1.55,
  '6+': 1.725,
};

export const WORKOUT_LABEL: Record<WorkoutsPerWeek, string> = {
  '0-2': '0–2 workouts / week',
  '3-5': '3–5 workouts / week',
  '6+': '6+ workouts / week',
};

export const GOAL_LABEL: Record<GoalType, string> = {
  lose: 'Lose weight',
  maintain: 'Maintain',
  gain: 'Gain weight',
};

export const DIET_LABEL: Record<DietType, string> = {
  balanced: 'Balanced',
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  pescatarian: 'Pescatarian',
  keto: 'Keto',
};

/** Age in whole years from a YYYY-MM-DD birth date. */
export function ageFromBirthDate(birthDate?: string): number {
  // Guard against missing/malformed birth dates (e.g. profiles from older
  // versions) so downstream goal math never crashes — fall back to a sane age.
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return 30;
  const b = fromDateKey(birthDate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const beforeBirthday =
    now.getMonth() < b.getMonth() ||
    (now.getMonth() === b.getMonth() && now.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

/**
 * Estimate total daily energy expenditure (TDEE) with the Mifflin-St Jeor
 * equation and a workout-volume multiplier.
 */
export function estimateTdee(m: {
  sex: 'male' | 'female';
  birthDate?: string;
  heightCm: number;
  weightKg: number;
  workoutsPerWeek: WorkoutsPerWeek;
}): number {
  const age = ageFromBirthDate(m.birthDate);
  const base = 10 * m.weightKg + 6.25 * m.heightCm - 5 * age + (m.sex === 'male' ? 5 : -161);
  return Math.round(base * WORKOUT_FACTOR[m.workoutsPerWeek]);
}

/** ~7700 kcal per kg of body weight. */
const KCAL_PER_KG = 7700;
/** Never recommend a more aggressive daily deficit/surplus than this. */
const MAX_DAILY_DELTA = 900;

/**
 * Turn a user's metrics into a personalized daily calorie + macro goal.
 * Starts from TDEE, then applies a deficit/surplus sized to hit a target
 * weight by a target date when provided (capped to a safe rate).
 */
export function computeGoals(m: UserMetrics): Goals {
  const tdee = estimateTdee(m);

  let delta = 0;
  const pace = pacedDailyDelta(m);
  if (pace !== null) {
    delta = pace;
  } else if (m.goalType === 'lose') {
    delta = -500;
  } else if (m.goalType === 'gain') {
    delta = 350;
  }

  const clamped = Math.max(-MAX_DAILY_DELTA, Math.min(MAX_DAILY_DELTA, delta));
  const floor = m.sex === 'male' ? 1500 : 1200;
  const calories = Math.max(floor, Math.round((tdee + clamped) / 10) * 10);

  return { calories, macros: macrosFromCalories(calories, macroSplit(m.goalType, m.diet)) };
}

function pacedDailyDelta(m: UserMetrics): number | null {
  if (m.targetWeightKg == null || !m.targetDate) return null;
  const days = daysBetween(toDateKey(), m.targetDate);
  if (days <= 0) return null;
  const kgDelta = m.targetWeightKg - m.weightKg;
  return (kgDelta * KCAL_PER_KG) / days;
}

/** Macro split (fractions of total kcal) tuned per goal and diet. */
function macroSplit(goal: GoalType, diet: DietType): { protein: number; carbs: number; fat: number } {
  if (diet === 'keto') return { protein: 0.3, carbs: 0.1, fat: 0.6 };
  if (diet === 'vegan') return { protein: 0.25, carbs: 0.5, fat: 0.25 };
  switch (goal) {
    case 'lose':
      return { protein: 0.4, carbs: 0.3, fat: 0.3 };
    case 'gain':
      return { protein: 0.3, carbs: 0.45, fat: 0.25 };
    default:
      return { protein: 0.3, carbs: 0.4, fat: 0.3 };
  }
}

/** Default macro split (protein/carbs/fat) as a share of total calories. */
export function macrosFromCalories(
  calories: number,
  split: { protein: number; carbs: number; fat: number } = { protein: 0.3, carbs: 0.4, fat: 0.3 },
): Goals['macros'] {
  // 4 kcal/g protein & carbs, 9 kcal/g fat.
  return {
    protein: Math.round((calories * split.protein) / 4),
    carbs: Math.round((calories * split.carbs) / 4),
    fat: Math.round((calories * split.fat) / 9),
  };
}

// ---------------------------------------------------------------------------
// Adaptive, muscle-sparing weight-loss plan
// ---------------------------------------------------------------------------
//
// Evidence-based approach (see research notes): to preserve muscle while cutting,
// target a *constant percentage of bodyweight per week* (not a flat calorie
// deficit) so the deficit tapers as you get lighter, keep protein high, and cap
// the rate at ~1%/week. Once there's enough logged data we estimate real
// maintenance ("adaptive TDEE") from average intake vs. actual weight change,
// which self-corrects the target when you're losing faster or slower than plan.

/** Default weekly loss target as a share of bodyweight (0.7%). */
const SAFE_WEEKLY_LOSS_PCT = 0.007;
/** Hard cap on weekly loss to stay in the muscle-sparing zone (1%). */
const MAX_WEEKLY_LOSS_PCT = 0.01;
/** Protein target while cutting, in grams per kg of bodyweight. */
export const CUT_PROTEIN_G_PER_KG = 2.0;
/** Trailing window (days) used to estimate adaptive TDEE and average intake. */
const ADAPT_WINDOW_DAYS = 14;

export interface AdaptivePlan {
  calories: number;
  macros: Macros;
  proteinG: number;
  /** Estimated maintenance calories from recent data, or null when using the formula. */
  observedTdee: number | null;
  /** Whether the target is driven by observed data or the onboarding formula. */
  basis: 'adaptive' | 'formula';
  /** Recommended weekly loss (kg), tapered to bodyweight. */
  targetWeeklyLossKg: number;
  /** How many days of intake data fed the estimate (confidence signal). */
  intakeDays: number;
}

/** Macro split that pins protein to a muscle-sparing floor, then splits the rest. */
function macrosWithProteinFloor(calories: number, proteinG: number, diet: DietType): Macros {
  const remaining = Math.max(0, calories - proteinG * 4);
  const split =
    diet === 'keto'
      ? { carbs: 0.15, fat: 0.85 }
      : diet === 'vegan'
        ? { carbs: 0.6, fat: 0.4 }
        : { carbs: 0.55, fat: 0.45 };
  return {
    protein: proteinG,
    carbs: Math.round((remaining * split.carbs) / 4),
    fat: Math.round((remaining * split.fat) / 9),
  };
}

/**
 * Compute an adaptive daily calorie + macro target for someone losing weight.
 * Returns null for non-cutters (maintain/gain keep their onboarding goals).
 */
export function computeAdaptivePlan(
  metrics: UserMetrics | undefined,
  entries: FoodEntry[],
  weights: WeightEntry[],
): AdaptivePlan | null {
  if (!metrics || metrics.goalType !== 'lose') return null;

  const latest = latestWeight(weights);
  const currentWeight = latest?.weightKg ?? metrics.weightKg;
  const formulaTdee = estimateTdee({ ...metrics, weightKg: currentWeight });

  // --- Average intake over the trailing window (days that were actually logged) ---
  const today = toDateKey();
  const windowStart = addDays(today, -ADAPT_WINDOW_DAYS);
  const dayTotals = new Map<string, number>();
  for (const e of entries) {
    if (e.date > windowStart && e.date <= today) {
      dayTotals.set(e.date, (dayTotals.get(e.date) ?? 0) + e.calories * e.quantity);
    }
  }
  const intakeDays = dayTotals.size;
  const avgIntake =
    intakeDays > 0 ? [...dayTotals.values()].reduce((a, b) => a + b, 0) / intakeDays : 0;

  // --- Observed (adaptive) TDEE from intake vs. real weight change ---
  const windowWeights = weights
    .filter((w) => w.date >= windowStart && w.date <= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  let observedTdee: number | null = null;
  if (intakeDays >= 10 && windowWeights.length >= 2) {
    const first = windowWeights[0];
    const last = windowWeights[windowWeights.length - 1];
    const span = daysBetween(first.date, last.date);
    if (span >= 7) {
      const changeKg = last.weightKg - first.weightKg; // negative while losing
      const raw = avgIntake - (changeKg / span) * KCAL_PER_KG;
      // Clamp around the formula so scale/water noise can't produce a wild target.
      observedTdee = Math.round(Math.max(formulaTdee * 0.6, Math.min(formulaTdee * 1.4, raw)));
    }
  }
  const tdee = observedTdee ?? formulaTdee;

  // --- Target loss rate: constant %-bodyweight, capped to the muscle-sparing zone ---
  let weeklyLossKg = currentWeight * SAFE_WEEKLY_LOSS_PCT;
  if (metrics.targetWeightKg != null && metrics.targetDate) {
    const daysLeft = daysBetween(today, metrics.targetDate);
    const toLose = currentWeight - metrics.targetWeightKg;
    if (toLose <= 0) {
      weeklyLossKg = 0; // already at/under goal — hold at maintenance
    } else if (daysLeft > 0) {
      weeklyLossKg = (toLose / daysLeft) * 7; // pace to hit the deadline...
    }
  }
  weeklyLossKg = Math.max(0, Math.min(weeklyLossKg, currentWeight * MAX_WEEKLY_LOSS_PCT)); // ...but never unsafe

  const dailyDeficit = (weeklyLossKg * KCAL_PER_KG) / 7;
  const floor = metrics.sex === 'male' ? 1500 : 1200;
  const calories = Math.max(floor, Math.round((tdee - dailyDeficit) / 10) * 10);

  const proteinG = Math.round(currentWeight * CUT_PROTEIN_G_PER_KG);
  return {
    calories,
    macros: macrosWithProteinFloor(calories, proteinG, metrics.diet),
    proteinG,
    observedTdee,
    basis: observedTdee != null ? 'adaptive' : 'formula',
    targetWeeklyLossKg: weeklyLossKg,
    intakeDays,
  };
}

// ---------------------------------------------------------------------------
// Weight tracking / projection
// ---------------------------------------------------------------------------

/** Latest logged weight (kg), or undefined if none. */
export function latestWeight(weights: WeightEntry[]): WeightEntry | undefined {
  return [...weights].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}

/**
 * A straight-line "how it should be going" projection from a starting weight
 * to the target weight over the plan window. Returns {date, weightKg} points.
 */
export function weightProjection(
  startWeightKg: number,
  startDate: string,
  targetWeightKg: number,
  targetDate: string,
  points = 2,
): { date: string; weightKg: number }[] {
  const total = daysBetween(startDate, targetDate);
  if (total <= 0) return [{ date: startDate, weightKg: startWeightKg }];
  return Array.from({ length: points }, (_, i) => {
    const frac = i / (points - 1);
    return {
      date: addDays(startDate, Math.round(total * frac)),
      weightKg: startWeightKg + (targetWeightKg - startWeightKg) * frac,
    };
  });
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Local YYYY-MM-DD for a given date (defaults to today). */
export function toDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD key into a local Date at midnight. */
export function fromDateKey(key: string): Date {
  // Defensive: a malformed/missing key should never throw — fall back to today.
  if (!key || typeof key !== 'string') return new Date();
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

/** Add (or subtract) whole days to a date key. */
export function addDays(key: string, days: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** Whole calendar days from `a` to `b` (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = fromDateKey(b).getTime() - fromDateKey(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** The seven date keys of the week containing `key` (Sunday first). */
export function weekOf(key: string = toDateKey()): string[] {
  const d = fromDateKey(key);
  const sunday = addDays(key, -d.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

/** Friendly label for a date key relative to today (Today / Yesterday / date). */
export function relativeDayLabel(key: string): string {
  const diff = daysBetween(key, toDateKey());
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  return fromDateKey(key).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Current logging streak: consecutive days (ending today or yesterday) that
 * have at least one entry. Grace for "today not logged yet" keeps the streak
 * alive until the day ends.
 */
export function currentStreak(datesWithEntries: Set<string>): number {
  const today = toDateKey();
  let cursor = datesWithEntries.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (datesWithEntries.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
