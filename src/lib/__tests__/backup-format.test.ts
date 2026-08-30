import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildBackup, parseBackup, serializeBackup, toCsv } from '../backup-format.ts';
import type { FoodEntry, Profile } from '../../types/index.ts';

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

const profile: Profile = {
  name: 'Matej',
  goals: { calories: 2100, macros: { protein: 170, carbs: 180, fat: 65 } },
  onboarded: true,
  notificationsEnabled: false,
  units: 'metric',
  theme: 'dark',
};

describe('round trip', () => {
  it('survives serialize → parse with every record intact', () => {
    const entries = [entry('a'), entry('b', { fiber: 7 })];
    const weights = [{ date: '2026-08-01', weightKg: 85.2 }];
    const parsed = parseBackup(serializeBackup({ profile, entries, weights }));

    assert.equal(parsed.ok, true);
    assert.equal(parsed.skipped, 0);
    assert.equal(parsed.backup?.entries.length, 2);
    assert.equal(parsed.backup?.weights.length, 1);
    assert.equal(parsed.backup?.profile.name, 'Matej');
    assert.equal(parsed.backup?.entries[1].fiber, 7);
  });

  it('stamps an export time', () => {
    const b = buildBackup({ profile, entries: [], weights: [] }, new Date('2026-08-29T10:00:00Z'));
    assert.equal(b.exportedAt, '2026-08-29T10:00:00.000Z');
    assert.equal(b.app, 'calai');
  });
});

describe('rejecting bad input', () => {
  it('rejects malformed JSON without throwing', () => {
    const r = parseBackup('{not json');
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /valid JSON/);
  });

  it('rejects JSON that is not a CalAI backup', () => {
    const r = parseBackup('{"some":"other file"}');
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /not a CalAI backup/);
  });

  it('refuses a backup from a future app version rather than guessing', () => {
    const r = parseBackup(JSON.stringify({ app: 'calai', version: 99, entries: [] }));
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /newer version/);
  });
});

describe('partial corruption', () => {
  it('restores the good records and reports the dropped ones', () => {
    // Losing one damaged row is the right trade against refusing the other
    // eight months of history.
    const raw = JSON.stringify({
      app: 'calai',
      version: 1,
      entries: [entry('good'), { id: 'bad', name: 'no calories' }, null],
      weights: [{ date: '2026-08-01', weightKg: 85 }, { date: 'x' }],
    });
    const r = parseBackup(raw);
    assert.equal(r.ok, true);
    assert.equal(r.backup?.entries.length, 1);
    assert.equal(r.backup?.weights.length, 1);
    assert.equal(r.skipped, 3);
  });

  it('tolerates missing arrays entirely', () => {
    const r = parseBackup(JSON.stringify({ app: 'calai', version: 1 }));
    assert.equal(r.ok, true);
    assert.deepEqual(r.backup?.entries, []);
    assert.deepEqual(r.backup?.weights, []);
  });
});

describe('toCsv', () => {
  it('writes quantity-multiplied values, since that is what a row means', () => {
    const csv = toCsv([entry('a', { quantity: 2 })]);
    const [, row] = csv.split('\n');
    assert.match(row, /^2026-08-01,lunch,a,2,1000,60,80,40,,no$/);
  });

  it('escapes commas and quotes in food names', () => {
    const csv = toCsv([entry('x', { name: 'Rice, chicken and "sauce"' })]);
    assert.ok(csv.includes('"Rice, chicken and ""sauce"""'));
  });

  it('leaves fibre blank when unknown rather than writing a misleading 0', () => {
    const csv = toCsv([entry('a')]);
    assert.ok(csv.split('\n')[1].endsWith(',,no'));
  });

  it('sorts chronologically across days', () => {
    const csv = toCsv([
      entry('second', { date: '2026-08-02' }),
      entry('first', { date: '2026-08-01' }),
    ]);
    const rows = csv.split('\n').slice(1);
    assert.ok(rows[0].includes('first'));
    assert.ok(rows[1].includes('second'));
  });

  it('emits a header even with no entries', () => {
    assert.equal(toCsv([]).split('\n').length, 1);
  });
});
