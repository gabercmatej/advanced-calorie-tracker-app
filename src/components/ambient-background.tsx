import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useGradients } from '@/hooks/use-gradients';
import { useResolvedScheme } from '@/context/ThemeContext';

/**
 * Soft, off-screen gradient "orbs" that give every screen a subtle, premium
 * background glow. True radial gradients via react-native-svg so they read as
 * light rather than hard-edged circles, on iOS, Android, and web.
 */
export function AmbientBackground() {
  const gradients = useGradients();
  const dark = useResolvedScheme() === 'dark';
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const a = `${uid}a`;
  const b = `${uid}b`;

  const strength = dark ? 0.5 : 0.32;
  const c1 = gradients.brand[0];
  const c2 = gradients.brand[2] ?? gradients.brand[1];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id={a} cx="82%" cy="6%" r="60%">
            <Stop offset="0" stopColor={c1} stopOpacity={strength} />
            <Stop offset="1" stopColor={c1} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={b} cx="6%" cy="34%" r="55%">
            <Stop offset="0" stopColor={c2} stopOpacity={strength * 0.7} />
            <Stop offset="1" stopColor={c2} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${a})`} />
        <Rect width="100%" height="100%" fill={`url(#${b})`} />
      </Svg>
    </View>
  );
}
