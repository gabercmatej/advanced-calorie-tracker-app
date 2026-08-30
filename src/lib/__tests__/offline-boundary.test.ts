import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Which parts of the app are allowed to cost money.
 *
 * Quick-logging exists precisely so that re-logging yesterday's chicken does not
 * spend an Anthropic call, and the food library exists so that searching for
 * "oats" does not either. That is a promise about the *module graph*, not about
 * any one function: the day something in this subtree grows an import of
 * `claude.ts`, every one of those interactions silently starts billing, and
 * nothing in the UI would say so.
 *
 * So this walks the imports for real, from each entry point, and fails if the
 * transport is reachable at all.
 */

const LIB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(LIB, '..');

/** Resolve an import specifier to a file inside src/, or null if it is external. */
function resolveImport(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null; // a node_modules package — not ours to police

  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    try {
      readFileSync(candidate, 'utf8');
      return candidate;
    } catch {
      // try the next shape
    }
  }
  return null;
}

/** Every file reachable from `entry` by following imports inside src/. */
function importClosure(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    const source = readFileSync(file, 'utf8');
    const specs = [...source.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s*['"]([^'"]+)['"]/g)].map(
      (m) => m[1],
    );
    for (const spec of specs) {
      const resolved = resolveImport(spec, file);
      if (resolved) queue.push(resolved);
    }
  }
  return seen;
}

const TRANSPORT = join(LIB, 'claude.ts');

describe('the offline path never reaches the model', () => {
  for (const entry of ['quick-log.ts', 'food-library.ts', 'food-facts.ts', 'merge.ts', 'sync.ts', 'weight-input.ts']) {
    it(`${entry} cannot reach claude.ts`, () => {
      const closure = importClosure(join(LIB, entry));
      assert.equal(
        closure.has(TRANSPORT),
        false,
        `${entry} can reach the Anthropic transport — quick logging would start costing money`,
      );
    });
  }

  it('the transport is genuinely detectable by this test', () => {
    // Guards the guard: if `importClosure` silently stopped resolving imports,
    // every assertion above would pass vacuously.
    const closure = importClosure(join(LIB, 'ai.ts'));
    assert.equal(closure.has(TRANSPORT), true, 'ai.ts should reach claude.ts');
  });
});

describe('no Anthropic credential ships in the client', () => {
  it('nothing under src/ reads an Anthropic key from the environment', () => {
    // `EXPO_PUBLIC_*` is inlined into the bundle, so a key read this way is
    // shipped to every user. The key now lives only as a Supabase secret behind
    // the `claude` Edge Function.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, name.name);
        // Skip the tests themselves — this file names the pattern it forbids.
        if (name.name === '__tests__') continue;
        if (name.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name.name)) {
          const text = readFileSync(path, 'utf8');
          if (/EXPO_PUBLIC_ANTHROPIC/.test(text) || /\bsk-ant-[A-Za-z0-9]/.test(text)) {
            offenders.push(path.slice(SRC.length + 1));
          }
        }
      }
    };
    walk(SRC);
    assert.deepEqual(offenders, []);
  });
});
