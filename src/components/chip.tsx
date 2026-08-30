import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

interface ChipProps {
  label: string;
  /** Selected chips carry the accent; unselected stay neutral. */
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/**
 * A compact toggle pill, used for the pantry picker and the Ask starter
 * prompts. Distinct from `Segmented`, which fills the active option with the
 * brand gradient — that reads as a single choice, and forty gradient-filled
 * chips would be noise. Selection here is a tinted wash plus a check, which
 * stays legible at multi-select density.
 */
export function Chip({ label, selected, onPress, icon, disabled, accessibilityLabel }: ChipProps) {
  const theme = useTheme();

  return (
    <PressableScale
      onPress={() => {
        if (disabled) return;
        haptics.selection();
        onPress?.();
      }}
      disabled={disabled}
      scaleTo={0.94}
      hoverLift={false}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.tintSoft : theme.backgroundSelected,
          borderColor: selected ? theme.tint : theme.border,
        },
        disabled && styles.disabled,
      ]}>
      <View style={styles.inner}>
        {selected ? (
          <Ionicons name="checkmark" size={14} color={theme.tint} />
        ) : icon ? (
          <Ionicons name={icon} size={14} color={theme.textSecondary} />
        ) : null}
        {/* Label stays `text` when selected: emerald on the pale emerald wash
            measures ~3:1, under the 4.5:1 floor for small text. Selection is
            carried by the border, the tinted fill and the check instead. */}
        <ThemedText type="small" style={{ color: theme.text }}>
          {label}
        </ThemedText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 36,
    justifyContent: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  disabled: {
    opacity: 0.45,
  },
});
