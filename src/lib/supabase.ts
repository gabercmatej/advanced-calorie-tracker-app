import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

/**
 * Supabase client. Credentials come from the environment so nothing secret is
 * hard-coded:
 *
 *   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
 *
 * The publishable/anon key is safe to ship in the client — row-level security
 * (see supabase/schema.sql) is what actually protects each user's data.
 *
 * A `sb_secret_...` key is NOT: it bypasses RLS entirely and must never be
 * given an EXPO_PUBLIC_ name. The guard below refuses to start with one rather
 * than silently shipping it inside the bundle.
 *
 * When the vars are absent the app runs in local-only mode (AsyncStorage,
 * mock auth) so it still works before the backend is wired up. Call sites
 * branch on `isSupabaseConfigured`.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

// A secret key here would be compiled into every build. Fail loudly and run
// local-only rather than ship it.
if (anonKey?.startsWith('sb_secret')) {
  console.error(
    '[supabase] EXPO_PUBLIC_SUPABASE_ANON_KEY holds a secret key. Use the ' +
      'publishable (sb_publishable_...) key instead and rotate this one. ' +
      'Cloud sync is disabled until it is fixed.',
  );
}

const usableKey = anonKey && !anonKey.startsWith('sb_secret') ? anonKey : undefined;

export const isSupabaseConfigured = Boolean(url && usableKey);

/**
 * `web` output is `static`, so Expo pre-renders every route in Node at export
 * time. There is no `window` there, and AsyncStorage's web build reaches for it
 * as soon as the auth client restores a session — which crashed the export the
 * moment real credentials made this client construct. During prerender we build
 * a stateless client instead: no storage, no session restore, no refresh timer.
 * Nothing renders user data at that point anyway, and the browser gets a fully
 * persistent client on hydration.
 */
const isPrerender = typeof window === 'undefined';

// A single client instance, or null in local-only mode.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, usableKey!, {
      auth: isPrerender
        ? { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        : {
            // Persist the session so users stay signed in across launches.
            storage: AsyncStorage,
            autoRefreshToken: true,
            persistSession: true,
            // URL-based session detection is a web-only OAuth concern; off for RN.
            detectSessionInUrl: Platform.OS === 'web',
          },
    })
  : null;
