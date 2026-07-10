import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmbientBackground } from '@/components/ambient-background';
import { Button } from '@/components/button';
import { Appear, Floating, PressableScale } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Shadow, Spacing } from '@/constants/theme';
import { useGradients } from '@/hooks/use-gradients';
import { useTheme } from '@/hooks/use-theme';

const HIGHLIGHTS: { icon: keyof typeof Ionicons.glyphMap; text: string; color: 'protein' | 'streak' | 'success' }[] = [
  { icon: 'camera', text: 'Snap a photo — AI counts the calories', color: 'protein' },
  { icon: 'flame', text: 'Hit your macro goals every day', color: 'streak' },
  { icon: 'trending-up', text: 'Track your weight and progress', color: 'success' },
];

export default function WelcomeScreen() {
  const theme = useTheme();
  const gradients = useGradients();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={styles.flex}>
      <AmbientBackground />
      <View
        style={[
          styles.content,
          { paddingTop: insets.top + Spacing.six, paddingBottom: insets.bottom + Spacing.four },
        ]}>
        <View style={styles.column}>
          <Appear delay={80} style={styles.hero}>
            <Floating amplitude={7}>
              <LinearGradient
                colors={gradients.brand}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.logo, Shadow.glow(theme.tint)]}>
                <Ionicons name="nutrition" size={44} color="#FFFFFF" />
              </LinearGradient>
            </Floating>
            <ThemedText type="title" style={styles.brand}>
              CalorieTrackerAI
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary" style={styles.tagline}>
              Track your nutrition effortlessly. Just take a picture of your food.
            </ThemedText>
          </Appear>

          <View style={styles.highlights}>
            {HIGHLIGHTS.map((h, i) => (
              <Appear key={h.text} delay={200 + i * 90}>
                <View style={[styles.highlight, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, Shadow.card]}>
                  <View style={[styles.hlIcon, { backgroundColor: theme[h.color] + '22' }]}>
                    <Ionicons name={h.icon} size={20} color={theme[h.color]} />
                  </View>
                  <ThemedText type="smallBold" style={styles.hlText}>
                    {h.text}
                  </ThemedText>
                </View>
              </Appear>
            ))}
          </View>
        </View>

        <Appear delay={520} style={styles.footer}>
          <Button title="Get started" icon="arrow-forward" onPress={() => router.push('/onboarding')} />
          <PressableScale
            style={styles.signInRow}
            scaleTo={0.96}
            hoverLift={false}
            onPress={() => router.push('/sign-in')}
            accessibilityRole="button">
            <ThemedText type="small" themeColor="textSecondary">
              Already have an account?{' '}
            </ThemedText>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              Sign in
            </ThemedText>
          </PressableScale>
        </Appear>
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
    width: 92,
    height: 92,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontSize: 32,
    lineHeight: 38,
    textAlign: 'center',
    letterSpacing: -0.5,
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
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hlIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
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
