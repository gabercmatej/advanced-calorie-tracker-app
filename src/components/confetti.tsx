import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const CONFETTI_COLORS = ['#7C6CFF', '#F5A524', '#4F7DFF', '#FF7A96', '#34D399', '#B15CFF'];

interface PieceSpec {
  startX: number;
  drift: number;
  size: number;
  delay: number;
  duration: number;
  spins: number;
  color: string;
  round: boolean;
}

function Piece({ spec, fall }: { spec: PieceSpec; fall: number }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(spec.delay, withTiming(1, { duration: spec.duration, easing: Easing.out(Easing.quad) }));
  }, [t, spec.delay, spec.duration]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - Math.max(0, (t.value - 0.75) / 0.25),
    transform: [
      { translateX: spec.startX + spec.drift * t.value },
      { translateY: -24 + fall * t.value },
      { rotate: `${spec.spins * 360 * t.value}deg` },
      { scale: 0.6 + 0.4 * Math.sin(t.value * Math.PI) },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.piece,
        {
          width: spec.size,
          height: spec.round ? spec.size : spec.size * 0.55,
          borderRadius: spec.round ? spec.size : 2,
          backgroundColor: spec.color,
        },
        style,
      ]}
    />
  );
}

/**
 * A one-shot confetti burst that rains from the top of the screen. Pure
 * reanimated (no native module) so it runs on iOS, Android, and web. Fires
 * `onDone` after the last piece settles so the parent can unmount it.
 */
export function Confetti({
  count = 90,
  onDone,
}: {
  count?: number;
  onDone?: () => void;
}) {
  const { width, height } = useWindowDimensions();
  // Randomized specs are generated in an effect (kept out of render for purity).
  const [pieces, setPieces] = useState<PieceSpec[]>([]);

  useEffect(() => {
    setPieces(
      Array.from({ length: count }, (_, i) => ({
        startX: (i / count) * width + (Math.random() - 0.5) * 48,
        drift: (Math.random() - 0.5) * width * 0.6,
        size: 8 + Math.random() * 7,
        delay: Math.random() * 260,
        duration: 1500 + Math.random() * 900,
        spins: 1 + Math.random() * 3,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        round: Math.random() > 0.6,
      })),
    );
  }, [count, width]);

  useEffect(() => {
    const id = setTimeout(() => onDone?.(), 2600);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((spec, i) => (
        <Piece key={i} spec={spec} fall={height + 48} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
