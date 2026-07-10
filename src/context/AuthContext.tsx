import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { StorageKeys, storage } from '@/lib/storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Session } from '@/types';

/**
 * Auth. When Supabase is configured (EXPO_PUBLIC_SUPABASE_* set) this uses real
 * email/password accounts and exposes the user id that scopes their cloud data.
 * Otherwise it falls back to a local mock session so the app still runs before
 * the backend is wired up.
 *
 * `signIn*`/`signUp*` resolve to an error message string, or null on success.
 */
interface AuthContextValue {
  ready: boolean;
  session: Session | null;
  /** Supabase user id when signed in via Supabase; null in local/mock mode. */
  userId: string | null;
  /** True when a real Supabase backend is driving auth. */
  usesSupabase: boolean;
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
  signUpWithEmail: (name: string, email: string, password: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function nameFromEmail(email: string): string {
  return email.split('@')[0] || 'You';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // --- Supabase-backed auth ---
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const sb = supabase;

    function apply(sbSession: Awaited<ReturnType<typeof sb.auth.getSession>>['data']['session']) {
      const user = sbSession?.user ?? null;
      if (user) {
        setUserId(user.id);
        setSession({
          name: (user.user_metadata?.name as string) || nameFromEmail(user.email ?? ''),
          email: user.email ?? '',
          provider: 'email',
        });
      } else {
        setUserId(null);
        setSession(null);
      }
    }

    sb.auth.getSession().then(({ data }) => {
      apply(data.session);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, sbSession) => apply(sbSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  // --- Local mock auth (no backend configured) ---
  useEffect(() => {
    if (isSupabaseConfigured) return;
    (async () => {
      const saved = await storage.get<Session>(StorageKeys.session);
      if (saved) setSession(saved);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured || !ready) return;
    if (session) storage.set(StorageKeys.session, session);
    else storage.remove(StorageKeys.session);
  }, [session, ready]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      return error ? error.message : null;
    }
    setSession({ name: nameFromEmail(email.trim()), email: email.trim(), provider: 'email' });
    return null;
  }, []);

  const signUpWithEmail = useCallback(
    async (name: string, email: string, password: string) => {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim() || nameFromEmail(email.trim()) } },
        });
        if (error) return error.message;
        // With email confirmation enabled there is no session yet.
        if (!data.session) return 'Check your email to confirm your account, then sign in.';
        return null;
      }
      setSession({
        name: name.trim() || nameFromEmail(email.trim()),
        email: email.trim(),
        provider: 'email',
      });
      return null;
    },
    [],
  );

  const signInWithGoogle = useCallback(async () => {
    if (isSupabaseConfigured) {
      // Email/password is the configured method; Google OAuth isn't set up.
      return 'Google sign-in is not enabled. Use your email and password.';
    }
    setSession({ name: 'CalAI User', email: 'you@gmail.com', provider: 'google' });
    return null;
  }, []);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
      return;
    }
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      session,
      userId,
      usesSupabase: isSupabaseConfigured,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signOut,
    }),
    [ready, session, userId, signInWithEmail, signUpWithEmail, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
