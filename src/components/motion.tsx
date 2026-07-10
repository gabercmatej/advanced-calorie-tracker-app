/**
 * Motion primitives shared across the app.
 *
 * - `Appear`        — fade + spring-slide entrance (stagger with `delay`).
 * - `PressableScale`— presses spring the child down, hover lifts it (web).
 * - `CountUp`       — a number that eases from 0 → value on mount / change.
 * - `Floating`      — a gentle infinite bob for hero/decorative elements.
 *
 * Everything is driven by reanimated shared values or requestAnimationFrame so
 * it behaves identically on iOS, Android, and web.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type WithSpringConfig,
} from 'react-native-reanimated';

import { ThemedText, type ThemedTextProps } from '@/components/themed-text';

const ENTER_SPRING: WithSpringConfig = { damping: 18, stiffness: 150, mass: 0.7 };
const PRESS_SPRING: WithSpringConfig = { damping: 16, stiffness: 340, mass: 0.5 };

/** Fade + slide-up entrance. Give siblings increasing `delay` for a stagger. */
export function Appear({
  children,
  delay = 0,
  distance = 16,
  style,
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withSpring(1, ENTER_SPRING));
  }, [p, delay]);

  const animated = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * distance }],
  }));

  return <Animated.View style={[animated, style]}>{children}</Animated.View>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** How far to scale down on press (0.96 = subtle, 0.9 = punchy). */
  scaleTo?: number;
  /** Lift the element a few px on hover (web / trackpad). */
  hoverLift?: boolean;
}

/** A Pressable that springs down on press and lifts on hover. */
export function PressableScale({
  children,
  style,
  scaleTo = 0.96,
  hoverLift = true,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  ...props
}: PressableScaleProps) {
  const pressed = useSharedValue(0);
  const hover = useSharedValue(0);

  const animated = useAnimatedStyle(() => ({
    transform: [
      { scale: withSpring(1 - pressed.value * (1 - scaleTo) - hover.value * -0.01, PRESS_SPRING) },
      { translateY: withSpring(hover.value * -4, PRESS_SPRING) },
    ],
  }));

  return (
    <AnimatedPressable
      style={[animated, style]}
      onPressIn={(e) => {
        pressed.value = 1;
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = 0;
        onPressOut?.(e);
      }}
      onHoverIn={(e) => {
        if (hoverLift) hover.value = 1;
        onHoverIn?.(e);
      }}
      onHoverOut={(e) => {
        hover.value = 0;
        onHoverOut?.(e);
      }}
      {...props}>
      {children as any}
    </AnimatedPressable>
  );
}

/** A gentle, infinite vertical bob — for hero icons and floating chips. */
export function Floating({
  children,
  amplitude = 6,
  duration = 2600,
  delay = 0,
  style,
}: {
  children: ReactNode;
  amplitude?: number;
  duration?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration }), withTiming(0, { duration })), -1, false),
    );
  }, [t, duration, delay]);

  // t sweeps 0→1→0 forever; map it to a symmetric vertical bob.
  const bob = useAnimatedStyle(() => ({ transform: [{ translateY: (t.value - 0.5) * amplitude * 2 }] }));

  return <Animated.View style={[bob, style]}>{children}</Animated.View>;
}

interface CountUpProps extends Omit<ThemedTextProps, 'children'> {
  value: number;
  duration?: number;
  delay?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

/**
 * Eases a number from its previous displayed value to `value` (from 0 on first
 * mount) using an ease-out cubic. rAF-driven so it runs on web too.
 */
export function CountUp({
  value,
  duration = 1000,
  delay = 0,
  decimals = 0,
  prefix = '',
  suffix = '',
  ...textProps
}: CountUpProps) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    let startTime: number | null = null;

    const step = (now: number) => {
      if (startTime == null) startTime = now;
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
      }
    };

    timerRef.current = setTimeout(() => {
      rafRef.current = requestAnimationFrame(step);
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration, delay]);

  const shown = decimals > 0 ? display.toFixed(decimals) : String(Math.round(display));
  return (
    <ThemedText {...textProps}>
      {prefix}
      {shown}
      {suffix}
    </ThemedText>
  );
}
