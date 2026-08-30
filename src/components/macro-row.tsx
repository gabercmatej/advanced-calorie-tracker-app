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
  /** Grams of fibre logged today. Omit to hide the fibre bar entirely. */
  fiber?: number;
  /** Daily fibre guideline. */
  fiberGoal?: number;
  /**
   * How many of today's entries carried a fibre value. Zero means the day has
   * no fibre data at all, which is shown as "—" rather than a misleading 0 g.
   */
  fiberSources?: number;
}

/**
 * Labelled macro progress bars, filling in sequence.
 *
 * Fibre is appended as a fourth bar when there is anything to say about it. It
 * is deliberately last and in a quieter colour: it is a guideline, not one of
 * the three targets the calorie split actually enforces.
 */
export function MacroRow({ consumed, goal, fiber, fiberGoal, fiberSources }: MacroRowProps) {
  const theme = useTheme();

  const rows = [
    { key: 'protein', label: 'Protein', color: theme.protein },
    { key: 'carbs', label: 'Carbs', color: theme.carbs },
    { key: 'fat', label: 'Fat', color: theme.fat },
  ] as const;

  const showFiber = fiber != null && fiberGoal != null;
  const noFiberData = showFiber && (fiberSources ?? 0) === 0;

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

      {showFiber ? (
        <View style={styles.item}>
          <View style={styles.labelRow}>
            <View style={styles.labelLeft}>
              <View style={[styles.dot, { backgroundColor: theme.fiber }]} />
              <ThemedText type="smallBold">Fibre</ThemedText>
            </View>
            <View style={styles.valueRow}>
              {noFiberData ? (
                <ThemedText type="small" themeColor="textSecondary">
                  no data
                </ThemedText>
              ) : (
                <>
                  <CountUp
                    value={Math.round(fiber)}
                    delay={560}
                    type="small"
                    themeColor="textSecondary"
                  />
                  <ThemedText type="small" themeColor="textSecondary">
                    {' '}
                    / {fiberGoal} g
                  </ThemedText>
                </>
              )}
            </View>
          </View>
          <ProgressBar
            value={noFiberData ? 0 : progress(fiber, fiberGoal)}
            color={theme.fiber}
            delay={560}
            height={10}
          />
        </View>
      ) : null}
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
