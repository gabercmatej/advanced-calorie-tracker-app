import { useEffect, useId, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface CalorieRingProps {
  /** 0..1 fill fraction. */
  value: number;
  size?: number;
  thickness?: number;
  color?: string;
  /** Two+ color stops for a gradient stroke (overrides `color`). */
  gradient?: readonly string[];
  trackColor?: string;
  /** Centered content (number, label, etc.). */
  children?: ReactNode;
  /** Animate the fill on mount. Set false for tiny static dials. */
  animate?: boolean;
  delay?: number;
  duration?: number;
}

/**
 * A circular progress ring (the signature "calories left" dial). Built on
 * react-native-svg so it renders identically on iOS, Android and web, and
 * springs its fill in on mount via reanimated animated props.
 */
export function CalorieRing({
  value,
  size = 200,
  thickness = 16,
  color,
  gradient,
  trackColor,
  children,
  animate = true,
  delay = 150,
  duration = 1100,
}: CalorieRingProps) {
  const theme = useTheme();
  const gid = 'ring-' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const clamped = Math.max(0, Math.min(1, value));
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const center = size / 2;

  const progress = useSharedValue(animate ? 0 : clamped);
  useEffect(() => {
    progress.value = animate
      ? withDelay(delay, withTiming(clamped, { duration, easing: Easing.out(Easing.cubic) }))
      : withTiming(clamped, { duration: 500 });
  }, [progress, clamped, animate, delay, duration]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const stroke = gradient ? `url(#${gid})` : (color ?? theme.tint);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {gradient ? (
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              {gradient.map((c, i) => (
                <Stop key={i} offset={`${i / (gradient.length - 1)}`} stopColor={c} />
              ))}
            </LinearGradient>
          </Defs>
        ) : null}
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={trackColor ?? theme.backgroundSelected}
          strokeWidth={thickness}
          fill="none"
        />
        <AnimatedCircle
          cx={center}
          cy={center}
          r={r}
          stroke={stroke}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
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
