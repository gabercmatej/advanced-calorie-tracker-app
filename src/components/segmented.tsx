import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Wrap chips instead of a single equal-width row. */
  wrap?: boolean;
}

/**
 * A pill/segmented selector used for meals, sex, goal type, activity, etc.
 * `wrap` mode flows chips; otherwise segments share the row equally.
 */
export function Segmented<T extends string>({ options, value, onChange, wrap }: SegmentedProps<T>) {
  const theme = useTheme();

  return (
    <View style={[styles.row, wrap && styles.wrap]}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.chip,
              !wrap && styles.flexChip,
              {
                backgroundColor: selected ? theme.tint : theme.backgroundSelected,
                borderColor: selected ? theme.tint : theme.border,
              },
            ]}>
            <ThemedText
              type="smallBold"
              style={{ color: selected ? theme.onTint : theme.text, textAlign: 'center' }}>
              {opt.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  wrap: {
    flexWrap: 'wrap',
  },
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flexChip: {
    flex: 1,
  },
});
