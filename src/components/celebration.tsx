import { Ionicons } from '@expo/vector-icons';
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

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface CelebrationProps {
  /** Message shown under the checkmark, e.g. "+320 kcal logged". */
  message: string;
  /** Called once the animation has finished so the parent can unmount it. */
  onDone: () => void;
}

/**
 * A rewarding full-screen flourish shown after logging a meal: a dimmed
 * backdrop with a springy checkmark badge that pops in and fades out. Pure
 * reanimated so it runs on the UI thread across all platforms.
 */
export function Celebration({ message, onDone }: CelebrationProps) {
  const theme = useTheme();
  const scale = useSharedValue(0);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    backdrop.value = withTiming(1, { duration: 130 });
    scale.value = withSequence(
      withSpring(1, { damping: 12, stiffness: 190 }),
      withDelay(
        300,
        withTiming(0, { duration: 190, easing: Easing.in(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(onDone)();
        }),
      ),
    );
    backdrop.value = withDelay(560, withTiming(0, { duration: 190 }));
  }, [backdrop, scale, onDone]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value * 0.55 }));
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: scale.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
      <View style={styles.center}>
        <Animated.View style={[styles.badge, { backgroundColor: theme.tint }, badgeStyle]}>
          <Ionicons name="checkmark" size={56} color={theme.onTint} />
          <ThemedText type="smallBold" style={[styles.message, { color: theme.onTint }]}>
            {message}
          </ThemedText>
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
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.five,
    borderRadius: Radius.lg,
    minWidth: 180,
  },
  message: {
    textAlign: 'center',
  },
});
