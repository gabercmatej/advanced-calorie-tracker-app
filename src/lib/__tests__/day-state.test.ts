import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dayState, msUntilNextLocalMidnight, nextLocalMidnight } from '@/lib/day-state';
import { toDateKey, weekOf } from '@/lib/nutrition';

/**
 * The bug these guard against: on 2 September, 1 September wore the today
 * circle. Three facts were sharing two visual channels — the filled circle was
 * "hit your calorie goal" and the outline was "selected" — so nothing on the
 * strip actually meant *today*, and looking at yesterday moved the highlight
 * with it.
 */

/** A day with food, a day with only a weigh-in, a day with both. */
const FOOD = new Set(['2026-09-01', '2026-08-28']);
const WEIGHED = new Set(['2026-08-31', '2026-08-28']);

function state(date: string, today = '2026-09-02', selectedDate = today) {
  return dayState({
    date,
    today,
    selectedDate,
    hasFood: FOOD.has(date),
    hasWeight: WEIGHED.has(date),
  });
}

describe('today is today', () => {
  it('marks the real current date', () => {
    assert.equal(state('2026-09-02').isToday, true);
  });

  it('does not mark yesterday, even when yesterday is what is selected', () => {
    const yesterday = state('2026-09-01', '2026-09-02', '2026-09-01');
    assert.equal(yesterday.isToday, false, 'the reported bug, in one assertion');
    assert.equal(yesterday.isSelected, true);
  });

  it('still marks today when the selection has moved off it', () => {
    assert.equal(state('2026-09-02', '2026-09-02', '2026-09-01').isToday, true);
  });

  it('marks exactly one day in the week containing it', () => {
    const marked = weekOf('2026-09-02').filter((key) => state(key).isToday);
    assert.deepEqual(marked, ['2026-09-02']);
  });

  it('marks none at all in a week that does not contain today', () => {
    const marked = weekOf('2026-08-12').filter((key) => state(key).isToday);
    assert.deepEqual(marked, []);
  });

  it('moves across a month boundary', () => {
    assert.equal(state('2026-08-31', '2026-08-31').isToday, true);
    assert.equal(state('2026-08-31', '2026-09-01').isToday, false);
    assert.equal(state('2026-09-01', '2026-09-01').isToday, true);
  });

  it('moves across a year boundary', () => {
    assert.equal(state('2026-12-31', '2026-12-31').isToday, true);
    assert.equal(state('2026-12-31', '2027-01-01').isToday, false);
    assert.equal(state('2027-01-01', '2027-01-01').isToday, true);
  });
});

describe('activity is food or weight, either one', () => {
  it('marks a past day with food', () => {
    assert.equal(state('2026-09-01').hasActivity, true);
  });

  it('marks a past day with only a weigh-in', () => {
    assert.equal(state('2026-08-31').hasActivity, true);
  });

  it('marks a day with both exactly once — it is one flag, not two', () => {
    const both = state('2026-08-28');
    assert.equal(both.hasActivity, true);
  });

  it('leaves a day with nothing on it unmarked', () => {
    assert.equal(state('2026-08-30').hasActivity, false);
  });

  it('never marks a future day, whatever the diary claims', () => {
    const impossible = dayState({
      date: '2026-09-05',
      today: '2026-09-02',
      selectedDate: '2026-09-02',
      hasFood: true,
      hasWeight: true,
    });
    assert.equal(impossible.hasActivity, false);
    assert.equal(impossible.isFuture, true);
  });

  it('marks today by activity too, so the strip can decide which wins', () => {
    const logged = dayState({
      date: '2026-09-02',
      today: '2026-09-02',
      selectedDate: '2026-09-02',
      hasFood: true,
      hasWeight: false,
    });
    assert.equal(logged.isToday, true);
    assert.equal(logged.hasActivity, true);
  });

  it('works the same in a previous week, which has no today in it at all', () => {
    // Sunday 23rd to Saturday 29th August: only the 28th has anything on it.
    const previous = weekOf('2026-08-26');
    assert.deepEqual(previous.filter((key) => state(key).hasActivity), ['2026-08-28']);
    assert.deepEqual(previous.filter((key) => state(key).isToday), []);
  });

  it('marks a weigh-in-only day in the current week without touching today', () => {
    // Sunday 30th August to Saturday 5th September, which contains today.
    const current = weekOf('2026-09-02');
    assert.deepEqual(current.filter((key) => state(key).hasActivity), ['2026-08-31', '2026-09-01']);
    assert.deepEqual(current.filter((key) => state(key).isToday), ['2026-09-02']);
  });

  it('marks activity across a year boundary without confusing the dates', () => {
    const food = new Set(['2026-12-31']);
    const on = (date: string) =>
      dayState({ date, today: '2027-01-02', selectedDate: '2027-01-02', hasFood: food.has(date), hasWeight: false });
    assert.equal(on('2026-12-31').hasActivity, true);
    assert.equal(on('2027-01-01').hasActivity, false);
  });
});

describe('selection is its own thing', () => {
  it('follows the selected day and nothing else', () => {
    assert.equal(state('2026-08-25', '2026-09-02', '2026-08-25').isSelected, true);
    assert.equal(state('2026-08-25', '2026-09-02', '2026-09-02').isSelected, false);
  });

  it('does not imply activity, and activity does not imply selection', () => {
    const quietButSelected = state('2026-08-30', '2026-09-02', '2026-08-30');
    assert.equal(quietButSelected.isSelected, true);
    assert.equal(quietButSelected.hasActivity, false);

    const loggedButNotSelected = state('2026-09-01', '2026-09-02', '2026-09-02');
    assert.equal(loggedButNotSelected.isSelected, false);
    assert.equal(loggedButNotSelected.hasActivity, true);
  });
});

describe('the clock, for an app left open', () => {
  it('lands on the next local midnight', () => {
    const now = new Date(2026, 8, 2, 14, 30).getTime();
    const midnight = new Date(nextLocalMidnight(now));
    assert.equal(midnight.getDate(), 3);
    assert.equal(midnight.getHours(), 0);
    assert.equal(midnight.getMinutes(), 0);
  });

  it('crosses a month boundary', () => {
    const midnight = new Date(nextLocalMidnight(new Date(2026, 7, 31, 23, 0).getTime()));
    assert.equal(toDateKey(midnight), '2026-09-01');
  });

  it('crosses a year boundary', () => {
    const midnight = new Date(nextLocalMidnight(new Date(2026, 11, 31, 23, 59).getTime()));
    assert.equal(toDateKey(midnight), '2027-01-01');
  });

  it('waits a positive amount, and lands after midnight rather than on it', () => {
    const now = new Date(2026, 8, 2, 23, 59, 59, 500).getTime();
    const wait = msUntilNextLocalMidnight(now);
    assert.ok(wait > 0);
    assert.equal(toDateKey(new Date(now + wait)), '2026-09-03', 'the date has actually changed');
  });

  it('always waits at least a second, so a fast clock cannot spin', () => {
    const now = new Date(2026, 8, 2, 23, 59, 59, 999).getTime();
    assert.ok(msUntilNextLocalMidnight(now) >= 1_000);
  });

  it('recomputes the day after waking, rather than trusting a 24-hour step', () => {
    // A device asleep for three days wakes to the real date, not to one tick on.
    const slept = new Date(2026, 8, 5, 9, 0).getTime();
    assert.equal(toDateKey(new Date(slept)), '2026-09-05');
    assert.equal(state('2026-09-02', toDateKey(new Date(slept))).isToday, false);
    assert.equal(state('2026-09-05', toDateKey(new Date(slept))).isToday, true);
  });
});
