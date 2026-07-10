import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DateField } from '@/components/date-field';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WeightPicker } from '@/components/weight-picker';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useCelebration } from '@/context/CelebrationContext';
import { useDiary } from '@/context/DiaryContext';
import { useTheme } from '@/hooks/use-theme';
import { addDays, kgToLb, latestWeight, lbToKg, relativeDayLabel, toDateKey } from '@/lib/nutrition';

type When = 'today' | 'yesterday' | 'custom';

export default function LogWeightScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const { profile, weights, logWeight, weightForDate } = useDiary();
  const { celebrate } = useCelebration();

  const imperial = profile.units === 'imperial';
  // Prefill from the day being edited if it already has a weight, else the latest.
  const existing = date ? weightForDate(date)?.weightKg : undefined;
  const last = existing ?? latestWeight(weights)?.weightKg ?? profile.metrics?.weightKg ?? 70;
  const [unit, setUnit] = useState<'kg' | 'lbs'>(imperial ? 'lbs' : 'kg');
  const [value, setValue] = useState(() => Math.round((imperial ? kgToLb(last) : last) * 10) / 10);

  // Which day this measurement is for. If launched with ?date=, start on that day.
  const [when, setWhen] = useState<When>(date && date !== toDateKey() ? 'custom' : 'today');
  const [customDate, setCustomDate] = useState(date && date !== toDateKey() ? date : '');

  const targetDate =
    when === 'today'
      ? toDateKey()
      : when === 'yesterday'
        ? addDays(toDateKey(), -1)
        : customDate;
  const canSave = when !== 'custom' || !!customDate;

  function toggleUnit(u: 'kg' | 'lbs') {
    if (u === unit) return;
    setValue((v) => Math.round((u === 'lbs' ? kgToLb(v) : lbToKg(v)) * 10) / 10);
    setUnit(u);
  }

  function onSave() {
    if (!targetDate) return;
    const kg = unit === 'kg' ? value : lbToKg(value);
    logWeight(Math.round(kg * 10) / 10, targetDate);
    celebrate(targetDate === toDateKey() ? 'Weight logged' : `Weight logged · ${relativeDayLabel(targetDate)}`);
    router.back();
  }

  return (
    <ThemedView style={styles.flex}>
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === 'ios' ? Spacing.two : insets.top + Spacing.two },
        ]}>
        <ThemedText type="title" style={styles.title}>
          Log weight
        </ThemedText>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={theme.text} />
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={styles.column}>
          <WeightPicker value={value} unit={unit} onChange={setValue} onToggleUnit={toggleUnit} />

          <View style={styles.dateSection}>
            <ThemedText type="smallBold">For which day?</ThemedText>
            <Segmented
              value={when}
              onChange={(w: When) => setWhen(w)}
              options={[
                { value: 'today', label: 'Today' },
                { value: 'yesterday', label: 'Yesterday' },
                { value: 'custom', label: 'Pick date' },
              ]}
            />
            {when === 'custom' && (
              <DateField label="Date" value={customDate} onChange={setCustomDate} pastOnly />
            )}
          </View>

          <Button title="Save weight" onPress={onSave} disabled={!canSave} />
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.four,
    paddingTop: Spacing.four,
  },
  dateSection: {
    gap: Spacing.two,
  },
});
