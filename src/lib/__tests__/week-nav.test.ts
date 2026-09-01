import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { weekOf } from '../nutrition.ts';
import { canGoForward, shiftWeek } from '../week-nav.ts';

/**
 * The week strip is paged by moving the selected day, so the edges that matter
 * are calendar edges — month and year rollover — and the clamp that stops a
 * swipe walking into days that have not happened.
 */

describe('canGoForward', () => {
  it('is false anywhere in the week containing today', () => {
    const today = '2026-09-02'; // a Wednesday
    for (const day of weekOf(today)) {
      assert.equal(canGoForward(day, today), false, day);
    }
  });

  it('is true in any earlier week', () => {
    assert.equal(canGoForward('2026-08-26', '2026-09-02'), true);
    assert.equal(canGoForward('2020-01-01', '2026-09-02'), true);
  });

  it('turns true the moment a new week starts', () => {
    // Saturday 29 August closes its week. While today is still that Saturday
    // there is nowhere forward to go; by Sunday the 30th there is.
    assert.equal(canGoForward('2026-08-29', '2026-08-29'), false);
    assert.equal(canGoForward('2026-08-29', '2026-08-30'), true);
  });
});

describe('shiftWeek', () => {
  const TODAY = '2026-09-02';

  it('goes back a week and keeps the weekday', () => {
    assert.equal(shiftWeek(TODAY, -1, TODAY), '2026-08-26');
    assert.equal(shiftWeek('2026-08-26', -1, TODAY), '2026-08-19');
  });

  it('goes back without limit — history has no floor', () => {
    let day = TODAY;
    for (let i = 0; i < 200; i += 1) day = shiftWeek(day, -1, TODAY);
    assert.equal(day, '2022-11-02');
  });

  it('comes forward a week and keeps the weekday', () => {
    assert.equal(shiftWeek('2026-08-19', 1, TODAY), '2026-08-26');
  });

  it('clamps forward to today rather than landing on a future day', () => {
    // Saturday 29th + 7 is Saturday the 5th, which has not happened.
    assert.equal(shiftWeek('2026-08-29', 1, TODAY), TODAY);
  });

  it('refuses to leave the current week', () => {
    for (const day of weekOf(TODAY)) {
      assert.equal(shiftWeek(day, 1, TODAY), day, day);
    }
  });

  it('crosses a month boundary in both directions', () => {
    assert.equal(shiftWeek('2026-09-02', -1, TODAY), '2026-08-26');
    assert.equal(shiftWeek('2026-08-05', 1, '2026-09-30'), '2026-08-12');
    // Back over the start of a 31-day month.
    assert.equal(shiftWeek('2026-08-03', -1, TODAY), '2026-07-27');
  });

  it('crosses a year boundary in both directions', () => {
    assert.equal(shiftWeek('2027-01-04', -1, '2027-01-10'), '2026-12-28');
    assert.equal(shiftWeek('2026-12-28', 1, '2027-01-10'), '2027-01-04');
  });

  it('crosses a leap day', () => {
    assert.equal(shiftWeek('2028-03-02', -1, '2028-03-05'), '2028-02-24');
    assert.equal(shiftWeek('2028-02-24', 1, '2028-03-05'), '2028-03-02');
  });

  it('is reversible: back then forward returns to the same day', () => {
    const back = shiftWeek('2026-08-19', -1, TODAY);
    assert.equal(shiftWeek(back, 1, TODAY), '2026-08-19');
  });

  it('always lands on a day inside the week it is meant to show', () => {
    // The strip renders weekOf(selected), so a shift that landed outside the
    // intended week would silently show the wrong seven days.
    const back = shiftWeek(TODAY, -1, TODAY);
    assert.ok(weekOf(back).includes(back));
    assert.deepEqual(weekOf(back), weekOf('2026-08-26'));
    assert.ok(!weekOf(back).includes(TODAY));
  });
});
