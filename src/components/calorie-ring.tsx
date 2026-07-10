import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

interface CalorieRingProps {
  /** 0..1 fill fraction. */
  value: number;
  size?: number;
  thickness?: number;
  color?: string;
  trackColor?: string;
  /** Centered content (number, label, etc.). */
  children?: ReactNode;
}

/**
 * A circular progress ring (the signature "calories left" dial). Built on
 * react-native-svg so it renders identically on iOS, Android and web.
 */
export function CalorieRing({
  value,
  size = 200,
  thickness = 16,
  color,
  trackColor,
  children,
}: CalorieRingProps) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, value));
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped);
  const center = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={trackColor ?? theme.backgroundSelected}
          strokeWidth={thickness}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={color ?? theme.tint}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          // Start at 12 o'clock and fill clockwise.
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      {children ? <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
