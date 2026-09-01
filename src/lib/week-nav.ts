import { addDays, toDateKey, weekOf } from '@/lib/nutrition';

/**
 * Moving Home's week strip backwards and forwards through history.
 *
 * Kept out of the component because the interesting parts are arithmetic, not
 * gestures: what happens at a month or year boundary, and what stops a swipe
 * walking into next week. `addDays` already goes through `Date`, so calendar
 * rollover and DST are handled — the job here is only the clamp.
 *
 * These move an *anchor* — any day in the week to display — and nothing else.
 * Paging browses; selecting is a separate act, done by tapping a day. Keeping
 * the weekday position means a Wednesday anchor stays a Wednesday as you page
 * back, which is what makes repeated swipes land predictably.
 */

/** Whether there is a newer week to move to — never past the one containing today. */
export function canGoForward(selected: string, today: string = toDateKey()): boolean {
  return weekOf(selected)[6] < today;
}

/**
 * The anchor to display after paging by a week.
 *
 * `-1` goes back without limit: history is history, and a week with nothing in
 * it still displays correctly. `+1` is clamped to today so the anchor is never
 * a date that has not happened — it lands in the same week either way, but a
 * real day is easier to reason about than a hypothetical one.
 */
export function shiftWeek(selected: string, direction: -1 | 1, today: string = toDateKey()): string {
  if (direction === -1) return addDays(selected, -7);
  if (!canGoForward(selected, today)) return selected;
  const next = addDays(selected, 7);
  return next > today ? today : next;
}
