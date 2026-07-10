import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DateField } from '@/components/date-field';
import { Field } from '@/components/field';
import { Appear } from '@/components/motion';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Radius, Shadow } from '@/constants/theme';
import { useGradients } from '@/hooks/use-gradients';
import { useAuth } from '@/context/AuthContext';
import { useDiary } from '@/context/DiaryContext';
import { useTheme } from '@/hooks/use-theme';
import {
  addDays,
  computeGoals,
  DIET_LABEL,
  GOAL_LABEL,
  macrosFromCalories,
  relativeDayLabel,
  toDateKey,
  WORKOUT_LABEL,
} from '@/lib/nutrition';
import {
  cancelReminders,
  requestNotificationPermission,
  scheduleDailyReminder,
} from '@/lib/notifications';
import {
  DIET_TYPES,
  GOAL_TYPES,
  WORKOUT_BUCKETS,
  type DietType,
  type GoalType,
  type ThemePreference,
  type UnitSystem,
  type WorkoutsPerWeek,
} from '@/types';

function notify(msg: string) {
  if (Platform.OS === 'web') return;
  Alert.alert('Saved', msg);
}

export default function ProfileScreen() {
  const theme = useTheme();
  const gradients = useGradients();
  const { session, signOut } = useAuth();
  const { profile, updateGoals, setUnits, setTheme, completeOnboarding, setNotificationsEnabled } =
    useDiary();
  const metrics = profile.metrics;

  const [calories, setCalories] = useState(String(profile.goals.calories));
  const [weightKg, setWeightKg] = useState(String(metrics?.weightKg ?? ''));
  const [workouts, setWorkouts] = useState<WorkoutsPerWeek>(metrics?.workoutsPerWeek ?? '3-5');
  const [goalType, setGoalType] = useState<GoalType>(metrics?.goalType ?? 'maintain');
  const [diet, setDiet] = useState<DietType>(metrics?.diet ?? 'balanced');
  const [targetWeightKg, setTargetWeightKg] = useState(String(metrics?.targetWeightKg ?? ''));
  // Timeframe preset (days as string) or 'custom' to pick an exact date.
  const [timeframe, setTimeframe] = useState('60');
  const [customDate, setCustomDate] = useState('');

  const wantsTarget = goalType !== 'maintain';
  const isCustomDate = timeframe === 'custom';
  const targetDate = wantsTarget
    ? isCustomDate
      ? customDate
      : addDays(toDateKey(), Number(timeframe))
    : undefined;
  const macros = macrosFromCalories(Number(calories) || 0);

  function onSaveCalories() {
    const cal = Math.max(0, Math.round(Number(calories) || 0));
    updateGoals({ calories: cal, macros: macrosFromCalories(cal) });
    notify('Your calorie goal has been updated.');
  }

  function onRecalculate() {
    if (!metrics) return;
    const nextMetrics = {
      ...metrics,
      weightKg: Number(weightKg) || metrics.weightKg,
      workoutsPerWeek: workouts,
      goalType,
      diet,
      targetWeightKg: wantsTarget && targetWeightKg ? Number(targetWeightKg) : undefined,
      targetDate: wantsTarget && targetDate ? targetDate : undefined,
    };
    const goals = computeGoals(nextMetrics);
    completeOnboarding({ name: profile.name, metrics: nextMetrics, goals });
    setCalories(String(goals.calories));
    notify(`New daily target: ${goals.calories} kcal.`);
  }

  async function onToggleNotifications(value: boolean) {
    if (value) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        if (Platform.OS !== 'web') {
          Alert.alert('Notifications off', 'Enable notifications for CalAI in your device settings.');
        }
        return;
      }
      setNotificationsEnabled(true);
      await scheduleDailyReminder();
    } else {
      setNotificationsEnabled(false);
      await cancelReminders();
    }
  }

  function onSignOut() {
    if (Platform.OS === 'web') {
      signOut();
      return;
    }
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <Screen title="Profile" subtitle="Your account and goals">
      {/* Account */}
      <Appear delay={60}>
        <Card variant="raised">
          <View style={styles.account}>
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.avatar, Shadow.glow(theme.tint)]}>
              <ThemedText type="title" style={styles.avatarText}>
                {(session?.name ?? profile.name).charAt(0).toUpperCase()}
              </ThemedText>
            </LinearGradient>
            <View style={styles.accountInfo}>
              <ThemedText type="smallBold" style={styles.accountName}>
                {session?.name ?? profile.name}
              </ThemedText>
              {session?.email ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {session.email}
                </ThemedText>
              ) : null}
            </View>
          </View>
          <Button title="Log out" icon="log-out-outline" variant="secondary" onPress={onSignOut} />
        </Card>
      </Appear>

      {/* Appearance */}
      <Appear delay={110}>
        <Card>
          <ThemedText type="smallBold">Appearance</ThemedText>
          <Segmented
            value={profile.theme}
            onChange={(t: ThemePreference) => setTheme(t)}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Card>
      </Appear>

      {/* Units */}
      <Appear delay={150}>
        <Card>
          <ThemedText type="smallBold">Units</ThemedText>
          <Segmented
            value={profile.units}
            onChange={(u: UnitSystem) => setUnits(u)}
            options={[
              { value: 'metric', label: 'Metric (kg, cm)' },
              { value: 'imperial', label: 'Imperial (lb, ft)' },
            ]}
          />
        </Card>
      </Appear>

      {/* Reminders */}
      <Appear delay={190}>
        <Card>
        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <ThemedText type="smallBold">Streak reminders</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              A daily nudge and a cheer when you extend your streak.
            </ThemedText>
          </View>
          <Switch
            value={profile.notificationsEnabled}
            onValueChange={onToggleNotifications}
            trackColor={{ true: theme.tint }}
          />
        </View>
        {Platform.OS === 'web' && (
          <ThemedText type="small" themeColor="textSecondary">
            Notifications are only available on the iOS and Android apps.
          </ThemedText>
        )}
        </Card>
      </Appear>

      {/* Daily target */}
      <Appear delay={230}>
        <Card>
          <ThemedText type="subtitle" style={styles.cardTitle}>
            Daily target
          </ThemedText>
          <Field
            label="Calorie goal"
            value={calories}
            onChangeText={setCalories}
            keyboardType="number-pad"
            suffix="kcal"
          />
          <ThemedText type="small" themeColor="textSecondary">
            Macro split: {macros.protein}g P · {macros.carbs}g C · {macros.fat}g F
          </ThemedText>
          <Button title="Save goal" icon="checkmark" onPress={onSaveCalories} />
        </Card>
      </Appear>

      {/* Recalculate plan */}
      {metrics && (
        <Appear delay={270}>
        <Card>
          <ThemedText type="subtitle" style={styles.cardTitle}>
            Recalculate plan
          </ThemedText>

          <Field
            label="Current weight"
            value={weightKg}
            onChangeText={setWeightKg}
            keyboardType="decimal-pad"
            suffix="kg"
          />

          <View style={styles.field}>
            <ThemedText type="smallBold">Workouts / week</ThemedText>
            <Segmented
              value={workouts}
              onChange={setWorkouts}
              options={WORKOUT_BUCKETS.map((w) => ({ value: w, label: w }))}
            />
          </View>

          <View style={styles.field}>
            <ThemedText type="smallBold">Goal</ThemedText>
            <Segmented
              wrap
              value={goalType}
              onChange={setGoalType}
              options={GOAL_TYPES.map((g) => ({ value: g, label: GOAL_LABEL[g] }))}
            />
          </View>

          <View style={styles.field}>
            <ThemedText type="smallBold">Diet</ThemedText>
            <Segmented
              wrap
              value={diet}
              onChange={setDiet}
              options={DIET_TYPES.map((d) => ({ value: d, label: DIET_LABEL[d] }))}
            />
          </View>

          {wantsTarget && (
            <>
              <Field
                label="Target weight"
                value={targetWeightKg}
                onChangeText={setTargetWeightKg}
                keyboardType="decimal-pad"
                suffix="kg"
              />
              <View style={styles.field}>
                <ThemedText type="smallBold">Reach it by</ThemedText>
                <Segmented
                  wrap
                  value={timeframe}
                  onChange={setTimeframe}
                  options={[
                    { value: '30', label: '1 mo' },
                    { value: '60', label: '2 mo' },
                    { value: '90', label: '3 mo' },
                    { value: '180', label: '6 mo' },
                    { value: 'custom', label: 'Pick date' },
                  ]}
                />
                {isCustomDate ? (
                  <DateField label="Target date" value={customDate} onChange={setCustomDate} futureOnly />
                ) : targetDate ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Target date: {relativeDayLabel(targetDate)}.
                  </ThemedText>
                ) : null}
              </View>
            </>
          )}

          {metrics.targetDate && !targetDate && (
            <ThemedText type="small" themeColor="textSecondary">
              Current target date: {relativeDayLabel(metrics.targetDate)}.
            </ThemedText>
          )}

          <Button
            title="Recalculate my plan"
            icon="sparkles"
            onPress={onRecalculate}
            disabled={wantsTarget && isCustomDate && !customDate}
          />
        </Card>
        </Appear>
      )}

      {/* About */}
      <Appear delay={310}>
        <Card>
          <ThemedText type="subtitle" style={styles.cardTitle}>
            About
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            CalAI food estimates come from an on-device heuristic in{' '}
            <ThemedText type="code">src/lib/ai.ts</ThemedText>. Swap it for your own vision-model
            backend to power real photo analysis.
          </ThemedText>
        </Card>
      </Appear>
    </Screen>
  );
}

const styles = StyleSheet.create({
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 26,
    lineHeight: 32,
    color: '#FFFFFF',
  },
  accountInfo: {
    flex: 1,
    gap: 2,
  },
  accountName: {
    fontSize: 17,
  },
  cardTitle: {
    fontSize: 20,
    lineHeight: 26,
  },
  field: {
    gap: Spacing.two,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  toggleText: {
    flex: 1,
    gap: Spacing.half,
  },
});
