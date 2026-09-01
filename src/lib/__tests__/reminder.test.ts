import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  nextReminderAt,
  planReminder,
  REMINDER_HOUR,
  type ReminderPlan,
  type ScheduledReminder,
} from '../reminder.ts';

/**
 * The notification bugs this replaces were all invisible from the outside: a
 * banner on every app open, a nudge after the meal it was nudging about, and a
 * queue that grew every launch. None of them could be reproduced without
 * waiting a day, which is why the logic now lives in a pure function and every
 * one of those scenarios is a test.
 */

/** A local timestamp, built the way a wall clock reads — never from UTC. */
function at(y: number, m: number, d: number, h: number, min = 0): number {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

/** The OS queue, after applying a plan to it. */
function apply(queue: ScheduledReminder[], plan: ReminderPlan, nextId: string): ScheduledReminder[] {
  const kept = queue.filter((s) => !plan.cancel.includes(s.id));
  return plan.schedule == null ? kept : [...kept, { id: nextId, fireAt: plan.schedule }];
}

describe('nextReminderAt', () => {
  it('targets noon today when the morning is still going and nothing is logged', () => {
    const target = nextReminderAt(at(2026, 9, 1, 8, 30), false);
    assert.equal(target, at(2026, 9, 1, 12, 0));
  });

  it('skips to tomorrow once food is logged, however early', () => {
    const target = nextReminderAt(at(2026, 9, 1, 6, 5), true);
    assert.equal(target, at(2026, 9, 2, 12, 0));
  });

  it('skips to tomorrow once noon has passed, logged or not', () => {
    // The afternoon case is the one that used to re-nudge: today is settled
    // either way by now, so the only thing left to queue is tomorrow's.
    assert.equal(nextReminderAt(at(2026, 9, 1, 12, 1), false), at(2026, 9, 2, 12, 0));
    assert.equal(nextReminderAt(at(2026, 9, 1, 20, 0), true), at(2026, 9, 2, 12, 0));
  });

  it('fires at noon on the local wall clock, whatever the timezone', () => {
    // Asserting on the *local* hour rather than a UTC offset is what makes this
    // meaningful: it holds in every zone the test runner might be set to.
    const target = new Date(nextReminderAt(at(2026, 9, 1, 9, 0), false));
    assert.equal(target.getHours(), REMINDER_HOUR);
    assert.equal(target.getMinutes(), 0);
    assert.equal(target.getDate(), 1);
  });

  it('crosses a month boundary', () => {
    assert.equal(nextReminderAt(at(2026, 9, 30, 15, 0), false), at(2026, 10, 1, 12, 0));
  });

  it('crosses a year boundary', () => {
    assert.equal(nextReminderAt(at(2026, 12, 31, 18, 0), true), at(2027, 1, 1, 12, 0));
  });
});

describe('planReminder', () => {
  it('queues one reminder when the queue is empty', () => {
    const plan = planReminder({
      now: at(2026, 9, 1, 8, 0),
      enabled: true,
      hasLoggedToday: false,
      scheduled: [],
    });
    assert.deepEqual(plan.cancel, []);
    assert.equal(plan.schedule, at(2026, 9, 1, 12, 0));
  });

  it('does nothing at all when the right reminder is already queued', () => {
    // The core anti-duplicate property, stated directly.
    const plan = planReminder({
      now: at(2026, 9, 1, 8, 0),
      enabled: true,
      hasLoggedToday: false,
      scheduled: [{ id: 'a', fireAt: at(2026, 9, 1, 12, 0) }],
    });
    assert.deepEqual(plan, { cancel: [], schedule: null });
  });

  it('cannot stack reminders across repeated app opens', () => {
    let queue: ScheduledReminder[] = [];
    // Five opens over the course of a morning, nothing logged.
    for (const [i, hour] of [7, 8, 9, 10, 11].entries()) {
      const plan = planReminder({
        now: at(2026, 9, 1, hour, 0),
        enabled: true,
        hasLoggedToday: false,
        scheduled: queue,
      });
      queue = apply(queue, plan, `n${i}`);
    }
    assert.equal(queue.length, 1);
    assert.equal(queue[0].fireAt, at(2026, 9, 1, 12, 0));
    // And it is still the *first* one: the later opens genuinely did nothing.
    assert.equal(queue[0].id, 'n0');
  });

  it('survives a relaunch without duplicating', () => {
    // A relaunch differs from a foreground only in that nothing is remembered
    // in-process — the queue is read back from the OS either way.
    const queue: ScheduledReminder[] = [{ id: 'a', fireAt: at(2026, 9, 1, 12, 0) }];
    const plan = planReminder({
      now: at(2026, 9, 1, 9, 30),
      enabled: true,
      hasLoggedToday: false,
      scheduled: queue,
    });
    assert.deepEqual(apply(queue, plan, 'b'), queue);
  });

  it('cancels today’s pending reminder as soon as breakfast is logged', () => {
    const queue: ScheduledReminder[] = [{ id: 'a', fireAt: at(2026, 9, 1, 12, 0) }];
    const plan = planReminder({
      now: at(2026, 9, 1, 8, 15),
      enabled: true,
      hasLoggedToday: true,
      scheduled: queue,
    });
    assert.deepEqual(plan.cancel, ['a']);
    assert.equal(plan.schedule, at(2026, 9, 2, 12, 0));
  });

  it('does not queue a second reminder when food is logged after one fired', () => {
    // A fired notification is no longer in the queue, so this is the state at
    // 13:00 on a day the nudge went out and lunch followed it.
    const plan = planReminder({
      now: at(2026, 9, 1, 13, 0),
      enabled: true,
      hasLoggedToday: true,
      scheduled: [],
    });
    assert.equal(plan.schedule, at(2026, 9, 2, 12, 0));
  });

  it('schedules nothing and clears the queue when reminders are off', () => {
    const plan = planReminder({
      now: at(2026, 9, 1, 8, 0),
      enabled: false,
      hasLoggedToday: false,
      scheduled: [{ id: 'a', fireAt: at(2026, 9, 1, 12, 0) }],
    });
    assert.deepEqual(plan, { cancel: ['a'], schedule: null });
  });

  it('rolls over to the next day once the date changes', () => {
    // The app was left open overnight with tomorrow's reminder queued; at
    // 00:05 that reminder is today's, and still correct.
    const queue: ScheduledReminder[] = [{ id: 'a', fireAt: at(2026, 9, 2, 12, 0) }];
    const same = planReminder({
      now: at(2026, 9, 2, 0, 5),
      enabled: true,
      hasLoggedToday: false,
      scheduled: queue,
    });
    assert.deepEqual(same, { cancel: [], schedule: null });

    // The day after, with the 2nd logged, it moves on by itself.
    const next = planReminder({
      now: at(2026, 9, 2, 19, 0),
      enabled: true,
      hasLoggedToday: true,
      scheduled: queue,
    });
    assert.deepEqual(next.cancel, ['a']);
    assert.equal(next.schedule, at(2026, 9, 3, 12, 0));
  });

  it('retires a reminder left over from an older version of the app', () => {
    // The repeating 19:00 daily had no payload, so it reads back as fireAt 0 —
    // matches nothing, and is cancelled on the first sync after the update.
    const plan = planReminder({
      now: at(2026, 9, 1, 8, 0),
      enabled: true,
      hasLoggedToday: false,
      scheduled: [{ id: 'legacy', fireAt: 0 }],
    });
    assert.deepEqual(plan.cancel, ['legacy']);
    assert.equal(plan.schedule, at(2026, 9, 1, 12, 0));
  });

  it('collapses a queue that has already drifted into duplicates', () => {
    const noon = at(2026, 9, 1, 12, 0);
    const plan = planReminder({
      now: at(2026, 9, 1, 8, 0),
      enabled: true,
      hasLoggedToday: false,
      scheduled: [
        { id: 'a', fireAt: noon },
        { id: 'b', fireAt: noon },
        { id: 'c', fireAt: at(2026, 9, 5, 12, 0) },
      ],
    });
    assert.deepEqual(plan.cancel, ['b', 'c']);
    assert.equal(plan.schedule, null);
  });
});
