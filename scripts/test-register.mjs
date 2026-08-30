/** Registers the `@/*` alias resolver for the test run. See test-alias-hooks.mjs. */
import { register } from 'node:module';
register('./test-alias-hooks.mjs', import.meta.url);
