import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyTombstones,
  entriesToPush,
  mergeEntries,
  mergeProfile,
  mergeWeights,
  weightsToPush,
} from '../merge.ts';
import type { FoodEntry, Profile, UserMetrics, WeightEntry } from '../../types/index.ts';

/**
 * These tests exist for one reason: a merge bug silently destroys months of
 * logging, and nothing in the UI would show it until the data was already gone.
 * The cases below are the ones that would actually cost data.
 */

function entry(id: string, over: Partial<FoodEntry> = {}): FoodEntry {
  return {
    id,
    name: id,
    date: '2026-08-01',
    meal: 'lunch',
    calories: 500,
    macros: { protein: 30, carbs: 40, fat: 20 },
    quantity: 1,
    createdAt: 1000,
    ...over,
  };
}

const profile = (over: Partial<Profile> = {}): Profile => ({
  name: 'You',
  goals: { calories: 2000, macros: { protein: 150, carbs: 200, fat: 60 } },
  onboarded: true,
  notificationsEnabled: false,
  units: 'metric',
  theme: 'dark',
  ...over,
});

describe('mergeEntries', () => {
  it('keeps entries that exist on only one side', () => {
    const merged = mergeEntries([entry('a')], [entry('b')]);
    assert.deepEqual(merged.map((e) => e.id).sort(), ['a', 'b']);
  });

  it('adopts all local history when the cloud is empty (first sign-in)', () => {
    const local = [entry('a'), entry('b'), entry('c')];
    assert.equal(mergeEntries(local, []).length, 3);
  });

  it('adopts all cloud history when local is empty (fresh install)', () => {
    const remote = [entry('a'), entry('b')];
    assert.equal(mergeEntries([], remote).length, 2);
  });

  it('resolves a collision in favour of the more recent write', () => {
    const local = entry('a', { name: 'local', updatedAt: 100 });
    const remote = entry('a', { name: 'remote', updatedAt: 200 });
    assert.equal(mergeEntries([local], [remote])[0].name, 'remote');
    assert.equal(mergeEntries([remote], [local])[0].name, 'remote');
  });

  it('keeps the local copy when neither side has ever been stamped', () => {
    // Entries written before sync existed have no updatedAt. The device in hand
    // wins, otherwise a stale cloud row could silently undo a local edit.
    const local = entry('a', { name: 'local' });
    const remote = entry('a', { name: 'remote' });
    assert.equal(mergeEntries([local], [remote])[0].name, 'local');
  });

  it('treats a stamped edit as newer than an unstamped original', () => {
    const local = entry('a', { name: 'edited', createdAt: 1000, updatedAt: 5000 });
    const remote = entry('a', { name: 'original', createdAt: 1000 });
    assert.equal(mergeEntries([local], [remote])[0].name, 'edited');
  });

  it('never produces duplicates for the same id', () => {
    const merged = mergeEntries([entry('a'), entry('b')], [entry('a'), entry('b')]);
    assert.equal(merged.length, 2);
  });

  it('orders the result by creation time regardless of input order', () => {
    const merged = mergeEntries(
      [entry('late', { createdAt: 3000 })],
      [entry('early', { createdAt: 1000 }), entry('mid', { createdAt: 2000 })],
    );
    assert.deepEqual(merged.map((e) => e.id), ['early', 'mid', 'late']);
  });
});

describe('mergeWeights', () => {
  const w = (date: string, weightKg: number, updatedAt?: number): WeightEntry => ({
    date,
    weightKg,
    updatedAt,
  });

  it('unions distinct dates and sorts them', () => {
    const merged = mergeWeights([w('2026-08-02', 84)], [w('2026-08-01', 85)]);
    assert.deepEqual(merged.map((x) => x.date), ['2026-08-01', '2026-08-02']);
  });

  it('takes the newer write when the same day is logged twice', () => {
    const merged = mergeWeights([w('2026-08-01', 84, 100)], [w('2026-08-01', 85, 200)]);
    assert.equal(merged[0].weightKg, 85);
  });

  it('prefers the local value when neither is stamped', () => {
    const merged = mergeWeights([w('2026-08-01', 84)], [w('2026-08-01', 85)]);
    assert.equal(merged[0].weightKg, 84);
  });
});

/** The metrics a finished onboarding produces — the payload worth protecting. */
const METRICS: UserMetrics = {
  sex: 'male',
  birthDate: '2004-01-01',
  heightCm: 180,
  weightKg: 85,
  workoutsPerWeek: '3-5',
  goalType: 'lose',
  diet: 'balanced',
  targetWeightKg: 75,
  targetDate: '2027-04-01',
};

/** A profile that has actually been through onboarding. */
const real = (over: Partial<Profile> = {}) =>
  profile({ onboarded: true, metrics: METRICS, ...over });

/** A profile that has not — a fresh install, or a default row in the cloud. */
const empty = (over: Partial<Profile> = {}) =>
  profile({ onboarded: false, metrics: undefined, ...over });

describe('mergeProfile', () => {
  it('returns local when there is no remote profile', () => {
    assert.equal(mergeProfile(real({ name: 'Matej' }), null).name, 'Matej');
  });

  it('never lets a fresh un-onboarded profile clobber a real one', () => {
    // The damaging case: a reinstall holds a default profile for a moment, and
    // without this rule it would overwrite months of goals and metrics — even
    // though the empty side carries the newer timestamp.
    const fresh = empty({ name: 'You', updatedAt: 9999 });
    assert.equal(mergeProfile(fresh, real({ name: 'Matej', updatedAt: 1 })).name, 'Matej');
  });

  it('prefers a finished local profile over an un-onboarded cloud one', () => {
    const remote = empty({ name: 'You', updatedAt: 9999 });
    assert.equal(mergeProfile(real({ name: 'Matej' }), remote).name, 'Matej');
  });

  it('keeps the local plan when the cloud row claims onboarding but has no metrics', () => {
    // A `profiles` row created from column defaults, or one hand-edited in the
    // dashboard, can carry `onboarded` without carrying anything to rebuild a
    // plan from. Trusting the flag alone would trade a real plan for a blank.
    const local = real({ name: 'Matej', updatedAt: 1 });
    const remote = profile({ onboarded: true, metrics: undefined, name: 'You', updatedAt: 9999 });
    const merged = mergeProfile(local, remote);
    assert.equal(merged.name, 'Matej');
    assert.deepEqual(merged.metrics, METRICS);
  });

  it('adopts the cloud plan onto a device that has none', () => {
    // Signing in on a fresh phone: local is a default profile, and the account
    // already holds a plan. That plan is the whole point of having an account.
    const merged = mergeProfile(empty(), real({ name: 'Matej' }));
    assert.equal(merged.name, 'Matej');
    assert.deepEqual(merged.metrics, METRICS);
  });

  it('falls back to the timestamp when both sides carry a real plan', () => {
    const local = real({ name: 'old', updatedAt: 100 });
    const remote = real({ name: 'new', updatedAt: 200 });
    assert.equal(mergeProfile(local, remote).name, 'new');
    // ...and the older edit does not win just for being on this device.
    assert.equal(mergeProfile(real({ name: 'new', updatedAt: 200 }), real({ name: 'old', updatedAt: 100 })).name, 'new');
  });

  it('keeps local on an exact timestamp tie', () => {
    const local = real({ name: 'local', updatedAt: 500 });
    const remote = real({ name: 'remote', updatedAt: 500 });
    assert.equal(mergeProfile(local, remote).name, 'local');
  });

  it('still resolves when neither side has ever been onboarded', () => {
    const merged = mergeProfile(empty({ name: 'a', updatedAt: 1 }), empty({ name: 'b', updatedAt: 2 }));
    assert.equal(merged.name, 'b');
  });
});

describe('applyTombstones', () => {
  it('removes entries deleted while offline so a merge cannot resurrect them', () => {
    const merged = mergeEntries([entry('a')], [entry('a'), entry('b')]);
    assert.equal(applyTombstones(merged, ['b']).length, 1);
  });

  it('is a no-op with no tombstones', () => {
    const list = [entry('a'), entry('b')];
    assert.equal(applyTombstones(list, []).length, 2);
  });

  it('ignores tombstones for entries that are already gone', () => {
    assert.equal(applyTombstones([entry('a')], ['x', 'y']).length, 1);
  });
});

describe('push diffing', () => {
  it('pushes only what the cloud is missing', () => {
    const merged = [entry('a'), entry('b'), entry('c')];
    const remote = [entry('a')];
    assert.deepEqual(entriesToPush(merged, remote).map((e) => e.id), ['b', 'c']);
  });

  it('pushes an entry the cloud holds an older copy of', () => {
    const merged = [entry('a', { updatedAt: 200 })];
    const remote = [entry('a', { updatedAt: 100 })];
    assert.equal(entriesToPush(merged, remote).length, 1);
  });

  it('pushes nothing when both sides already agree', () => {
    const same = [entry('a', { updatedAt: 100 })];
    assert.equal(entriesToPush(same, same).length, 0);
  });

  it('diffs weigh-ins by date the same way', () => {
    const merged: WeightEntry[] = [
      { date: '2026-08-01', weightKg: 85 },
      { date: '2026-08-02', weightKg: 84 },
    ];
    const remote: WeightEntry[] = [{ date: '2026-08-01', weightKg: 85 }];
    assert.deepEqual(weightsToPush(merged, remote).map((w) => w.date), ['2026-08-02']);
  });
});
