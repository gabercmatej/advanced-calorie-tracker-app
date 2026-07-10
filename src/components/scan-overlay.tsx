import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useGradients } from '@/hooks/use-gradients';

/**
 * An "AI is analyzing your food" flourish laid over the photo while an estimate
 * is being fetched: a scanning beam sweeps top→bottom, a corner reticle pulses,
 * and a glassy label reads out the status. Pure reanimated, cross-platform.
 */
export function ScanOverlay({ height = 250 }: { height?: number }) {
  const gradients = useGradients();
  const sweep = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    sweep.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }), -1, false);
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), -1, false);
  }, [sweep, pulse]);

  const beamStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sweep.value * (height - 4) }],
    opacity: 0.35 + Math.sin(sweep.value * Math.PI) * 0.65,
  }));
  const reticleStyle = useAnimatedStyle(() => ({ opacity: 0.5 + pulse.value * 0.5 }));

  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap]} pointerEvents="none">
      <View style={styles.tint} />

      {/* Sweeping scan beam */}
      <Animated.View style={[styles.beamWrap, beamStyle]}>
        <LinearGradient
          colors={['transparent', gradients.brand[0], gradients.brand[2] ?? gradients.brand[1], 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.beam}
        />
      </Animated.View>

      {/* Pulsing corner reticles */}
      <Animated.View style={[styles.corner, styles.tl, reticleStyle]} />
      <Animated.View style={[styles.corner, styles.tr, reticleStyle]} />
      <Animated.View style={[styles.corner, styles.bl, reticleStyle]} />
      <Animated.View style={[styles.corner, styles.br, reticleStyle]} />

      {/* Status label */}
      <View style={styles.labelWrap}>
        <View style={styles.label}>
          <Ionicons name="sparkles" size={14} color="#FFFFFF" />
          <ThemedText type="smallBold" style={styles.labelText}>
            Analyzing with AI…
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const CORNER = 22;
const styles = StyleSheet.create({
  wrap: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  tint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,10,20,0.35)',
  },
  beamWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 4,
  },
  beam: {
    height: 3,
    width: '100%',
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: '#FFFFFF',
  },
  tl: { top: 12, left: 12, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  tr: { top: 12, right: 12, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  bl: { bottom: 12, left: 12, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  br: { bottom: 12, right: 12, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  labelWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(20,22,40,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  labelText: {
    color: '#FFFFFF',
  },
});
