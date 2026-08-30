import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import * as Linking from 'expo-linking';

import { StorageKeys, storage } from '@/lib/storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Session } from '@/types';

/** Where a confirmation link should land: back inside the app. */
function verifyRedirectUrl(): string {
  return Linking.createURL('/verified');
}

/**
 * Auth. When Supabase is configured (EXPO_PUBLIC_SUPABASE_* set) this uses real
 * email/password accounts and exposes the user id that scopes their cloud data.
 * Otherwise it falls back to a local mock session so the app still runs before
 * the backend is wired up.
 *
 * `signIn*` resolve to an error message string, or null on success.
 */

/**
 * What happened when an account was created.
 *
 * Sign-up has three outcomes, not two, and collapsing them into "error string
 * or null" is what broke onboarding: with email confirmation on, Supabase
 * *succeeds* but hands back no session, and the caller read that as a failure
 * and threw away the plan it was about to save. `needs-verification` is a
 * success — the account exists — it simply cannot sign in yet.
 */
export type SignUpResult =
  | { status: 'signed-in' }
  | { status: 'needs-verification' }
  | { status: 'error'; message: string };

interface AuthContextValue {
  ready: boolean;
  session: Session | null;
  /** Supabase user id when signed in via Supabase; null in local/mock mode. */
  userId: string | null;
  /** True when a real Supabase backend is driving auth. */
  usesSupabase: boolean;
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
  signUpWithEmail: (name: string, email: string, password: string) => Promise<SignUpResult>;
  signInWithGoogle: () => Promise<string | null>;
  /** Re-send the confirmation mail for an address that hasn't verified yet. */
  resendVerification: (email: string) => Promise<string | null>;
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

  // --- Confirmation deep links ---------------------------------------------
  //
  // Tapping the link in the confirmation mail reopens the app at
  // `calai://verified#access_token=...` (or `?code=...` for PKCE). Supabase's
  // client does not read that on React Native — `detectSessionInUrl` is a
  // browser-only path — so the tokens are handed over explicitly here, which
  // turns "verify, then come back and sign in again" into simply landing in the
  // app. It is strictly an accelerator: when the link opens a browser instead,
  // or the redirect URL is not allow-listed in the dashboard, nothing here runs
  // and the polling fallback in onboarding still gets the user in.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const sb = supabase;

    async function consume(url: string | null) {
      if (!url) return;
      try {
        const { queryParams } = Linking.parse(url);
        const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
        const hashParams = new URLSearchParams(hash);

        const accessToken = hashParams.get('access_token') ?? queryParams?.access_token;
        const refreshToken = hashParams.get('refresh_token') ?? queryParams?.refresh_token;
        if (typeof accessToken === 'string' && typeof refreshToken === 'string') {
          await sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          return;
        }
        const code = queryParams?.code;
        if (typeof code === 'string') await sb.auth.exchangeCodeForSession(code);
      } catch (err) {
        // A malformed or already-used link is not worth an error screen: the
        // user can still sign in normally, which is where they already are.
        console.warn('[auth] could not use confirmation link', err);
      }
    }

    Linking.getInitialURL().then(consume);
    const sub = Linking.addEventListener('url', ({ url }) => consume(url));
    return () => sub.remove();
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
    async (name: string, email: string, password: string): Promise<SignUpResult> => {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { name: name.trim() || nameFromEmail(email.trim()) },
            // Where the confirmation link sends the user. `calai://` reopens the
            // app directly; the address must also be listed under Authentication
            // → URL Configuration → Redirect URLs or Supabase ignores it and
            // falls back to the site URL, which is why the app never *depends*
            // on this working — see the polling fallback in onboarding.
            emailRedirectTo: verifyRedirectUrl(),
          },
        });
        if (error) return { status: 'error', message: error.message };
        // Confirmation enabled: the account exists but cannot sign in yet.
        if (!data.session) return { status: 'needs-verification' };
        return { status: 'signed-in' };
      }
      setSession({
        name: name.trim() || nameFromEmail(email.trim()),
        email: email.trim(),
        provider: 'email',
      });
      return { status: 'signed-in' };
    },
    [],
  );

  const resendVerification = useCallback(async (email: string) => {
    if (!isSupabaseConfigured || !supabase) return null;
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: verifyRedirectUrl() },
    });
    return error ? error.message : null;
  }, []);

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
      resendVerification,
      signOut,
    }),
    [
      ready,
      session,
      userId,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      resendVerification,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
