import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Appear, Floating, PressableScale } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Shadow, Spacing } from '@/constants/theme';
import { useGradients } from '@/hooks/use-gradients';
import { useTheme } from '@/hooks/use-theme';

const HIGHLIGHTS: { icon: keyof typeof Ionicons.glyphMap; title: string; desc: string }[] = [
  {
    icon: 'camera',
    title: 'Snap a photo',
    desc: 'AI instantly identifies and counts the calories.',
  },
  {
    icon: 'locate',
    title: 'Hit your macro goals',
    desc: 'Personalized targets for every single day.',
  },
  {
    icon: 'stats-chart',
    title: 'Track your progress',
    desc: 'Watch your weight and health trends evolve.',
  },
];

export default function WelcomeScreen() {
  const theme = useTheme();
  const gradients = useGradients();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.five, paddingBottom: insets.bottom + Spacing.four },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <Appear delay={80} style={styles.hero}>
            <Floating amplitude={7}>
              <LinearGradient
                colors={gradients.brand}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logo}>
                <Ionicons name="nutrition" size={44} color={theme.onTint} />
              </LinearGradient>
            </Floating>
            <ThemedText type="title" numberOfLines={1} adjustsFontSizeToFit style={styles.brand}>
              CalorieTracker AI
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary" style={styles.tagline}>
              Track your nutrition effortlessly. Just take a picture of your food.
            </ThemedText>
          </Appear>

          {/* Hero photo — a meal being "scanned" by the AI */}
          <Appear delay={200}>
            <View style={[styles.photoCard, Shadow.raised]}>
              <Image
                source={require('../../../assets/images/welcome-hero.jpg')}
                style={styles.photo}
                contentFit="cover"
              />
              <View style={styles.photoDim} />

              {/* Green scan brackets over the plate */}
              <View pointerEvents="none" style={styles.scanFrame}>
                <View style={[styles.corner, styles.cornerTL, { borderColor: theme.tint }]} />
                <View style={[styles.corner, styles.cornerTR, { borderColor: theme.tint }]} />
                <View style={[styles.corner, styles.cornerBL, { borderColor: theme.tint }]} />
                <View style={[styles.corner, styles.cornerBR, { borderColor: theme.tint }]} />
              </View>

              <View style={styles.processing}>
                <View style={styles.processingDot} />
                <ThemedText type="smallBold" style={styles.processingText}>
                  AI PROCESSING...
                </ThemedText>
              </View>
            </View>
          </Appear>

          <View style={styles.highlights}>
            {HIGHLIGHTS.map((h, i) => (
              <Appear key={h.title} delay={300 + i * 90}>
                <View style={[styles.highlight, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <View style={[styles.hlIcon, { backgroundColor: theme.backgroundSelected }]}>
                    <Ionicons name={h.icon} size={20} color={theme.text} />
                  </View>
                  <View style={styles.hlText}>
                    <ThemedText type="smallBold" style={styles.hlTitle}>
                      {h.title}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {h.desc}
                    </ThemedText>
                  </View>
                </View>
              </Appear>
            ))}
          </View>

          <Appear delay={600} style={styles.footer}>
            <Button title="Get started" icon="arrow-forward" pill onPress={() => router.push('/onboarding')} />
            <PressableScale
              style={styles.signInRow}
              scaleTo={0.96}
              hoverLift={false}
              onPress={() => router.push('/sign-in')}
              accessibilityRole="button">
              <ThemedText type="small" themeColor="textSecondary">
                Already have an account?{' '}
              </ThemedText>
              <ThemedText type="smallBold">Sign in</ThemedText>
            </PressableScale>
          </Appear>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.four,
    flexGrow: 1,
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
    fontWeight: '800',
  },
  tagline: {
    textAlign: 'center',
    paddingHorizontal: Spacing.four,
  },
  photoCard: {
    height: 230,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  photoDim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,10,9,0.45)',
  },
  scanFrame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: Spacing.five,
  },
  corner: {
    position: 'absolute',
    width: 26,
    height: 26,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
    borderTopLeftRadius: Radius.sm,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 2.5,
    borderRightWidth: 2.5,
    borderTopRightRadius: Radius.sm,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
    borderBottomLeftRadius: Radius.sm,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 2.5,
    borderRightWidth: 2.5,
    borderBottomRightRadius: Radius.sm,
  },
  processing: {
    position: 'absolute',
    top: Spacing.three,
    left: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(5,7,6,0.72)',
  },
  processingDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: '#C9E64A',
  },
  processingText: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
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
    gap: 1,
  },
  hlTitle: {
    fontSize: 15,
  },
  footer: {
    width: '100%',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
