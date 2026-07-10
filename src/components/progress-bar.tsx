import { StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ProgressBarProps {
  /** 0..1 */
  value: number;
  color?: string;
  trackColor?: string;
  height?: number;
}

/** A simple rounded horizontal progress bar (no dependencies). */
export function ProgressBar({ value, color, trackColor, height = 8 }: ProgressBarProps) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, value));

  return (
    <View
      style={[
        styles.track,
        { height, borderRadius: height, backgroundColor: trackColor ?? theme.backgroundSelected },
      ]}>
      <View
        style={{
          width: `${clamped * 100}%`,
          height,
          borderRadius: height,
          backgroundColor: color ?? theme.tint,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
});
