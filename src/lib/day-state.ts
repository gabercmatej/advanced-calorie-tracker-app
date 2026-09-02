/**
 * What a single day in Home's week strip means.
 *
 * Three facts get drawn on the same seven circles and they are not the same
 * fact:
 *
 *   - **today** — the actual local calendar date, right now
 *   - **selected** — the day whose meals are listed below the strip
 *   - **activity** — whether anything was logged on that day
 *
 * They were previously collapsed, which is how 1 September ended up wearing the
 * today circle on 2 September: the strip filled whichever day had hit its
 * calorie goal and outlined whichever day was selected, and neither of those is
 * "today". Looking at yesterday must not move the today marker, and a day with
 * a weigh-in but no food is still a day with something on it.
 *
 * Pure, so the rules can be tested at a month boundary, a year boundary and
 * across midnight without a renderer.
 */

/** Local midnight tonight, in epoch millis. */
export function nextLocalMidnight(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
}

/**
 * How long until the calendar date changes.
 *
 * Built from the `Date(y, m, d + 1)` constructor rather than by adding 24 hours,
 * so a daylight-saving change makes the day 23 or 25 hours long and the timer
 * still lands on midnight. A second of slack keeps a timer that fires a
 * hair early from waking up on the same date it started on.
 */
export function msUntilNextLocalMidnight(now: number): number {
  return Math.max(1_000, nextLocalMidnight(now) - now + 1_000);
}

export interface DayInput {
  /** The day being drawn, as a date key. */
  date: string;
  /** The real current local date. Never derived from the selection. */
  today: string;
  /** The day Home is describing. */
  selectedDate: string;
  hasFood: boolean;
  hasWeight: boolean;
}

export interface DayState {
  /** Gets the filled marker, always, logged or not. Exactly one day can. */
  isToday: boolean;
  /** Gets the subtle selection marker — deliberately not the green circle. */
  isSelected: boolean;
  /** A past day with a food entry or a weigh-in. Either is enough. */
  hasActivity: boolean;
  /** Not yet happened: untappable, and never marked. */
  isFuture: boolean;
}

export function dayState(input: DayInput): DayState {
  const { date, today, selectedDate, hasFood, hasWeight } = input;
  const isFuture = date > today;
  return {
    isToday: date === today,
    isSelected: date === selectedDate,
    // A day that has not happened cannot have anything on it, whatever the
    // diary says — a bad date key must not paint a marker into the future.
    hasActivity: !isFuture && (hasFood || hasWeight),
    isFuture,
  };
}
