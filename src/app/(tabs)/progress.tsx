import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { GradientCard } from '@/components/gradient-card';
import { Appear, CountUp, PressableScale } from '@/components/motion';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { StreakBadge } from '@/components/streak-badge';
import { ThemedText } from '@/components/themed-text';
import { WeightChart } from '@/components/weight-chart';
import { Radius, Spacing } from '@/constants/theme';
import { useDiary } from '@/context/DiaryContext';
import { useGradients } from '@/hooks/use-gradients';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import {
  addDays,
  daysBetween,
  fromDateKey,
  kgToLb,
  latestWeight,
  relativeDayLabel,
  toDateKey,
  weightProjection,
} from '@/lib/nutrition';
import type { UnitSystem, WeightEntry } from '@/types';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
/** Trailing window (days) behind the Weekly Avg / Days Logged tiles. */
const TREND_WINDOW_DAYS = 30;

export default function ProgressScreen() {
  const theme = useTheme();
  const gradients = useGradients();
  const router = useRouter();
  const { profile, weights, streak, recommendation, loggedDates } = useDiary();
  const units = profile.units;
  const metrics = profile.metrics;

  const latest = latestWeight(weights);
  const sorted = [...weights].sort((a, b) => (a.date < b.date ? -1 : 1));
  const start = sorted[0];

  const projection =
    metrics?.targetWeightKg != null && metrics.targetDate && start
      ? weightProjection(start.weightKg, start.date, metrics.targetWeightKg, metrics.targetDate)
      : [];

  let goalPct: number | null = null;
  if (metrics?.targetWeightKg != null && start && latest) {
    const span = start.weightKg - metrics.targetWeightKg;
    if (Math.abs(span) > 0.01) {
      goalPct = Math.max(0, Math.min(1, (start.weightKg - latest.weightKg) / span));
    }
  }

  const unitLabel = units === 'imperial' ? 'lb' : 'kg';
  const disp = (kg: number) => (units === 'imperial' ? kgToLb(kg) : kg);

  // --- Trend stats over the trailing window ---
  const today = toDateKey();
  const windowStart = addDays(today, -TREND_WINDOW_DAYS);
  const weeklyAvgKg = weeklyRate(sorted, windowStart);
  const daysLogged = [...loggedDates].filter((d) => d > windowStart && d <= today).length;

  // Projected finish, extrapolated from the observed velocity.
  let finishDate: string | null = null;
  if (latest && metrics?.targetWeightKg != null && weeklyAvgKg != null) {
    const toGo = metrics.targetWeightKg - latest.weightKg;
    // Only project when actually moving toward the goal.
    if (Math.abs(toGo) > 0.05 && Math.sign(toGo) === Math.sign(weeklyAvgKg)) {
      const days = Math.round((toGo / weeklyAvgKg) * 7);
      if (days > 0 && days < 366 * 2) finishDate = addDays(today, days);
    }
  }

  const totalChangeKg = start && latest && start.date !== latest.date ? latest.weightKg - start.weightKg : null;

  return (
    <Screen
      brand
      title="Progress"
      subtitle="Your weight and nutrition trends"
      headerRight={<StreakBadge days={streak} />}>
      {/* Current weight + goal progress */}
      <Appear delay={80}>
        <GradientCard variant="raised">
          <View style={styles.weightHead}>
            <View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.tileLabel}>
                Current weight
              </ThemedText>
              {latest ? (
                <View style={styles.bigWeightRow}>
                  <CountUp
                    value={disp(latest.weightKg)}
                    decimals={1}
                    style={styles.bigWeight}
                    duration={900}
                  />
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.unit}>
                    {unitLabel}
                  </ThemedText>
                </View>
              ) : (
                <ThemedText style={styles.bigWeight}>—</ThemedText>
              )}
              {metrics?.targetWeightKg != null && (
                <View style={styles.goalChip}>
                  <Ionicons name="flag" size={12} color={theme.tint} />
                  <ThemedText type="small" themeColor="textSecondary">
                    Goal {disp(metrics.targetWeightKg).toFixed(1)} {unitLabel}
                  </ThemedText>
                </View>
              )}
            </View>
            <Button title="Log weight" icon="add" onPress={() => router.push('/log-weight')} style={styles.logBtn} />
          </View>

          {goalPct !== null && (
            <View style={styles.goalProgress}>
              <View style={styles.goalLabels}>
                <ThemedText type="small" themeColor="textSecondary">
                  Goal progress
                </ThemedText>
                <CountUp value={Math.round(goalPct * 100)} suffix="%" type="smallBold" style={{ color: theme.tint }} />
              </View>
              <ProgressBar value={goalPct} gradient={gradients.brand} height={12} />
            </View>
          )}
        </GradientCard>
      </Appear>

      {/* Weekly average + days logged */}
      <Appear delay={120} style={styles.tileRow}>
        <StatTile
          icon="trending-down"
          label="Weekly Avg"
          value={
            weeklyAvgKg != null
              ? `${weeklyAvgKg > 0 ? '+' : ''}${disp(weeklyAvgKg).toFixed(1)} ${unitLabel}`
              : '—'
          }
          tone={weeklyAvgKg != null && weeklyAvgKg < 0 ? 'tint' : 'text'}
        />
        <StatTile icon="calendar-outline" label="Days Logged" value={`${daysLogged}/${TREND_WINDOW_DAYS}`} />
      </Appear>

      {/* Weight history chart */}
      <Appear delay={160}>
        <GradientCard>
          <ThemedText type="subtitle" style={styles.cardTitle}>
            Weight History
          </ThemedText>
          <WeightChart actual={weights} projection={projection} units={units} />
        </GradientCard>
      </Appear>

      {/* Adaptive, muscle-sparing calorie plan (cutters only) */}
      {recommendation && (
        <Appear delay={200}>
          <AdaptiveGoalCard plan={recommendation} units={units} />
        </Appear>
      )}

      {/* Projected finish / total loss / streak */}
      {finishDate && (
        <Appear delay={240}>
          <GradientCard contentStyle={[styles.factCard, { borderLeftColor: theme.tint, borderLeftWidth: 3 }]}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.tileLabel}>
              Projected Finish
            </ThemedText>
            <ThemedText type="smallBold" style={styles.factValue}>
              {longDate(finishDate)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Based on current velocity
            </ThemedText>
          </GradientCard>
        </Appear>
      )}

      {totalChangeKg != null && start && (
        <Appear delay={280}>
          <GradientCard contentStyle={styles.factCard}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.tileLabel}>
              {totalChangeKg <= 0 ? 'Total Loss' : 'Total Gain'}
            </ThemedText>
            <ThemedText type="smallBold" style={styles.factValue}>
              {Math.abs(disp(totalChangeKg)).toFixed(1)} {unitLabel}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Since {longDate(start.date)}
            </ThemedText>
          </GradientCard>
        </Appear>
      )}

      {streak > 0 && (
        <Appear delay={320}>
          <GradientCard contentStyle={styles.factCard}>
            <View style={styles.factRow}>
              <View style={styles.factText}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.tileLabel}>
                  Streak
                </ThemedText>
                <ThemedText type="smallBold" style={[styles.factValue, { color: theme.streak }]}>
                  {streak} {streak === 1 ? 'Day' : 'Days'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Perfect logging streak
                </ThemedText>
              </View>
              <Ionicons name="flame" size={36} color={theme.streak} />
            </View>
          </GradientCard>
        </Appear>
      )}

      {/* Nutrition history calendar */}
      <Appear delay={360}>
        <CalendarCard />
      </Appear>
    </Screen>
  );
}

/**
 * Average weekly weight change (kg/week) over the trailing window; falls back
 * to the whole history when the window holds fewer than two weigh-ins.
 */
function weeklyRate(sorted: WeightEntry[], windowStart: string): number | null {
  const recent = sorted.filter((w) => w.date > windowStart);
  const pts = recent.length >= 2 ? recent : sorted;
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const span = daysBetween(first.date, last.date);
  if (span < 1) return null;
  return ((last.weightKg - first.weightKg) / span) * 7;
}

function longDate(key: string): string {
  return fromDateKey(key).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

function StatTile({
  icon,
  label,
  value,
  tone = 'text',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone?: 'text' | 'tint';
}) {
  const theme = useTheme();
  return (
    <GradientCard style={styles.tile} contentStyle={styles.tileContent}>
      <View style={[styles.tileIcon, { backgroundColor: theme.tintSoft }]}>
        <Ionicons name={icon} size={16} color={theme.tint} />
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.tileLabel}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={[styles.tileValue, tone === 'tint' && { color: theme.tint }]}>
        {value}
      </ThemedText>
    </GradientCard>
  );
}

function AdaptiveGoalCard({
  plan,
  units,
}: {
  plan: NonNullable<ReturnType<typeof useDiary>['recommendation']>;
  units: UnitSystem;
}) {
  const gradients = useGradients();
  const theme = useTheme();
  const adaptive = plan.basis === 'adaptive';
  const rate = units === 'imperial' ? `${kgToLb(plan.targetWeeklyLossKg).toFixed(1)} lb` : `${plan.targetWeeklyLossKg.toFixed(2)} kg`;
  return (
    <>
      <View style={styles.sectionHeader}>
        <ThemedText type="subtitle" style={styles.detailTitle}>
          Adaptive plan
        </ThemedText>
      </View>
      <GradientCard>
        <View style={styles.planHead}>
          <LinearGradient
            colors={gradients.brand}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.planIcon}>
            <Ionicons name="sparkles" size={20} color={theme.onTint} />
          </LinearGradient>
          <View style={styles.planHeadText}>
            <ThemedText type="smallBold" style={styles.planCalories}>
              {plan.calories} kcal / day
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.tint }}>
              {adaptive ? `Tuned to your last ${plan.intakeDays} days` : 'Starting estimate — refines as you log'}
            </ThemedText>
          </View>
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.planBody}>
          {adaptive
            ? `Your maintenance looks like ~${plan.observedTdee} kcal. We target ${rate}/week — a muscle-sparing pace that eases off as you get lighter. Hit ${plan.proteinG} g protein to hold onto muscle.`
            : `Aiming for ${rate}/week to protect muscle, with ${plan.proteinG} g protein daily. Log meals and weigh in for ~2 weeks and this target locks onto your real results.`}
        </ThemedText>

        <View style={styles.planChips}>
          <PlanChip label="High protein" />
          <PlanChip label="Moderate fat" />
        </View>
      </GradientCard>
    </>
  );
}

function PlanChip({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.planChip, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.planChipText}>
        {label}
      </ThemedText>
    </View>
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
    haptics.selection();
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
      <GradientCard>
        <View style={styles.monthNav}>
          <PressableScale onPress={() => shiftMonth(-1)} scaleTo={0.85} style={[styles.navBtn, { backgroundColor: theme.tintSoft }]} accessibilityLabel="Previous month">
            <Ionicons name="chevron-back" size={20} color={theme.tint} />
          </PressableScale>
          <ThemedText type="smallBold" style={styles.monthLabel}>{monthLabel}</ThemedText>
          <PressableScale onPress={() => shiftMonth(1)} scaleTo={0.85} style={[styles.navBtn, { backgroundColor: theme.tintSoft }]} accessibilityLabel="Next month">
            <Ionicons name="chevron-forward" size={20} color={theme.tint} />
          </PressableScale>
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
              <PressableScale
                key={key}
                scaleTo={0.85}
                style={styles.cell}
                disabled={isFuture}
                onPress={() => {
                  haptics.selection();
                  setSelectedDate(key);
                  router.navigate('/');
                }}
                accessibilityLabel={relativeDayLabel(key)}>
                <View
                  style={[
                    styles.dayCell,
                    isToday ? { borderColor: theme.tint, borderWidth: 1.5, backgroundColor: theme.tintSoft } : null,
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
              </PressableScale>
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
      </GradientCard>
    </>
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
  bigWeightRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  bigWeight: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '800',
    letterSpacing: -1,
  },
  unit: {
    fontSize: 16,
  },
  goalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    marginTop: Spacing.half,
  },
  logBtn: {
    minHeight: 42,
  },
  goalProgress: {
    gap: Spacing.two,
  },
  goalLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tileRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  tile: {
    flex: 1,
  },
  tileContent: {
    gap: Spacing.one,
    padding: Spacing.three,
  },
  tileIcon: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  tileLabel: {
    textTransform: 'uppercase',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
  },
  tileValue: {
    fontSize: 20,
    lineHeight: 26,
  },
  cardTitle: {
    fontSize: 21,
    lineHeight: 28,
  },
  factCard: {
    gap: Spacing.half,
  },
  factValue: {
    fontSize: 22,
    lineHeight: 28,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  factText: {
    flex: 1,
    gap: Spacing.half,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 15,
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
  planHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  planIcon: {
    width: 46,
    height: 46,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planHeadText: {
    flex: 1,
    gap: 2,
  },
  planCalories: {
    fontSize: 16,
  },
  planBody: {
    lineHeight: 20,
  },
  planChips: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  planChip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  planChipText: {
    textTransform: 'uppercase',
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.8,
  },
  detailTitle: {
    fontSize: 21,
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
});
