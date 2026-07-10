import { StyleSheet, View } from 'react-native';

import { CalorieRing } from '@/components/calorie-ring';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { progress } from '@/lib/nutrition';
import type { Macros } from '@/types';

interface MacroRingsProps {
  consumed: Macros;
  goal: Macros;
}

/** Three compact macro dials (protein / carbs / fat) with "eaten / goal" labels. */
export function MacroRings({ consumed, goal }: MacroRingsProps) {
  const theme = useTheme();
  const rows = [
    { key: 'protein', label: 'Protein', color: theme.protein },
    { key: 'carbs', label: 'Carbs', color: theme.carbs },
    { key: 'fat', label: 'Fat', color: theme.fat },
  ] as const;

  return (
    <View style={styles.row}>
      {rows.map(({ key, label, color }) => (
        <View key={key} style={styles.item}>
          <CalorieRing
            value={progress(consumed[key], goal[key])}
            size={72}
            thickness={8}
            color={color}>
            <ThemedText type="smallBold" style={styles.value}>
              {Math.round(consumed[key])}
            </ThemedText>
          </CalorieRing>
          <View style={styles.labels}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {label}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              of {Math.round(goal[key])}g
            </ThemedText>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  item: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  value: {
    fontSize: 15,
  },
  labels: {
    alignItems: 'center',
  },
  center: {
    textAlign: 'center',
  },
});
