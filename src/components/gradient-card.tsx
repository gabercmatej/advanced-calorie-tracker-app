import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { Radius, Shadow, Spacing, type GradientColors } from '@/constants/theme';
import { useGradients } from '@/hooks/use-gradients';
import { useTheme } from '@/hooks/use-theme';

interface GradientCardProps extends ViewProps {
  /** `surface` = standard card, `raised` = a touch more lift, `brand` = hero. */
  variant?: 'surface' | 'raised' | 'brand';
  /** Override the gradient stops (e.g. a macro-colored hero). */
  colors?: readonly [string, string, ...string[]];
  /** Drop the inner padding (e.g. for full-bleed imagery). */
  flush?: boolean;
  /** Cast a soft colored glow (used on brand cards). */
  glow?: string;
  /** Corner radius override. Defaults to 20 (28 for brand heroes). */
  radius?: number;
  /** Style applied to the inner padded content layer (layout, gap, align). */
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * A layered, gradient-filled surface that replaces the old flat card. Soft
 * shadow + hairline border + a subtle diagonal sheen give real depth. `brand`
 * fills with the signature indigo→violet for hero moments.
 */
export function GradientCard({
  variant = 'surface',
  colors,
  flush,
  glow,
  radius,
  style,
  contentStyle,
  children,
  ...props
}: GradientCardProps) {
  const theme = useTheme();
  const gradients = useGradients();

  const isBrand = variant === 'brand';
  const r = radius ?? (isBrand ? Radius.xl : Radius.lg);

  const stops: GradientColors =
    colors ?? (isBrand ? gradients.brand : variant === 'raised' ? gradients.cardRaised : gradients.card);

  const shadow = glow ? Shadow.glow(glow) : variant === 'raised' ? Shadow.raised : Shadow.card;

  return (
    <View style={[{ borderRadius: r }, shadow, style]} {...props}>
      <LinearGradient
        colors={stops}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.card,
          { borderRadius: r },
          !flush && styles.padded,
          { borderColor: isBrand ? 'rgba(255,255,255,0.16)' : theme.border },
          contentStyle,
        ]}>
        {children}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  padded: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
});
