import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useGradients } from '@/hooks/use-gradients';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

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
 * A pill/segmented selector. The active chip fills with the brand gradient and
 * casts a soft glow; every chip springs on tap and ticks a selection haptic.
 */
export function Segmented<T extends string>({ options, value, onChange, wrap }: SegmentedProps<T>) {
  const theme = useTheme();
  const gradients = useGradients();

  return (
    <View style={[styles.row, wrap && styles.wrap]}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <PressableScale
            key={opt.value}
            scaleTo={0.94}
            onPress={() => {
              haptics.selection();
              onChange(opt.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.chip,
              !wrap && styles.flexChip,
              {
                backgroundColor: selected ? 'transparent' : theme.backgroundSelected,
                borderColor: selected ? 'transparent' : theme.border,
              },
            ]}>
            {selected ? (
              <LinearGradient
                colors={gradients.brand}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            <ThemedText
              type="smallBold"
              style={{ color: selected ? theme.onTint : theme.text, textAlign: 'center' }}>
              {opt.label}
            </ThemedText>
          </PressableScale>
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
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  flexChip: {
    flex: 1,
  },
});
