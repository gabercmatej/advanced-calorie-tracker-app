import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { CalorieRing } from '@/components/calorie-ring';
import { Card } from '@/components/card';
import { MacroRow } from '@/components/macro-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useDiary } from '@/context/DiaryContext';
import { useEntryPhoto } from '@/hooks/use-entry-photo';
import { useTheme } from '@/hooks/use-theme';
import {
  formatWeight,
  fromDateKey,
  progress,
  relativeDayLabel,
  remaining,
  toDateKey,
  weekOf,
} from '@/lib/nutrition';
import type { FoodEntry } from '@/types';

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const theme = useTheme();
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
      title="CalorieTrackerAI"
      subtitle={`${greeting()}, ${profile.name}`}
      headerRight={streak > 0 ? <StreakBadge days={streak} /> : undefined}>
      {/* Week strip — tap any past day to point Home at it (no separate screen) */}
      <View style={styles.week}>
        {week.map((key) => {
          const isSelected = key === selectedDate;
          const isTodayCell = key === today;
          const isFuture = key > today;
          const cals = totalsForDate(key).calories;
          const met = loggedDates.has(key) && cals > 0 && cals <= goal.calories * 1.05;
          const dow = fromDateKey(key).getDay();
          return (
            <Pressable
              key={key}
              style={styles.day}
              disabled={isFuture}
              onPress={() => setSelectedDate(key)}>
              <ThemedText
                type={isTodayCell ? 'smallBold' : 'small'}
                themeColor={isTodayCell ? 'tint' : 'textSecondary'}>
                {WEEKDAY[dow]}
              </ThemedText>
              <View
                style={[
                  styles.dayCircle,
                  {
                    backgroundColor: met ? theme.tint : isSelected ? theme.backgroundSelected : 'transparent',
                    borderColor: isSelected ? theme.tint : met ? theme.tint : theme.border,
                    borderWidth: isSelected ? 2 : 1.5,
                  },
                ]}>
                <ThemedText
                  type={isSelected ? 'smallBold' : 'small'}
                  style={{ color: met ? theme.onTint : isFuture ? theme.tabIconDefault : theme.text }}>
                  {fromDateKey(key).getDate()}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Which day is in focus + quick jump back to today */}
      <View style={styles.dateBar}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {relativeDayLabel(selectedDate)}
        </ThemedText>
        {!isToday && (
          <Pressable
            onPress={() => setSelectedDate(today)}
            hitSlop={8}
            style={[styles.todayChip, { backgroundColor: theme.backgroundSelected }]}
            accessibilityRole="button"
            accessibilityLabel="Jump to today">
            <Ionicons name="today-outline" size={13} color={theme.tint} />
            <ThemedText type="small" style={{ color: theme.tint }}>
              Today
            </ThemedText>
          </Pressable>
        )}
      </View>

      {/* Big calorie ring */}
      <Card style={styles.summaryCard}>
        <CalorieRing value={pct} color={over ? theme.danger : theme.tint} size={220} thickness={20}>
          <ThemedText style={styles.ringNumber} themeColor={over ? 'danger' : 'text'}>
            {over ? Math.round(totals.calories - goal.calories) : left}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {over ? 'calories over' : 'calories left'}
          </ThemedText>
          <View style={[styles.ringPill, { backgroundColor: theme.backgroundSelected }]}>
            <Ionicons name="flame" size={13} color={over ? theme.danger : theme.tint} />
            <ThemedText type="small" themeColor="textSecondary">
              {Math.round(totals.calories)} / {goal.calories}
            </ThemedText>
          </View>
        </CalorieRing>

        <View style={styles.macros}>
          <MacroRow consumed={totals.macros} goal={goal.macros} />
        </View>
      </Card>

      {/* Meals */}
      <View style={styles.sectionHeader}>
        <ThemedText type="subtitle" style={styles.cardTitle}>
          {isToday ? "Today's meals" : 'Meals'}
        </ThemedText>
      </View>

      {entries.length === 0 ? (
        <Pressable onPress={() => router.push(isToday ? '/add' : `/add?date=${selectedDate}`)}>
          <Card style={styles.empty}>
            <Ionicons name="camera-outline" size={32} color={theme.textSecondary} />
            <ThemedText type="default" themeColor="textSecondary" style={styles.emptyText}>
              Nothing logged {isToday ? 'yet' : 'on this day'}. Tap the + button to snap a photo of your
              meal and let AI count the calories.
            </ThemedText>
          </Card>
        </Pressable>
      ) : (
        <Card style={styles.list}>
          {entries.map((e) => (
            <EntryRow key={e.id} entry={e} onPress={() => router.push(`/entry/${e.id}`)} />
          ))}
        </Card>
      )}

      {/* Weight for this day — tap to change, trash to remove */}
      <View style={styles.sectionHeader}>
        <ThemedText type="subtitle" style={styles.cardTitle}>
          Weight
        </ThemedText>
      </View>
      <Card style={styles.weightCard}>
        <Pressable
          style={styles.weightMain}
          onPress={() => router.push(`/log-weight?date=${selectedDate}`)}
          accessibilityRole="button"
          accessibilityLabel={dayWeight ? 'Edit weight' : 'Log weight for this day'}>
          <View style={[styles.weightIcon, { backgroundColor: theme.backgroundSelected }]}>
            <Ionicons name="scale-outline" size={20} color={theme.tint} />
          </View>
          {dayWeight ? (
            <View style={styles.weightInfo}>
              <ThemedText type="smallBold">{formatWeight(dayWeight.weightKg, profile.units)}</ThemedText>
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
        </Pressable>
        {dayWeight && (
          <Pressable
            onPress={() => removeWeight(selectedDate)}
            hitSlop={10}
            style={styles.weightDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete weight">
            <Ionicons name="trash-outline" size={20} color={theme.danger} />
          </Pressable>
        )}
      </Card>
    </Screen>
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

function EntryRow({ entry, onPress }: { entry: FoodEntry; onPress: () => void }) {
  const theme = useTheme();
  const photoUri = useEntryPhoto(entry);
  return (
    <Pressable
      style={[styles.entry, { borderBottomColor: theme.border }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${entry.name}`}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="restaurant" size={18} color={theme.textSecondary} />
        </View>
      )}
      <View style={styles.entryInfo}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {entry.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.entryMeta}>
          {entry.meal} · {Math.round(entry.calories * entry.quantity)} kcal
          {entry.aiEstimated ? ' · AI' : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          P {Math.round(entry.macros.protein * entry.quantity)}g · C{' '}
          {Math.round(entry.macros.carbs * entry.quantity)}g · F{' '}
          {Math.round(entry.macros.fat * entry.quantity)}g
        </ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </Pressable>
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
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
  },
  summaryCard: {
    alignItems: 'center',
    gap: Spacing.four,
  },
  ringNumber: {
    fontSize: 52,
    lineHeight: 56,
    fontWeight: '800',
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
  macros: {
    width: '100%',
  },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
  },
  cardTitle: {
    fontSize: 20,
    lineHeight: 26,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  emptyText: {
    textAlign: 'center',
  },
  list: {
    gap: 0,
    paddingVertical: Spacing.one,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryInfo: {
    flex: 1,
    gap: 2,
  },
  entryMeta: {
    textTransform: 'capitalize',
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
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightInfo: {
    flex: 1,
    gap: 2,
  },
  weightDelete: {
    padding: Spacing.one,
  },
});
