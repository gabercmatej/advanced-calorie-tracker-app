import { StyleSheet, View } from 'react-native';

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

/** Three labelled macro progress bars: protein / carbs / fat. */
export function MacroRow({ consumed, goal }: MacroRowProps) {
  const theme = useTheme();

  const rows = [
    { key: 'protein', label: 'Protein', color: theme.protein },
    { key: 'carbs', label: 'Carbs', color: theme.carbs },
    { key: 'fat', label: 'Fat', color: theme.fat },
  ] as const;

  return (
    <View style={styles.container}>
      {rows.map(({ key, label, color }) => (
        <View key={key} style={styles.item}>
          <View style={styles.labelRow}>
            <ThemedText type="smallBold">{label}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {Math.round(consumed[key])} / {Math.round(goal[key])} g
            </ThemedText>
          </View>
          <ProgressBar value={progress(consumed[key], goal[key])} color={color} />
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
    gap: Spacing.one,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
