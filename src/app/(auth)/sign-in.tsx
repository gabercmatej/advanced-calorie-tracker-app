import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/use-theme';

export default function SignInScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signInWithGoogle, signInWithEmail, usesSupabase } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validEmail = /.+@.+\..+/.test(email.trim());
  // With a real backend a password is required; local mock mode ignores it.
  const canSubmit = validEmail && (!usesSupabase || password.length >= 6);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    const err = await signInWithEmail(email.trim(), password);
    setBusy(false);
    if (err) setError(err);
    // On success the auth state flips and the router swaps to the app.
  }

  async function onGoogle() {
    const err = await signInWithGoogle();
    if (err) setError(err);
  }

  return (
    <ThemedView style={styles.flex}>
      <View style={[styles.content, { paddingTop: insets.top + Spacing.two }]}>
        <View style={styles.column}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
            <Ionicons name="chevron-back" size={26} color={theme.text} />
          </Pressable>

          <View style={styles.heading}>
            <ThemedText type="title" style={styles.title}>
              Welcome back
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              Sign in to pick up where you left off.
            </ThemedText>
          </View>

          {!usesSupabase && (
            <>
              <GoogleButton onPress={onGoogle} />
              <View style={styles.divider}>
                <View style={[styles.line, { backgroundColor: theme.border }]} />
                <ThemedText type="small" themeColor="textSecondary">
                  or
                </ThemedText>
                <View style={[styles.line, { backgroundColor: theme.border }]} />
              </View>
            </>
          )}

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          {usesSupabase && (
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
            />
          )}
          {error && (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          )}
          <Button title="Continue" disabled={!canSubmit} loading={busy} onPress={onSubmit} />
        </View>
      </View>
    </ThemedView>
  );
}

/** Reusable "Continue with Google" button (shared shape with onboarding). */
export function GoogleButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.google,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
      ]}>
      <Ionicons name="logo-google" size={20} color={theme.text} />
      <ThemedText type="smallBold" style={styles.googleText}>
        Continue with Google
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.four,
  },
  back: {
    alignSelf: 'flex-start',
  },
  heading: {
    gap: Spacing.two,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
  },
  google: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  googleText: {
    fontSize: 15,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
});
