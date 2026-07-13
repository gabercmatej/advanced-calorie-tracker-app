import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Confetti } from '@/components/confetti';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useGradients } from '@/hooks/use-gradients';
import { useTheme } from '@/hooks/use-theme';

interface CelebrationProps {
  /** Message shown under the checkmark, e.g. "+320 kcal logged". */
  message: string;
  /** Rain confetti behind the badge (streak milestones). */
  confetti?: boolean;
  /** Called once the animation has finished so the parent can unmount it. */
  onDone: () => void;
}

/**
 * A rewarding full-screen flourish shown after logging: a dimmed backdrop with
 * a springy gradient checkmark badge that pops in and fades out, plus optional
 * confetti for milestones. Pure reanimated so it runs across all platforms.
 */
export function Celebration({ message, confetti, onDone }: CelebrationProps) {
  const theme = useTheme();
  const gradients = useGradients();
  const scale = useSharedValue(0);
  const backdrop = useSharedValue(0);
  const check = useSharedValue(0);

  const hold = confetti ? 900 : 300;

  useEffect(() => {
    backdrop.value = withTiming(1, { duration: 130 });
    check.value = withDelay(160, withSpring(1, { damping: 11, stiffness: 200 }));
    scale.value = withSequence(
      withSpring(1, { damping: 12, stiffness: 190 }),
      withDelay(
        hold,
        withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(onDone)();
        }),
      ),
    );
    backdrop.value = withDelay(hold + 300, withTiming(0, { duration: 220 }));
  }, [backdrop, scale, check, hold, onDone]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value * 0.6 }));
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: scale.value,
    transform: [{ scale: scale.value }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: check.value,
    transform: [{ scale: 0.6 + check.value * 0.4 }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
      {confetti ? <Confetti /> : null}
      <View style={styles.center}>
        <Animated.View style={[badgeStyle, styles.badgeWrap]}>
          <LinearGradient
            colors={gradients.brand}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.badge}>
            <Animated.View style={checkStyle}>
              <Ionicons name="checkmark-circle" size={56} color={theme.onTint} />
            </Animated.View>
            <ThemedText type="smallBold" style={[styles.message, { color: theme.onTint }]}>
              {message}
            </ThemedText>
          </LinearGradient>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: '#000',
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeWrap: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.five,
    borderRadius: Radius.xl,
    minWidth: 190,
  },
  message: {
    textAlign: 'center',
  },
});
