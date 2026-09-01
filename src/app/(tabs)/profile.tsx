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
import { Spacing, Radius } from '@/constants/theme';
import { useGradients } from '@/hooks/use-gradients';
import { useAuth } from '@/context/AuthContext';
import { useDiary } from '@/context/DiaryContext';
import { useTheme } from '@/hooks/use-theme';
import {
  addDays,
  computeGoals,
  DIET_LABEL,
  GOAL_LABEL,
  kgToLb,
  lbToKg,
  macrosFromCalories,
  relativeDayLabel,
  toDateKey,
} from '@/lib/nutrition';
import {
  formatTenths,
  fromTenths,
  parseWeightInput,
  sanitizeWeightText,
  toTenths,
  type WeightUnit,
} from '@/lib/weight-input';
import { exportBackup, pickBackup, saveFile } from '@/lib/backup';
import { backupFilename, serializeBackup, toCsv } from '@/lib/backup-format';
import { requestNotificationPermission } from '@/lib/notifications';
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

/** What the "Your data" card says about where the diary is stored. */
const SYNC_COPY: Record<string, string> = {
  local: 'Saved on this phone only. No backend is configured, so an export is your only backup.',
  'signed-out': 'Saved on this phone. Sign in to mirror your diary to the cloud as well.',
  syncing: 'Syncing with the cloud…',
  synced: 'Saved on this phone and mirrored to the cloud.',
  error:
    "Saved on this phone. The last cloud sync failed — nothing was lost, and it will retry next time you open the app.",
};

function notify(msg: string) {
  if (Platform.OS === 'web') return;
  Alert.alert('Saved', msg);
}

export default function ProfileScreen() {
  const theme = useTheme();
  const gradients = useGradients();
  const { session, signOut } = useAuth();
  const {
    profile,
    entries,
    weights,
    savedFoods,
    updateGoals,
    setUnits,
    setTheme,
    completeOnboarding,
    setNotificationsEnabled,
    syncStatus,
    restore,
  } = useDiary();
  const metrics = profile.metrics;

  const [calories, setCalories] = useState(String(profile.goals.calories));

  /**
   * These two fields are shown in the unit the rest of the app uses, and stored
   * in kilograms like everything else. They used to be labelled "kg" whatever
   * `profile.units` said, so an imperial user typing the number they weigh
   * ("180") silently set their metrics to 180 kg — and the plan built on it.
   */
  const unitLabel: WeightUnit = profile.units === 'imperial' ? 'lbs' : 'kg';
  const toDisplay = (kg: number) => formatTenths(toTenths(unitLabel === 'lbs' ? kgToLb(kg) : kg));
  const toKg = (text: string): number | null => {
    const tenths = parseWeightInput(text);
    if (tenths == null) return null;
    const value = fromTenths(tenths);
    return Math.round((unitLabel === 'lbs' ? lbToKg(value) : value) * 10) / 10;
  };

  const [weightKg, setWeightKg] = useState(metrics ? toDisplay(metrics.weightKg) : '');
  const [workouts, setWorkouts] = useState<WorkoutsPerWeek>(metrics?.workoutsPerWeek ?? '3-5');
  const [goalType, setGoalType] = useState<GoalType>(metrics?.goalType ?? 'maintain');
  const [diet, setDiet] = useState<DietType>(metrics?.diet ?? 'balanced');
  const [targetWeightKg, setTargetWeightKg] = useState(
    metrics?.targetWeightKg != null ? toDisplay(metrics.targetWeightKg) : '',
  );
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
      weightKg: toKg(weightKg) ?? metrics.weightKg,
      workoutsPerWeek: workouts,
      goalType,
      diet,
      targetWeightKg: wantsTarget ? (toKg(targetWeightKg) ?? undefined) : undefined,
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
    }
    // Scheduling is not done here. Flipping the preference is enough: the
    // reminder is reconciled against the diary from one place at the root, so
    // there is no second scheduler that could disagree with it.
    setNotificationsEnabled(value);
  }

  const [busy, setBusy] = useState<'export' | 'csv' | 'import' | null>(null);

  function report(title: string, message: string) {
    if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
    else Alert.alert(title, message);
  }

  async function onExportJson() {
    setBusy('export');
    try {
      await exportBackup(serializeBackup({ profile, entries, weights, savedFoods }));
    } catch (err) {
      report('Export failed', err instanceof Error ? err.message : 'Could not write the file.');
    } finally {
      setBusy(null);
    }
  }

  async function onExportCsv() {
    setBusy('csv');
    try {
      await saveFile(toCsv(entries), backupFilename().replace(/\.json$/, '.csv'), 'text/csv');
    } catch (err) {
      report('Export failed', err instanceof Error ? err.message : 'Could not write the file.');
    } finally {
      setBusy(null);
    }
  }

  async function onImport() {
    setBusy('import');
    try {
      const result = await pickBackup();
      if (!result) return; // cancelled
      if (!result.ok || !result.backup) {
        report('Could not restore', result.error ?? 'That file could not be read.');
        return;
      }
      const { entriesAdded, weightsAdded } = restore(result.backup);
      const skipped = result.skipped ? ` ${result.skipped} damaged record(s) were skipped.` : '';
      report(
        'Restored',
        `Added ${entriesAdded} food ${entriesAdded === 1 ? 'entry' : 'entries'} and ${weightsAdded} ` +
          `weigh-in${weightsAdded === 1 ? '' : 's'}. Nothing already in your diary was changed.${skipped}`,
      );
    } catch (err) {
      report('Could not restore', err instanceof Error ? err.message : 'That file could not be read.');
    } finally {
      setBusy(null);
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
    <Screen brand title="Profile" subtitle="Your account and goals">
      {/* Account */}
      <Appear delay={60}>
        <Card variant="raised">
          <View style={styles.account}>
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}>
              <ThemedText type="title" style={[styles.avatarText, { color: theme.onTint }]}>
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
          <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
            Appearance
          </ThemedText>
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
          <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
            Units
          </ThemedText>
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
            <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
              Daily reminder
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              One nudge at noon, and only on days you haven&apos;t logged anything yet.
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
            onChangeText={(t) => setWeightKg(sanitizeWeightText(t))}
            keyboardType="decimal-pad"
            suffix={unitLabel}
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
                onChangeText={(t) => setTargetWeightKg(sanitizeWeightText(t))}
                keyboardType="decimal-pad"
                suffix={unitLabel}
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

      {/* Your data */}
      <Appear delay={310}>
        <Card>
          <ThemedText type="subtitle" style={styles.cardTitle}>
            Your data
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {SYNC_COPY[syncStatus]}
          </ThemedText>

          <View style={styles.field}>
            <Button
              title="Export backup (JSON)"
              icon="download-outline"
              variant="secondary"
              loading={busy === 'export'}
              disabled={busy !== null}
              onPress={onExportJson}
            />
            <Button
              title="Export for spreadsheets (CSV)"
              icon="grid-outline"
              variant="secondary"
              loading={busy === 'csv'}
              disabled={busy !== null}
              onPress={onExportCsv}
            />
            <Button
              title="Restore from backup"
              icon="cloud-upload-outline"
              variant="secondary"
              loading={busy === 'import'}
              disabled={busy !== null}
              onPress={onImport}
            />
          </View>

          <ThemedText type="small" themeColor="textSecondary">
            {entries.length} logged {entries.length === 1 ? 'food' : 'foods'} and {weights.length}{' '}
            weigh-{weights.length === 1 ? 'in' : 'ins'}. Restoring only ever adds history back —
            it never overwrites what is already here. Meal photos stay on this phone and are not
            part of a backup.
          </ThemedText>
        </Card>
      </Appear>

      {/* About */}
      <Appear delay={350}>
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
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 34,
    lineHeight: 40,
  },
  accountInfo: {
    alignItems: 'center',
    gap: 2,
  },
  accountName: {
    fontSize: 20,
    lineHeight: 26,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
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
