import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toDateKey } from '@/lib/nutrition';

interface DateFieldProps {
  label: string;
  /** Current value as YYYY-MM-DD, or '' if unset. */
  value: string;
  /** Emits a valid YYYY-MM-DD, or '' while incomplete/invalid. */
  onChange: (iso: string) => void;
  /** Restrict to dates strictly after today (e.g. a target date). */
  futureOnly?: boolean;
  /** Restrict to today or earlier (e.g. logging a past measurement). */
  pastOnly?: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

function parse(iso: string) {
  const [y, m, d] = iso.split('-');
  return { d: d ? String(Number(d)) : '', m: m ? String(Number(m)) : '', y: y ?? '' };
}

/** Day / month / year numeric entry that emits a validated ISO date. */
export function DateField({ label, value, onChange, futureOnly, pastOnly }: DateFieldProps) {
  const theme = useTheme();
  const initial = parse(value);
  const [d, setD] = useState(initial.d);
  const [m, setM] = useState(initial.m);
  const [y, setY] = useState(initial.y);

  function emit(nd: string, nm: string, ny: string) {
    const day = Number(nd);
    const month = Number(nm);
    const year = Number(ny);
    if (!day || !month || ny.length !== 4) return onChange('');
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return onChange('');
    // Reject impossible dates (e.g. Feb 30) by round-tripping through Date.
    const dt = new Date(year, month - 1, day);
    if (dt.getMonth() !== month - 1 || dt.getDate() !== day) return onChange('');
    if (futureOnly && toDateKey(dt) <= toDateKey()) return onChange('');
    if (pastOnly && toDateKey(dt) > toDateKey()) return onChange('');
    onChange(`${year}-${pad(month)}-${pad(day)}`);
  }

  const cell = (
    val: string,
    set: (v: string) => void,
    placeholder: string,
    len: number,
    which: 'd' | 'm' | 'y',
  ) => (
    <View style={[styles.cell, which === 'y' && styles.yearCell, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
      <TextInput
        value={val}
        onChangeText={(t) => {
          const cleaned = t.replace(/[^0-9]/g, '').slice(0, len);
          set(cleaned);
          const nd = which === 'd' ? cleaned : d;
          const nm = which === 'm' ? cleaned : m;
          const ny = which === 'y' ? cleaned : y;
          emit(nd, nm, ny);
        }}
        keyboardType="number-pad"
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        maxLength={len}
        style={[styles.input, { color: theme.text }]}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View style={styles.row}>
        {cell(d, setD, 'DD', 2, 'd')}
        {cell(m, setM, 'MM', 2, 'm')}
        {cell(y, setY, 'YYYY', 4, 'y')}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  cell: {
    flex: 1,
    height: 52,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  yearCell: {
    flex: 1.4,
  },
  input: {
    fontSize: 18,
    textAlign: 'center',
    fontWeight: '600',
  },
});
