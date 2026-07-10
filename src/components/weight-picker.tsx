import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Segmented } from '@/components/segmented';
import { Slider } from '@/components/slider';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface WeightPickerProps {
  /** Value in the current display unit. */
  value: number;
  unit: 'kg' | 'lbs';
  onChange: (value: number) => void;
  onToggleUnit?: (unit: 'kg' | 'lbs') => void;
  min?: number;
  max?: number;
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/**
 * Weight entry with a coarse slider AND a precise typed field (to one decimal).
 * Value is always reported in the active unit; the unit toggle is optional.
 */
export function WeightPicker({ value, unit, onChange, onToggleUnit, min, max }: WeightPickerProps) {
  const theme = useTheme();
  const lo = min ?? (unit === 'kg' ? 30 : 66);
  const hi = max ?? (unit === 'kg' ? 250 : 550);

  const [text, setText] = useState(fmt(value));

  // Keep the text field in sync when the value changes elsewhere (slider,
  // unit toggle) without clobbering an in-progress edit.
  useEffect(() => {
    if (parseFloat(text) !== value) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const clamp = (n: number) => Math.max(lo, Math.min(hi, n));

  function onType(t: string) {
    // Allow digits and a single decimal separator.
    const cleaned = t.replace(/[^0-9.]/g, '');
    setText(cleaned);
    const n = parseFloat(cleaned);
    if (!Number.isNaN(n)) onChange(clamp(n));
  }

  function onSlide(v: number) {
    onChange(v);
    setText(fmt(v));
  }

  return (
    <View style={styles.container}>
      {onToggleUnit && (
        <Segmented
          value={unit}
          onChange={onToggleUnit}
          options={[
            { value: 'kg', label: 'kg' },
            { value: 'lbs', label: 'lbs' },
          ]}
        />
      )}

      <View style={styles.valueRow}>
        <TextInput
          value={text}
          onChangeText={onType}
          keyboardType="decimal-pad"
          selectTextOnFocus
          style={[styles.input, { color: theme.text, borderBottomColor: theme.border }]}
        />
        <ThemedText type="default" themeColor="textSecondary" style={styles.unit}>
          {unit}
        </ThemedText>
      </View>

      <Slider value={value} min={lo} max={hi} step={0.5} onChange={onSlide} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  input: {
    fontSize: 52,
    fontWeight: '800',
    textAlign: 'center',
    minWidth: 140,
    borderBottomWidth: 2,
    paddingVertical: Spacing.one,
    borderRadius: Radius.sm,
  },
  unit: {
    fontSize: 18,
  },
});
