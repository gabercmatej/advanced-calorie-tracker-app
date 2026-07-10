import { StyleSheet, View } from 'react-native';

import { CountUp } from '@/components/motion';
import { ProgressBar } from '@/components/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { progress } from '@/lib/nutrition';
import type { Macros } from '@/types';

interface MacroRowProps {
  consumed: Macros;
  goal: Macros;
}

/** Three labelled macro progress bars: protein / carbs / fat, filling in sequence. */
export function MacroRow({ consumed, goal }: MacroRowProps) {
  const theme = useTheme();

  const rows = [
    { key: 'protein', label: 'Protein', color: theme.protein },
    { key: 'carbs', label: 'Carbs', color: theme.carbs },
    { key: 'fat', label: 'Fat', color: theme.fat },
  ] as const;

  return (
    <View style={styles.container}>
      {rows.map(({ key, label, color }, i) => (
        <View key={key} style={styles.item}>
          <View style={styles.labelRow}>
            <View style={styles.labelLeft}>
              <View style={[styles.dot, { backgroundColor: color }]} />
              <ThemedText type="smallBold">{label}</ThemedText>
            </View>
            <View style={styles.valueRow}>
              <CountUp
                value={Math.round(consumed[key])}
                delay={200 + i * 120}
                type="small"
                themeColor="textSecondary"
              />
              <ThemedText type="small" themeColor="textSecondary">
                {' '}
                / {Math.round(goal[key])} g
              </ThemedText>
            </View>
          </View>
          <ProgressBar
            value={progress(consumed[key], goal[key])}
            color={color}
            delay={200 + i * 120}
            height={10}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  item: {
    gap: Spacing.two,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
