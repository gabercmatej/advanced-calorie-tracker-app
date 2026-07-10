import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useGradients } from '@/hooks/use-gradients';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  title: string;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}

/**
 * Primary call-to-action. The primary variant fills with the brand gradient and
 * casts a soft colored glow; both variants spring on press and fire a haptic.
 */
export function Button({
  title,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
  onPress,
  ...props
}: ButtonProps) {
  const theme = useTheme();
  const gradients = useGradients();
  const isPrimary = variant === 'primary';
  const fg = isPrimary ? '#FFFFFF' : theme.text;
  const isDisabled = disabled || loading;

  const inner = (
    <View style={styles.inner}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <ThemedText type="smallBold" style={[styles.label, { color: fg }]}>
            {title}
          </ThemedText>
        </>
      )}
    </View>
  );

  return (
    <PressableScale
      accessibilityRole="button"
      disabled={isDisabled}
      scaleTo={0.97}
      onPress={(e) => {
        if (isDisabled) return;
        haptics.light();
        onPress?.(e);
      }}
      style={[styles.button, isDisabled && styles.disabled, style]}
      {...props}>
      {isPrimary ? (
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.fill, !isDisabled && Shadow.glow(theme.tint)]}>
          {inner}
        </LinearGradient>
      ) : (
        <View style={[styles.fill, { backgroundColor: theme.backgroundSelected, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border }]}>
          {inner}
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Radius.md,
  },
  disabled: {
    opacity: 0.5,
  },
  fill: {
    borderRadius: Radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    overflow: 'hidden',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  label: {
    fontSize: 15,
  },
});
