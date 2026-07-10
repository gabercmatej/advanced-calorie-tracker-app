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
 * The anon key is safe to ship in the client — row-level security (see
 * supabase/schema.sql) is what actually protects each user's data.
 *
 * When the vars are absent the app runs in local-only mode (AsyncStorage,
 * mock auth) so it still works before the backend is wired up. Call sites
 * branch on `isSupabaseConfigured`.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && anonKey);

/** Private bucket that holds compressed meal photos. */
export const PHOTO_BUCKET = 'meal-photos';

// A single client instance, or null in local-only mode.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        // Persist the session so users stay signed in across launches.
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // URL-based session detection is a web-only OAuth concern; off for RN.
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : null;
