import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const HIGHLIGHTS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'camera', text: 'Snap a photo — AI counts the calories' },
  { icon: 'flame', text: 'Hit your macro goals every day' },
  { icon: 'trending-up', text: 'Track your weight and progress' },
];

export default function WelcomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={styles.flex}>
      <View
        style={[
          styles.content,
          { paddingTop: insets.top + Spacing.six, paddingBottom: insets.bottom + Spacing.four },
        ]}>
        <View style={styles.column}>
          <View style={styles.hero}>
            <View style={[styles.logo, { backgroundColor: theme.tint }]}>
              <Ionicons name="nutrition" size={40} color={theme.onTint} />
            </View>
            <ThemedText type="title" style={styles.brand}>
              CalorieTrackerAI
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary" style={styles.tagline}>
              Track your nutrition effortlessly. Just take a picture of your food.
            </ThemedText>
          </View>

          <View style={styles.highlights}>
            {HIGHLIGHTS.map((h) => (
              <View key={h.text} style={styles.highlight}>
                <View style={[styles.hlIcon, { backgroundColor: theme.backgroundSelected }]}>
                  <Ionicons name={h.icon} size={18} color={theme.tint} />
                </View>
                <ThemedText type="smallBold" style={styles.hlText}>
                  {h.text}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <Button title="Get started" onPress={() => router.push('/onboarding')} />
          <Pressable
            style={styles.signInRow}
            onPress={() => router.push('/sign-in')}
            accessibilityRole="button">
            <ThemedText type="small" themeColor="textSecondary">
              Already have an account?{' '}
            </ThemedText>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              Sign in
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignItems: 'center',
    gap: Spacing.six,
    flex: 1,
    justifyContent: 'center',
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  logo: {
    width: 84,
    height: 84,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontSize: 30,
    lineHeight: 36,
    textAlign: 'center',
  },
  tagline: {
    textAlign: 'center',
    paddingHorizontal: Spacing.four,
  },
  highlights: {
    width: '100%',
    gap: Spacing.three,
  },
  highlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  hlIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hlText: {
    flex: 1,
    fontSize: 15,
  },
  footer: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
