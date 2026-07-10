import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A shimmering placeholder block. A soft highlight sweeps across a muted base
 * so lists/cards feel like they're loading rather than blank.
 */
export function Skeleton({ width = '100%', height = 16, radius = Radius.sm, style }: SkeletonProps) {
  const theme = useTheme();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1150 }), -1, false);
  }, [shimmer]);

  const highlight = useAnimatedStyle(() => ({
    opacity: 0.35 + Math.sin(shimmer.value * Math.PI) * 0.35,
  }));

  return (
    <View
      style={[
        { width, height, borderRadius: radius, backgroundColor: theme.backgroundSelected, overflow: 'hidden' },
        style,
      ]}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.border }, highlight]}
      />
    </View>
  );
}

/** A ready-made "analyzing a meal" skeleton card body. */
export function FoodEstimateSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton height={22} width="55%" radius={Radius.sm} />
      <View style={styles.row}>
        <Skeleton height={64} width={64} radius={Radius.md} />
        <View style={styles.rowText}>
          <Skeleton height={16} width="80%" />
          <Skeleton height={14} width="60%" />
          <Skeleton height={14} width="45%" />
        </View>
      </View>
      <Skeleton height={48} radius={Radius.md} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16 },
  row: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  rowText: { flex: 1, gap: 10 },
});
