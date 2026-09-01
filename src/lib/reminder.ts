/**
 * When — and whether — to queue the daily "you haven't logged anything" nudge.
 *
 * This is pure so that the awkward parts can actually be tested: what happens
 * across midnight, across a month or year boundary, when the app is opened five
 * times in a minute, and when the user logs breakfast at eight. None of that is
 * observable through `expo-notifications`, which is why the previous version's
 * duplicate-notification bugs went unnoticed.
 *
 * The whole design rests on one idea: **the OS queue is the state**. Rather than
 * remembering what was scheduled and trying to keep a record in sync with the
 * system, every call reads what is actually queued, computes the single
 * reminder that *should* be queued, and cancels everything else. Running it
 * twice with the same inputs is therefore a no-op by construction — the second
 * pass finds the reminder it wants already there and does nothing. That is what
 * makes repeated app opens incapable of stacking notifications, rather than a
 * flag someone has to remember to check.
 */

/** Local noon. Late enough to mean "you've skipped breakfast", early enough to act on. */
export const REMINDER_HOUR = 12;

/** A reminder currently queued with the OS. */
export interface ScheduledReminder {
  /** The OS notification identifier, used to cancel it. */
  id: string;
  /**
   * When it will fire, in epoch milliseconds — read back from the payload we
   * wrote, not from the trigger, whose shape differs per platform. Anything we
   * cannot read a time from is `0`, which never matches a target and so is
   * always cancelled. That is deliberate: it is how a reminder left over from
   * an older version of the app (a repeating 19:00 daily) gets cleaned up.
   */
  fireAt: number;
}

export interface ReminderInput {
  /** Now, in epoch milliseconds. */
  now: number;
  /** The user's Profile preference, already ANDed with OS permission. */
  enabled: boolean;
  /** Whether any food is logged against today's date key. */
  hasLoggedToday: boolean;
  /** Everything currently queued with the OS. */
  scheduled: ScheduledReminder[];
}

export interface ReminderPlan {
  /** Notification ids to cancel. */
  cancel: string[];
  /** Epoch ms to schedule a single reminder at, or null to schedule nothing. */
  schedule: number | null;
}

/** Noon on the local calendar day `offset` days from the one containing `now`. */
function noonOn(now: number, offset: number): number {
  const d = new Date(now);
  // Constructing through local Y/M/D is what makes this timezone- and
  // DST-correct: it is noon on the wall clock, not `now + 12h`. Passing a day
  // number outside the month rolls over correctly, so month and year
  // boundaries need no special case.
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, REMINDER_HOUR, 0, 0, 0).getTime();
}

/**
 * The one moment a reminder should be waiting for.
 *
 * Today's noon only if it is still ahead *and* nothing is logged yet;
 * otherwise tomorrow's. Once noon has passed, today is settled either way —
 * the reminder either fired or was cancelled — so the next thing to queue is
 * always the following day's.
 */
export function nextReminderAt(now: number, hasLoggedToday: boolean): number {
  const todayNoon = noonOn(now, 0);
  if (!hasLoggedToday && now < todayNoon) return todayNoon;
  return noonOn(now, 1);
}

/**
 * Reconcile the OS queue against what it should hold.
 *
 * Returns at most one thing to schedule, and cancels everything that is not it
 * — including a duplicate of the correct reminder, so a queue that has somehow
 * drifted converges on the next run instead of staying broken.
 */
export function planReminder(input: ReminderInput): ReminderPlan {
  const { now, enabled, hasLoggedToday, scheduled } = input;

  if (!enabled) return { cancel: scheduled.map((s) => s.id), schedule: null };

  const target = nextReminderAt(now, hasLoggedToday);
  // A reminder queued for exactly the right moment is kept; the first match
  // wins so that duplicates of it are still cancelled.
  const keeper = scheduled.find((s) => s.fireAt === target);

  return {
    cancel: scheduled.filter((s) => s !== keeper).map((s) => s.id),
    schedule: keeper ? null : target,
  };
}
