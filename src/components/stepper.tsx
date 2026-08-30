import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Announced to screen readers, e.g. "Tuna in water". */
  label: string;
}

/**
 * A small −/+ counter. Used for "how many of this scanned product", where a
 * text field would be overkill and a keyboard would cover the photo strip.
 */
export function Stepper({ value, onChange, min = 1, max = 99, label }: StepperProps) {
  const theme = useTheme();

  const step = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) return;
    haptics.selection();
    onChange(next);
  };

  const canDecrease = value > min;
  const canIncrease = value < max;

  return (
    <View style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <Pressable
        onPress={() => step(-1)}
        disabled={!canDecrease}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
        style={[styles.button, !canDecrease && styles.disabled]}>
        <Ionicons name="remove" size={16} color={theme.text} />
      </Pressable>

      <ThemedText type="smallBold" style={styles.value} accessibilityLabel={`${value} ${label}`}>
        {value}
      </ThemedText>

      <Pressable
        onPress={() => step(1)}
        disabled={!canIncrease}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
        style={[styles.button, !canIncrease && styles.disabled]}>
        <Ionicons name="add" size={16} color={theme.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.one,
  },
  button: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.3,
  },
  value: {
    minWidth: 20,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
