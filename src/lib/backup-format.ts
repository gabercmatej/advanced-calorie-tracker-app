import type { FoodEntry, Profile, SavedFood, WeightEntry } from '@/types';

/**
 * The on-disk backup format, and the pure functions that build and validate it.
 *
 * Kept free of any React Native or filesystem import so it can be unit-tested
 * directly — `backup.ts` is the thin I/O shell that wraps it.
 *
 * A backup is the whole diary in one self-describing JSON file. It exists so
 * that a lost phone, a wiped app container, or a Supabase project that vanished
 * is an inconvenience rather than the end of an eight-month log. Restoring one
 * *merges* rather than replaces, so importing an old backup can only ever add
 * history back — never remove what is already there.
 */

/** Bumped only for a breaking change; `parseBackup` accepts anything ≤ this. */
export const BACKUP_VERSION = 1;

export interface BackupFile {
  /** Distinguishes a CalAI backup from any other JSON the picker returns. */
  app: 'calai';
  version: number;
  /** ISO timestamp of the export, shown to the user when restoring. */
  exportedAt: string;
  profile: Profile;
  entries: FoodEntry[];
  weights: WeightEntry[];
  /** Pinned quick-log foods (see lib/quick-log.ts). */
  savedFoods?: SavedFood[];
}

export interface BackupInput {
  profile: Profile;
  entries: FoodEntry[];
  weights: WeightEntry[];
  savedFoods?: SavedFood[];
}

/** Assemble a backup object from current app state. */
export function buildBackup(input: BackupInput, now: Date = new Date()): BackupFile {
  return {
    app: 'calai',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    profile: input.profile,
    entries: input.entries,
    weights: input.weights,
    savedFoods: input.savedFoods ?? [],
  };
}

/** Pretty-printed so the file stays readable and diffable outside the app. */
export function serializeBackup(input: BackupInput, now?: Date): string {
  return JSON.stringify(buildBackup(input, now), null, 2);
}

/** A filename that sorts chronologically: `calai-backup-2026-08-29.json`. */
export function backupFilename(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `calai-backup-${y}-${m}-${d}.json`;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Whether a value is shaped enough like a FoodEntry to be worth restoring. */
function isEntry(v: unknown): v is FoodEntry {
  if (!isObject(v)) return false;
  return (
    typeof v.id === 'string' &&
    typeof v.date === 'string' &&
    typeof v.name === 'string' &&
    typeof v.calories === 'number' &&
    Number.isFinite(v.calories) &&
    isObject(v.macros)
  );
}

function isSavedFood(v: unknown): v is SavedFood {
  if (!isObject(v)) return false;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.calories === 'number' &&
    Number.isFinite(v.calories) &&
    isObject(v.macros)
  );
}

function isWeight(v: unknown): v is WeightEntry {
  if (!isObject(v)) return false;
  return (
    typeof v.date === 'string' && typeof v.weightKg === 'number' && Number.isFinite(v.weightKg)
  );
}

export interface ParseResult {
  ok: boolean;
  /** Present when `ok`. */
  backup?: BackupFile;
  /** Present when not `ok` — safe to show to the user verbatim. */
  error?: string;
  /** Records dropped for being malformed. Non-fatal, but worth reporting. */
  skipped: number;
}

/**
 * Parse and validate a backup file.
 *
 * Deliberately lenient about individual records and strict about the envelope:
 * a file that isn't a CalAI backup is rejected outright, but one good file with
 * a few corrupt rows restores everything else and reports what it dropped.
 * Refusing the whole import over one bad row would be the wrong trade when the
 * alternative is losing the other eight months.
 */
export function parseBackup(json: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.', skipped: 0 };
  }

  if (!isObject(raw) || raw.app !== 'calai') {
    return { ok: false, error: 'That file is not a CalAI backup.', skipped: 0 };
  }

  const version = typeof raw.version === 'number' ? raw.version : 0;
  if (version > BACKUP_VERSION) {
    return {
      ok: false,
      error: 'That backup was made by a newer version of CalAI. Update the app first.',
      skipped: 0,
    };
  }

  const rawEntries = Array.isArray(raw.entries) ? raw.entries : [];
  const rawWeights = Array.isArray(raw.weights) ? raw.weights : [];
  const entries = rawEntries.filter(isEntry);
  const weights = rawWeights.filter(isWeight);
  const skipped = rawEntries.length - entries.length + (rawWeights.length - weights.length);

  return {
    ok: true,
    skipped,
    backup: {
      app: 'calai',
      version,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
      profile: raw.profile as Profile,
      entries,
      weights,
      savedFoods: Array.isArray(raw.savedFoods) ? raw.savedFoods.filter(isSavedFood) : [],
    },
  };
}

/**
 * Flatten the diary into CSV rows, one per logged food.
 *
 * The JSON backup is what restores the app; this is for looking at the data
 * somewhere else — a spreadsheet, a chart, a coach. Values are the *effective*
 * ones (already multiplied by quantity), because that is what a spreadsheet
 * reader expects a row to mean.
 */
export function toCsv(entries: FoodEntry[]): string {
  const header = 'date,meal,name,quantity,calories,protein_g,carbs_g,fat_g,fiber_g,ai_estimated';
  const escape = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const round = (n: number) => Math.round(n * 10) / 10;

  const rows = [...entries]
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1))
    .map((e) => {
      const q = e.quantity ?? 1;
      return [
        e.date,
        e.meal,
        escape(e.name),
        round(q),
        Math.round(e.calories * q),
        round(e.macros.protein * q),
        round(e.macros.carbs * q),
        round(e.macros.fat * q),
        e.fiber == null ? '' : round(e.fiber * q),
        e.aiEstimated ? 'yes' : 'no',
      ].join(',');
    });

  return [header, ...rows].join('\n');
}
