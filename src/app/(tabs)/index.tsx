import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { CalorieRing } from '@/components/calorie-ring';
import { GradientCard } from '@/components/gradient-card';
import { MacroRow } from '@/components/macro-row';
import { Appear, CountUp, Floating, PressableScale } from '@/components/motion';
import { Screen } from '@/components/screen';
import { StreakBadge } from '@/components/streak-badge';
import { ThemedText } from '@/components/themed-text';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useDiary } from '@/context/DiaryContext';
import { useEntryPhoto } from '@/hooks/use-entry-photo';
import { useGradients } from '@/hooks/use-gradients';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import {
  formatWeight,
  fromDateKey,
  progress,
  relativeDayLabel,
  remaining,
  toDateKey,
  weekOf,
} from '@/lib/nutrition';
import type { FoodEntry, Macros } from '@/types';

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const theme = useTheme();
  const gradients = useGradients();
  const router = useRouter();
  const {
    profile,
    entriesForDate,
    totalsForDate,
    loggedDates,
    streak,
    selectedDate,
    setSelectedDate,
    weightForDate,
    removeWeight,
  } = useDiary();

  const today = toDateKey();
  const week = weekOf(selectedDate);
  const isToday = selectedDate === today;

  const entries = entriesForDate(selectedDate);
  const totals = totalsForDate(selectedDate);
  const goal = profile.goals;
  const left = remaining(totals.calories, goal.calories);
  const pct = progress(totals.calories, goal.calories);
  const over = totals.calories > goal.calories;
  const dayWeight = weightForDate(selectedDate);

  return (
    <Screen
      brand
      title={`${greeting()}, ${profile.name} 👋`}
      subtitle="Stay consistent with your goals today."
      headerRight={<StreakBadge days={streak} />}>
      {/* Week strip — tap any past day to point Home at it (no separate screen) */}
      <Appear delay={60} style={styles.week}>
        {week.map((key) => {
          const isSelected = key === selectedDate;
          const isTodayCell = key === today;
          const isFuture = key > today;
          const cals = totalsForDate(key).calories;
          const met = loggedDates.has(key) && cals > 0 && cals <= goal.calories * 1.05;
          const dow = fromDateKey(key).getDay();
          return (
            <PressableScale
              key={key}
              scaleTo={0.9}
              style={styles.day}
              disabled={isFuture}
              onPress={() => {
                haptics.selection();
                setSelectedDate(key);
              }}>
              <ThemedText
                type={isTodayCell ? 'smallBold' : 'small'}
                themeColor={isTodayCell ? 'tint' : 'textSecondary'}>
                {WEEKDAY[dow]}
              </ThemedText>
              <View
                style={[
                  styles.dayCircle,
                  {
                    backgroundColor: met ? 'transparent' : isSelected ? theme.tintSoft : 'transparent',
                    borderColor: isSelected ? theme.tint : met ? 'transparent' : theme.border,
                    borderWidth: isSelected ? 2 : 1.5,
                  },
                ]}>
                {met ? (
                  <LinearGradient
                    colors={gradients.brand}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: Radius.full }]}
                  />
                ) : null}
                <ThemedText
                  type={isSelected || met ? 'smallBold' : 'small'}
                  style={{ color: met ? theme.onTint : isFuture ? theme.tabIconDefault : theme.text }}>
                  {fromDateKey(key).getDate()}
                </ThemedText>
              </View>
            </PressableScale>
          );
        })}
      </Appear>

      {/* Which day is in focus + quick jump back to today */}
      <View style={styles.dateBar}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {relativeDayLabel(selectedDate)}
        </ThemedText>
        {!isToday && (
          <PressableScale
            onPress={() => {
              haptics.light();
              setSelectedDate(today);
            }}
            scaleTo={0.92}
            style={[styles.todayChip, { backgroundColor: theme.tintSoft }]}
            accessibilityRole="button"
            accessibilityLabel="Jump to today">
            <Ionicons name="today-outline" size={13} color={theme.tint} />
            <ThemedText type="small" style={{ color: theme.tint }}>
              Today
            </ThemedText>
          </PressableScale>
        )}
      </View>

      {/* Hero: big animated calorie ring with floating nutrient chips */}
      <Appear delay={120}>
        <GradientCard variant="raised" contentStyle={styles.summaryCard}>
          <View style={styles.ringWrap}>
            <CalorieRing
              value={pct}
              gradient={over ? gradients.danger : gradients.brand}
              size={224}
              thickness={22}>
              <CountUp
                value={over ? Math.round(totals.calories - goal.calories) : left}
                style={styles.ringNumber}
                themeColor={over ? 'danger' : 'text'}
              />
              <ThemedText type="small" themeColor="textSecondary">
                {over ? 'calories over' : 'calories left'}
              </ThemedText>
              <View style={[styles.ringPill, { backgroundColor: theme.tintSoft }]}>
                <Ionicons name="flame" size={13} color={over ? theme.danger : theme.tint} />
                <ThemedText type="small" themeColor="textSecondary">
                  {Math.round(totals.calories)} / {goal.calories}
                </ThemedText>
              </View>
            </CalorieRing>

            {/* Floating nutrient chips orbiting the ring */}
            <NutrientChip
              style={styles.chipTopLeft}
              color={theme.protein}
              label="Protein"
              value={Math.round(totals.macros.protein)}
              delay={0}
            />
            <NutrientChip
              style={styles.chipTopRight}
              color={theme.carbs}
              label="Carbs"
              value={Math.round(totals.macros.carbs)}
              delay={700}
            />
            <NutrientChip
              style={styles.chipBottom}
              color={theme.fat}
              label="Fat"
              value={Math.round(totals.macros.fat)}
              delay={1400}
            />
          </View>

          <View style={styles.macros}>
            <MacroRow consumed={totals.macros} goal={goal.macros} />
          </View>
        </GradientCard>
      </Appear>

      {/* Meals */}
      <Appear delay={180} style={styles.sectionHeader}>
        <ThemedText type="subtitle" style={styles.cardTitle}>
          {isToday ? "Today's meals" : 'Meals'}
        </ThemedText>
        {entries.length > 0 ? (
          <View style={[styles.countPill, { backgroundColor: theme.tintSoft }]}>
            <ThemedText type="small" style={{ color: theme.tint }}>
              {entries.length} tracked
            </ThemedText>
          </View>
        ) : null}
      </Appear>

      {entries.length === 0 ? (
        <Appear delay={220}>
          <PressableScale onPress={() => router.push(isToday ? '/add' : `/add?date=${selectedDate}`)}>
            <GradientCard contentStyle={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.tintSoft }]}>
                <Ionicons name="camera-outline" size={30} color={theme.tint} />
              </View>
              <ThemedText type="smallBold" style={styles.emptyTitle}>
                {isToday ? 'Nothing logged yet' : 'Nothing on this day'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                Tap the + button to snap a photo of your meal and let AI count the calories. ✨
              </ThemedText>
            </GradientCard>
          </PressableScale>
        </Appear>
      ) : (
        <GradientCard contentStyle={styles.list}>
          {entries.map((e, i) => (
            <Appear key={e.id} delay={220 + i * 60}>
              <EntryRow
                entry={e}
                first={i === 0}
                onPress={() => router.push(`/entry/${e.id}`)}
              />
            </Appear>
          ))}
        </GradientCard>
      )}

      {/* Weight for this day — tap to change, trash to remove */}
      <Appear delay={260} style={styles.sectionHeader}>
        <ThemedText type="subtitle" style={styles.cardTitle}>
          Weight
        </ThemedText>
      </Appear>
      <Appear delay={300}>
        <GradientCard contentStyle={styles.weightCard}>
          <PressableScale
            style={styles.weightMain}
            onPress={() => {
              haptics.light();
              router.push(`/log-weight?date=${selectedDate}`);
            }}
            accessibilityRole="button"
            accessibilityLabel={dayWeight ? 'Edit weight' : 'Log weight for this day'}>
            <View style={[styles.weightIcon, { backgroundColor: theme.tintSoft }]}>
              <Ionicons name="scale-outline" size={22} color={theme.tint} />
            </View>
            {dayWeight ? (
              <View style={styles.weightInfo}>
                <ThemedText type="smallBold" style={styles.weightValue}>
                  {formatWeight(dayWeight.weightKg, profile.units)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Tap to change
                </ThemedText>
              </View>
            ) : (
              <View style={styles.weightInfo}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  No weight logged
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Tap to add for {relativeDayLabel(selectedDate).toLowerCase()}
                </ThemedText>
              </View>
            )}
          </PressableScale>
          {dayWeight && (
            <PressableScale
              onPress={() => {
                haptics.warning();
                removeWeight(selectedDate);
              }}
              scaleTo={0.88}
              style={styles.weightDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete weight">
              <Ionicons name="trash-outline" size={20} color={theme.danger} />
            </PressableScale>
          )}
        </GradientCard>
      </Appear>
    </Screen>
  );
}

function NutrientChip({
  color,
  label,
  value,
  delay,
  style,
}: {
  color: string;
  label: string;
  value: number;
  delay: number;
  style: object;
}) {
  const theme = useTheme();
  return (
    <Floating delay={delay} amplitude={5} style={[styles.chip, style]}>
      <View style={[styles.chipInner, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, Shadow.raised]}>
        <View style={[styles.chipDot, { backgroundColor: color }]} />
        <View>
          <ThemedText type="smallBold" style={styles.chipValue}>
            {value}g
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.chipLabel}>
            {label}
          </ThemedText>
        </View>
      </View>
    </Floating>
  );
}

function EntryRow({ entry, first, onPress }: { entry: FoodEntry; first: boolean; onPress: () => void }) {
  const theme = useTheme();
  const photoUri = useEntryPhoto(entry);
  const macros: Macros = entry.macros;
  return (
    <PressableScale
      scaleTo={0.98}
      style={[styles.entry, !first && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}
      onPress={() => {
        haptics.light();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${entry.name}`}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: theme.tintSoft }]}>
          <Ionicons name="restaurant" size={22} color={theme.tint} />
        </View>
      )}
      <View style={styles.entryInfo}>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.entryName}>
          {entry.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.entryMeta}>
          {entry.meal} · {timeLabel(entry.createdAt)}
          {entry.aiEstimated ? ' · AI' : ''}
        </ThemedText>
        <View style={styles.entryMacros}>
          <MacroTag color={theme.protein} text={`P ${Math.round(macros.protein * entry.quantity)}g`} />
          <MacroTag color={theme.carbs} text={`C ${Math.round(macros.carbs * entry.quantity)}g`} />
          <MacroTag color={theme.fat} text={`F ${Math.round(macros.fat * entry.quantity)}g`} />
        </View>
      </View>
      <View style={styles.entryRight}>
        <ThemedText type="smallBold" style={[styles.entryKcal, { color: theme.tint }]}>
          {Math.round(entry.calories * entry.quantity)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.entryKcalUnit}>
          kcal
        </ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </PressableScale>
  );
}

function timeLabel(createdAt: number): string {
  return new Date(createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function MacroTag({ color, text }: { color: string; text: string }) {
  return (
    <View style={styles.macroTag}>
      <View style={[styles.macroTagDot, { backgroundColor: color }]} />
      <ThemedText type="small" themeColor="textSecondary">
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  week: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  day: {
    alignItems: 'center',
    gap: Spacing.one,
    flex: 1,
  },
  dayCircle: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  todayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
  },
  summaryCard: {
    alignItems: 'center',
    gap: Spacing.four,
    paddingVertical: Spacing.five,
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringNumber: {
    fontSize: 54,
    lineHeight: 58,
    fontWeight: '800',
    letterSpacing: -1,
  },
  ringPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
    marginTop: Spacing.two,
  },
  chip: {
    position: 'absolute',
  },
  chipTopLeft: {
    top: 2,
    left: -14,
  },
  chipTopRight: {
    top: 2,
    right: -14,
  },
  chipBottom: {
    bottom: -6,
  },
  chipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  chipValue: {
    fontSize: 13,
    lineHeight: 16,
  },
  chipLabel: {
    fontSize: 11,
    lineHeight: 13,
  },
  macros: {
    width: '100%',
  },
  cardTitle: {
    fontSize: 21,
    lineHeight: 26,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    gap: Spacing.two,
  },
  countPill: {
    minWidth: 24,
    height: 24,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  emptyTitle: {
    fontSize: 16,
  },
  emptyText: {
    textAlign: 'center',
    paddingHorizontal: Spacing.two,
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
    gap: Spacing.three,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryInfo: {
    flex: 1,
    gap: 3,
  },
  entryName: {
    fontSize: 15,
  },
  entryMeta: {
    textTransform: 'uppercase',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
  },
  entryRight: {
    alignItems: 'flex-end',
  },
  entryKcal: {
    fontSize: 16,
    lineHeight: 20,
  },
  entryKcalUnit: {
    fontSize: 11,
    lineHeight: 14,
  },
  entryMacros: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: 2,
  },
  macroTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  macroTagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  weightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  weightMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  weightIcon: {
    width: 46,
    height: 46,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightInfo: {
    flex: 1,
    gap: 2,
  },
  weightValue: {
    fontSize: 18,
  },
  weightDelete: {
    padding: Spacing.one,
  },
});
