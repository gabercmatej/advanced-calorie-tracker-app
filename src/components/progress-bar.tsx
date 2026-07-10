import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { type GradientColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ProgressBarProps {
  /** 0..1 */
  value: number;
  color?: string;
  /** Two+ stops for a gradient fill (overrides `color`). */
  gradient?: readonly string[];
  trackColor?: string;
  height?: number;
  /** Animate the fill sweeping in. */
  animate?: boolean;
  delay?: number;
}

/** A rounded horizontal progress bar whose fill smoothly sweeps to `value`. */
export function ProgressBar({
  value,
  color,
  gradient,
  trackColor,
  height = 10,
  animate = true,
  delay = 0,
}: ProgressBarProps) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, value));
  const [trackW, setTrackW] = useState(0);
  const p = useSharedValue(animate ? 0 : clamped);

  useEffect(() => {
    p.value = withDelay(delay, withTiming(clamped, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [p, clamped, delay]);

  const fillStyle = useAnimatedStyle(() => ({ width: trackW * p.value }));

  const stops: GradientColors =
    gradient && gradient.length >= 2
      ? (gradient as GradientColors)
      : [color ?? theme.tint, color ?? theme.tint];

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width)}
      style={[
        styles.track,
        { height, borderRadius: height, backgroundColor: trackColor ?? theme.backgroundSelected },
      ]}>
      <Animated.View style={[styles.fill, { height, borderRadius: height }, fillStyle]}>
        <LinearGradient
          colors={stops}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ width: Math.max(trackW, 1), height }}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    overflow: 'hidden',
  },
});
