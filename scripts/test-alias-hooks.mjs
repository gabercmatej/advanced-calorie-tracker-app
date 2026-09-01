/**
 * Resolve the project's `@/*` path alias for `node --test`.
 *
 * The app is bundled by Metro, which understands the alias from tsconfig.
 * Node does not, so a test that loads a module with a runtime `@/` import would
 * fail to resolve it. This hook maps `@/x` onto `<root>/src/x`, trying the file
 * itself and then an `index` inside it, exactly as a bundler would.
 *
 * Test-only. Nothing in the app depends on it, and it changes no behaviour —
 * it only teaches the test runner where the source files live.
 */
import { statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = new URL('../src/', import.meta.url);
const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs'];

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('@/')) return nextResolve(specifier, context);

  const base = new URL(specifier.slice(2), SRC);
  const candidates = [
    base,
    ...EXTENSIONS.map((ext) => new URL(`${specifier.slice(2)}${ext}`, SRC)),
    ...EXTENSIONS.map((ext) => new URL(`${specifier.slice(2)}/index${ext}`, SRC)),
  ];

  for (const candidate of candidates) {
    const path = fileURLToPath(candidate);
    // Files only. A bare `@/types` names a directory that exists, and returning
    // it would resolve to the folder rather than falling through to its
    // `index.ts` — which Node then rejects as an unsupported directory import.
    try {
      if (statSync(path).isFile()) return nextResolve(pathToFileURL(path).href, context);
    } catch {
      // Not there — try the next shape.
    }
  }

  return nextResolve(specifier, context);
}
