import { addDays, toDateKey, weekOf } from '@/lib/nutrition';

/**
 * Moving Home's week strip backwards and forwards through history.
 *
 * Kept out of the component because the interesting parts are arithmetic, not
 * gestures: what happens at a month or year boundary, and what stops a swipe
 * walking into next week. `addDays` already goes through `Date`, so calendar
 * rollover and DST are handled — the job here is only the clamp.
 *
 * There is no separate "displayed week" state. The week on screen is always
 * `weekOf(selectedDate)`, so navigation is expressed as a move of the selected
 * day; keeping the weekday position means a Wednesday stays a Wednesday as you
 * page back, which is what makes repeated swipes predictable.
 */

/** Whether there is a newer week to move to — never past the one containing today. */
export function canGoForward(selected: string, today: string = toDateKey()): boolean {
  return weekOf(selected)[6] < today;
}

/**
 * The day to select when paging by a week.
 *
 * `-1` goes back without limit: history is history, and a week with nothing in
 * it still displays correctly. `+1` is clamped to today, so landing on the
 * current week from a Saturday in the past selects today rather than a date
 * that has not happened yet.
 */
export function shiftWeek(selected: string, direction: -1 | 1, today: string = toDateKey()): string {
  if (direction === -1) return addDays(selected, -7);
  if (!canGoForward(selected, today)) return selected;
  const next = addDays(selected, 7);
  return next > today ? today : next;
}
