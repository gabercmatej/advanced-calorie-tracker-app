import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { WeightChart } from '@/components/weight-chart';
import { Radius, Spacing } from '@/constants/theme';
import { useDiary } from '@/context/DiaryContext';
import { useTheme } from '@/hooks/use-theme';
import {
  formatWeight,
  fromDateKey,
  latestWeight,
  relativeDayLabel,
  toDateKey,
  weightProjection,
} from '@/lib/nutrition';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function ProgressScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { profile, weights, streak, recommendation } = useDiary();
  const units = profile.units;
  const metrics = profile.metrics;

  const latest = latestWeight(weights);
  const sorted = [...weights].sort((a, b) => (a.date < b.date ? -1 : 1));
  const start = sorted[0];

  // Target trajectory line, if the user set a goal weight + date.
  const projection =
    metrics?.targetWeightKg != null && metrics.targetDate && start
      ? weightProjection(start.weightKg, start.date, metrics.targetWeightKg, metrics.targetDate)
      : [];

  // Progress toward goal weight.
  let goalPct: number | null = null;
  if (metrics?.targetWeightKg != null && start && latest) {
    const span = start.weightKg - metrics.targetWeightKg;
    if (Math.abs(span) > 0.01) {
      goalPct = Math.max(0, Math.min(1, (start.weightKg - latest.weightKg) / span));
    }
  }

  return (
    <Screen
      title="Progress"
      subtitle="Your weight and nutrition trends"
      headerRight={streak > 0 ? <StreakBadge days={streak} /> : undefined}>
      {/* Weight */}
      <Card>
        <View style={styles.weightHead}>
          <View>
            <ThemedText type="small" themeColor="textSecondary">
              Current weight
            </ThemedText>
            <ThemedText style={styles.bigWeight}>
              {latest ? formatWeight(latest.weightKg, units) : '—'}
            </ThemedText>
            {metrics?.targetWeightKg != null && (
              <ThemedText type="small" themeColor="textSecondary">
                Goal {formatWeight(metrics.targetWeightKg, units)}
              </ThemedText>
            )}
          </View>
          <Button title="Log weight" variant="secondary" onPress={() => router.push('/log-weight')} style={styles.logBtn} />
        </View>

        {goalPct !== null && (
          <View style={styles.goalProgress}>
            <View style={styles.goalLabels}>
              <ThemedText type="small" themeColor="textSecondary">
                Goal progress
              </ThemedText>
              <ThemedText type="smallBold" style={{ color: theme.tint }}>
                {Math.round(goalPct * 100)}%
              </ThemedText>
            </View>
            <ProgressBar value={goalPct} height={8} />
          </View>
        )}

        <WeightChart actual={weights} projection={projection} units={units} />
      </Card>

      {/* Adaptive, muscle-sparing calorie plan (cutters only) */}
      {recommendation && <AdaptiveGoalCard plan={recommendation} units={units} />}

      {/* Nutrition history calendar */}
      <CalendarCard />
    </Screen>
  );
}

function AdaptiveGoalCard({
  plan,
  units,
}: {
  plan: NonNullable<ReturnType<typeof useDiary>['recommendation']>;
  units: 'metric' | 'imperial';
}) {
  const theme = useTheme();
  const adaptive = plan.basis === 'adaptive';
  const rate = formatWeight(plan.targetWeeklyLossKg, units);
  return (
    <>
      <View style={styles.sectionHeader}>
        <ThemedText type="subtitle" style={styles.detailTitle}>
          Adaptive plan
        </ThemedText>
      </View>
      <Card style={styles.planCard}>
        <View style={styles.planHead}>
          <View style={[styles.planIcon, { backgroundColor: theme.backgroundSelected }]}>
            <Ionicons name="sparkles" size={18} color={theme.tint} />
          </View>
          <View style={styles.planHeadText}>
            <ThemedText type="smallBold">{plan.calories} kcal / day</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {adaptive
                ? `Tuned to your last ${plan.intakeDays} days`
                : 'Starting estimate — refines as you log'}
            </ThemedText>
          </View>
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.planBody}>
          {adaptive
            ? `Your maintenance looks like ~${plan.observedTdee} kcal. We target ${rate}/week — a muscle-sparing pace that eases off as you get lighter. Hit ${plan.proteinG} g protein to hold onto muscle.`
            : `Aiming for ${rate}/week to protect muscle, with ${plan.proteinG} g protein daily. Log meals and weigh in for ~2 weeks and this target locks onto your real results.`}
        </ThemedText>
      </Card>
    </>
  );
}

function CalendarCard() {
  const theme = useTheme();
  const router = useRouter();
  const { profile, totalsForDate, loggedDates, weighedDates, setSelectedDate } = useDiary();
  const goal = profile.goals.calories;
  const today = toDateKey();

  const [monthAnchor, setMonthAnchor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const cells = buildMonthCells(monthAnchor);
  const monthLabel = monthAnchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  function shiftMonth(delta: number) {
    setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  function cellColor(key: string): string | null {
    if (!loggedDates.has(key)) return null;
    const cals = totalsForDate(key).calories;
    if (cals === 0) return null;
    return cals > goal * 1.05 ? theme.danger : theme.tint;
  }

  return (
    <>
      <View style={styles.sectionHeader}>
        <ThemedText type="subtitle" style={styles.detailTitle}>
          Nutrition history
        </ThemedText>
      </View>
      <Card>
        <View style={styles.monthNav}>
          <Pressable onPress={() => shiftMonth(-1)} hitSlop={10} accessibilityLabel="Previous month">
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          <ThemedText type="smallBold">{monthLabel}</ThemedText>
          <Pressable onPress={() => shiftMonth(1)} hitSlop={10} accessibilityLabel="Next month">
            <Ionicons name="chevron-forward" size={22} color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.weekHeader}>
          {WEEKDAYS.map((w, i) => (
            <View key={i} style={styles.cell}>
              <ThemedText type="small" themeColor="textSecondary">
                {w}
              </ThemedText>
            </View>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((key, i) => {
            if (key === null) return <View key={`b${i}`} style={styles.cell} />;
            const foodColor = cellColor(key);
            const hasWeight = weighedDates.has(key);
            const isToday = key === today;
            const isFuture = key > today;
            return (
              <Pressable
                key={key}
                style={styles.cell}
                disabled={isFuture}
                onPress={() => {
                  setSelectedDate(key);
                  router.navigate('/');
                }}
                accessibilityLabel={relativeDayLabel(key)}>
                <View
                  style={[
                    styles.dayCell,
                    isToday ? { borderColor: theme.tint, borderWidth: 1.5 } : null,
                  ]}>
                  <ThemedText
                    type={isToday ? 'smallBold' : 'small'}
                    style={{ color: isFuture ? theme.tabIconDefault : theme.text }}>
                    {fromDateKey(key).getDate()}
                  </ThemedText>
                  <View style={styles.dots}>
                    {foodColor ? <View style={[styles.dot, { backgroundColor: foodColor }]} /> : null}
                    {hasWeight ? <View style={[styles.dot, { backgroundColor: theme.streak }]} /> : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: theme.tint }]} />
            <ThemedText type="small" themeColor="textSecondary">
              Food
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: theme.streak }]} />
            <ThemedText type="small" themeColor="textSecondary">
              Weight
            </ThemedText>
          </View>
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Tap any day to open it on Home.
        </ThemedText>
      </Card>
    </>
  );
}

function StreakBadge({ days }: { days: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.streak, { backgroundColor: theme.backgroundSelected }]}>
      <Ionicons name="flame" size={16} color={theme.streak} />
      <ThemedText type="smallBold">{days}</ThemedText>
    </View>
  );
}

function buildMonthCells(anchor: Date): (string | null)[] {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toDateKey(new Date(year, month, d)));
  return cells;
}

const styles = StyleSheet.create({
  weightHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  bigWeight: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
  },
  logBtn: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 40,
  },
  goalProgress: {
    gap: Spacing.one,
  },
  goalLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekHeader: {
    flexDirection: 'row',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  dayCell: {
    width: '100%',
    aspectRatio: 1,
    maxWidth: 40,
    maxHeight: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    height: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: Radius.full,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.four,
    marginTop: Spacing.one,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  planCard: {
    gap: Spacing.three,
  },
  planHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  planIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planHeadText: {
    flex: 1,
    gap: 2,
  },
  planBody: {
    lineHeight: 20,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: Spacing.two,
  },
  detailTitle: {
    fontSize: 22,
    lineHeight: 28,
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    width: '100%',
  },
  hint: {
    textAlign: 'center',
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  list: {
    gap: 0,
    paddingVertical: Spacing.one,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
  },
  entryInfo: {
    flex: 1,
    gap: 2,
  },
  meta: {
    textTransform: 'capitalize',
  },
});
