import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { reconcile, type LocalState, type RemoteState } from '../sync.ts';
import type { FoodEntry, Profile, UserMetrics, WeightEntry } from '../../types/index.ts';

/**
 * The sign-in flows, end to end.
 *
 * These drive the same `reconcile` the app calls, so they are not a model of
 * the sync — they are the sync. Every case below is one the user can actually
 * walk into, and every one of them used to be a way to lose data or leak it
 * between accounts.
 */

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

const DEFAULT_PROFILE: Profile = {
  name: 'You',
  goals: { calories: 2000, macros: { protein: 150, carbs: 200, fat: 60 } },
  onboarded: false,
  notificationsEnabled: false,
  units: 'metric',
  theme: 'light',
};

/** A profile that has been through onboarding — the thing worth not losing. */
function planned(over: Partial<Profile> = {}): Profile {
  return {
    ...DEFAULT_PROFILE,
    name: 'Matej',
    onboarded: true,
    metrics: METRICS,
    goals: { calories: 2350, macros: { protein: 170, carbs: 230, fat: 75 } },
    updatedAt: 1000,
    ...over,
  };
}

function entry(id: string, over: Partial<FoodEntry> = {}): FoodEntry {
  return {
    id,
    name: id,
    date: '2026-08-20',
    meal: 'lunch',
    calories: 500,
    macros: { protein: 40, carbs: 40, fat: 15 },
    quantity: 1,
    createdAt: 1000,
    ...over,
  };
}

const weight = (date: string, kg: number, updatedAt?: number): WeightEntry => ({
  date,
  weightKg: kg,
  updatedAt,
});

function local(over: Partial<LocalState> = {}): LocalState {
  return {
    entries: [],
    weights: [],
    profile: DEFAULT_PROFILE,
    savedFoods: [],
    ...over,
  };
}

function remote(over: Partial<RemoteState> = {}): RemoteState {
  return { entries: [], weights: [], profile: null, ...over };
}

const run = (over: Partial<Parameters<typeof reconcile>[0]>) =>
  reconcile({
    local: local(),
    remote: remote(),
    owner: null,
    userId: 'user-a',
    tombstones: [],
    stash: null,
    defaultProfile: DEFAULT_PROFILE,
    ...over,
  });

// ---------------------------------------------------------------------------

describe('onboarding → account', () => {
  it('adopts a plan made before the account existed', () => {
    // The reported bug, in its final resting place: onboarding completes while
    // signed out, an account is created, and the plan must still be there.
    const plan = run({
      local: local({ profile: planned() }),
      remote: remote({ profile: null }),
      owner: null,
    });
    assert.equal(plan.next.profile.onboarded, true);
    assert.deepEqual(plan.next.profile.metrics, METRICS);
    assert.equal(plan.next.profile.goals.calories, 2350);
    assert.equal(plan.adopted, true);
  });

  it('does not let a brand-new empty cloud profile replace that plan', () => {
    // Supabase creates a `profiles` row from column defaults. If that row wins
    // on timestamp, the user's plan becomes a 2000 kcal placeholder — silently.
    const cloudDefault: Profile = { ...DEFAULT_PROFILE, updatedAt: 999_999 };
    const plan = run({
      local: local({ profile: planned({ updatedAt: 1 }) }),
      remote: remote({ profile: cloudDefault }),
    });
    assert.equal(plan.next.profile.goals.calories, 2350);
    assert.deepEqual(plan.next.profile.metrics, METRICS);
  });

  it('pushes the adopted plan up so another device can have it', () => {
    const plan = run({ local: local({ profile: planned(), entries: [entry('a')] }) });
    assert.deepEqual(plan.pushEntries.map((e) => e.id), ['a']);
  });

  it('restores the plan onto a fresh device from the cloud alone', () => {
    // Reinstall, or a second phone: local is a default profile, the account
    // holds the plan, and the plan is what must survive.
    const plan = run({
      local: local(),
      remote: remote({ profile: planned(), entries: [entry('a'), entry('b')] }),
    });
    assert.equal(plan.next.profile.onboarded, true);
    assert.deepEqual(plan.next.profile.metrics, METRICS);
    assert.equal(plan.next.entries.length, 2);
  });

  it('takes the newer plan when both sides have one', () => {
    const older = planned({ updatedAt: 100, goals: { calories: 2100, macros: DEFAULT_PROFILE.goals.macros } });
    const newer = planned({ updatedAt: 200, goals: { calories: 2400, macros: DEFAULT_PROFILE.goals.macros } });
    assert.equal(run({ local: local({ profile: older }), remote: remote({ profile: newer }) }).next.profile.goals.calories, 2400);
    assert.equal(run({ local: local({ profile: newer }), remote: remote({ profile: older }) }).next.profile.goals.calories, 2400);
  });

  it('signs back into the same account without disturbing anything', () => {
    const shared = [entry('a'), entry('b')];
    const plan = run({
      local: local({ entries: shared, profile: planned() }),
      remote: remote({ entries: shared, profile: planned() }),
      owner: 'user-a',
    });
    assert.equal(plan.next.entries.length, 2);
    assert.equal(plan.pushEntries.length, 0, 'nothing should need re-pushing');
    assert.equal(plan.stashData, null);
  });
});

describe('existing diary adoption', () => {
  it('keeps every local entry when the cloud is empty', () => {
    const history = ['a', 'b', 'c', 'd'].map((id) => entry(id));
    const plan = run({ local: local({ entries: history }) });
    assert.equal(plan.next.entries.length, 4);
    assert.equal(plan.pushEntries.length, 4, 'all of it should be uploaded');
  });

  it('keeps weigh-ins as well as food', () => {
    const plan = run({
      local: local({ weights: [weight('2026-08-01', 85), weight('2026-08-02', 84.8)] }),
    });
    assert.equal(plan.next.weights.length, 2);
    assert.equal(plan.pushWeights.length, 2);
  });
});

describe('offline logging', () => {
  it('syncs an offline entry exactly once, without duplicating it', () => {
    const offline = entry('offline-1');
    const first = run({ local: local({ entries: [offline] }) });
    assert.deepEqual(first.pushEntries.map((e) => e.id), ['offline-1']);

    // Second launch: the cloud now has it, so there is nothing left to send.
    const second = run({
      local: local({ entries: first.next.entries }),
      remote: remote({ entries: [offline] }),
      owner: 'user-a',
    });
    assert.equal(second.next.entries.length, 1);
    assert.equal(second.pushEntries.length, 0);
  });
});

describe('multi-device merge', () => {
  it('keeps both sides when each has an entry the other lacks', () => {
    const plan = run({
      local: local({ entries: [entry('phone')] }),
      remote: remote({ entries: [entry('tablet')] }),
      owner: 'user-a',
    });
    assert.deepEqual(plan.next.entries.map((e) => e.id).sort(), ['phone', 'tablet']);
    assert.deepEqual(plan.pushEntries.map((e) => e.id), ['phone']);
  });

  it('merges weigh-ins from two devices by date', () => {
    const plan = run({
      local: local({ weights: [weight('2026-08-01', 85)] }),
      remote: remote({ weights: [weight('2026-08-02', 84.6)] }),
      owner: 'user-a',
    });
    assert.equal(plan.next.weights.length, 2);
  });
});

describe('conflicts', () => {
  it('resolves the same entry edited on both sides to the newer write', () => {
    const plan = run({
      local: local({ entries: [entry('x', { name: 'local edit', updatedAt: 100 })] }),
      remote: remote({ entries: [entry('x', { name: 'remote edit', updatedAt: 200 })] }),
      owner: 'user-a',
    });
    assert.equal(plan.next.entries.length, 1);
    assert.equal(plan.next.entries[0].name, 'remote edit');
  });

  it('is deterministic regardless of which side is called local', () => {
    const a = entry('x', { name: 'older', updatedAt: 100 });
    const b = entry('x', { name: 'newer', updatedAt: 200 });
    const one = run({ local: local({ entries: [a] }), remote: remote({ entries: [b] }), owner: 'user-a' });
    const two = run({ local: local({ entries: [b] }), remote: remote({ entries: [a] }), owner: 'user-a' });
    assert.equal(one.next.entries[0].name, 'newer');
    assert.equal(two.next.entries[0].name, 'newer');
  });

  it('resolves a same-day weigh-in conflict to the newer write', () => {
    const plan = run({
      local: local({ weights: [weight('2026-08-01', 85, 100)] }),
      remote: remote({ weights: [weight('2026-08-01', 84, 200)] }),
      owner: 'user-a',
    });
    assert.equal(plan.next.weights.length, 1);
    assert.equal(plan.next.weights[0].weightKg, 84);
  });
});

describe('deletion', () => {
  it('does not resurrect an entry deleted while offline', () => {
    const plan = run({
      local: local({ entries: [entry('keep')] }),
      remote: remote({ entries: [entry('keep'), entry('deleted')] }),
      owner: 'user-a',
      tombstones: ['deleted'],
    });
    assert.deepEqual(plan.next.entries.map((e) => e.id), ['keep']);
    assert.deepEqual(plan.replayDeletes, ['deleted']);
  });

  it('still reports the delete for replay when the cloud already lost it', () => {
    const plan = run({
      local: local({ entries: [] }),
      remote: remote({ entries: [] }),
      owner: 'user-a',
      tombstones: ['gone'],
    });
    assert.deepEqual(plan.replayDeletes, ['gone']);
    assert.equal(plan.next.entries.length, 0);
  });
});

describe('account switching', () => {
  const aData = local({
    entries: [entry('a-1'), entry('a-2')],
    weights: [weight('2026-08-01', 85)],
    profile: planned({ name: 'Matej' }),
  });

  it("never shows account A's diary to account B", () => {
    const plan = run({
      local: aData,
      remote: remote({ entries: [entry('b-1')], profile: planned({ name: 'Someone Else' }) }),
      owner: 'user-a',
      userId: 'user-b',
    });
    assert.deepEqual(plan.next.entries.map((e) => e.id), ['b-1']);
    assert.equal(plan.next.profile.name, 'Someone Else');
  });

  it("never pushes account A's diary into account B", () => {
    const plan = run({
      local: aData,
      remote: remote({ entries: [entry('b-1')] }),
      owner: 'user-a',
      userId: 'user-b',
    });
    assert.equal(plan.pushEntries.some((e) => e.id.startsWith('a-')), false);
  });

  it("sets account A's data aside rather than discarding it", () => {
    const plan = run({ local: aData, owner: 'user-a', userId: 'user-b' });
    assert.equal(plan.stashOwner, 'user-a');
    assert.deepEqual(plan.stashData?.entries.map((e) => e.id), ['a-1', 'a-2']);
    assert.equal(plan.stashData?.profile.name, 'Matej');
  });

  it('gives account A its data back when it signs in again', () => {
    // A → B → A. Without the stash lookup this is where A's offline history
    // disappeared for good: off the screen, and never uploaded.
    const plan = run({
      local: local({ entries: [entry('b-1')], profile: planned({ name: 'Someone Else' }) }),
      remote: remote({ entries: [] }),
      owner: 'user-b',
      userId: 'user-a',
      stash: aData,
    });
    assert.deepEqual(plan.next.entries.map((e) => e.id), ['a-1', 'a-2']);
    assert.equal(plan.next.profile.name, 'Matej');
    assert.deepEqual(plan.next.profile.metrics, METRICS);
    // ...and it gets uploaded this time.
    assert.equal(plan.pushEntries.length, 2);
  });

  it("does not carry A's pending deletions into B", () => {
    const plan = run({
      local: aData,
      remote: remote({ entries: [entry('b-1')] }),
      owner: 'user-a',
      userId: 'user-b',
      tombstones: ['a-2'],
    });
    assert.deepEqual(plan.replayDeletes, []);
  });

  it("does not leak A's saved foods into B", () => {
    const withSaved = local({
      ...aData,
      savedFoods: [
        { id: 's1', name: 'Skyr', calories: 120, macros: { protein: 20, carbs: 7, fat: 0 }, createdAt: 1 },
      ],
    });
    const plan = run({ local: withSaved, owner: 'user-a', userId: 'user-b' });
    assert.deepEqual(plan.next.savedFoods, []);
    assert.equal(plan.stashData?.savedFoods.length, 1);
  });
});

describe('the guarantee', () => {
  it('never drops a record that has no tombstone', () => {
    // A sweep over the shapes a sync can take: whatever the combination, every
    // id present on either side is present afterwards unless it was deleted.
    const cases: { owner: string | null; userId: string }[] = [
      { owner: null, userId: 'user-a' },
      { owner: 'user-a', userId: 'user-a' },
    ];
    for (const c of cases) {
      const localIds = ['l1', 'l2'];
      const remoteIds = ['r1', 'l2'];
      const plan = run({
        local: local({ entries: localIds.map((id) => entry(id)) }),
        remote: remote({ entries: remoteIds.map((id) => entry(id)) }),
        ...c,
      });
      const got = new Set(plan.next.entries.map((e) => e.id));
      for (const id of [...localIds, ...remoteIds]) {
        assert.equal(got.has(id), true, `${id} lost with owner=${c.owner}`);
      }
    }
  });

  it('nothing is lost on a switch — it is moved, and the move is reported', () => {
    const plan = run({
      local: local({ entries: [entry('a-1')] }),
      owner: 'user-a',
      userId: 'user-b',
    });
    assert.equal(plan.next.entries.length, 0);
    assert.deepEqual(plan.stashData?.entries.map((e) => e.id), ['a-1']);
  });
});
