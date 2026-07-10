import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DateField } from '@/components/date-field';
import { Field } from '@/components/field';
import { MacroRow } from '@/components/macro-row';
import { OptionCards } from '@/components/option-card';
import { ProgressBar } from '@/components/progress-bar';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WeightPicker } from '@/components/weight-picker';
import { GoogleButton } from '@/app/(auth)/sign-in';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useDiary } from '@/context/DiaryContext';
import { useTheme } from '@/hooks/use-theme';
import {
  addDays,
  ageFromBirthDate,
  computeGoals,
  DIET_LABEL,
  fromDateKey,
  ftInToCm,
  GOAL_LABEL,
  kgToLb,
  lbToKg,
  relativeDayLabel,
  toDateKey,
  WORKOUT_LABEL,
} from '@/lib/nutrition';
import type { DietType, GoalType, Sex, UserMetrics, WorkoutsPerWeek } from '@/types';

type StepId =
  | 'sex'
  | 'workouts'
  | 'height'
  | 'weight'
  | 'birth'
  | 'goal'
  | 'target'
  | 'diet'
  | 'review'
  | 'calculating'
  | 'plan'
  | 'account';

const TIMEFRAMES = [
  { label: '1 mo', days: 30 },
  { label: '2 mo', days: 60 },
  { label: '3 mo', days: 90 },
  { label: '6 mo', days: 180 },
];

export default function OnboardingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { completeOnboarding, setUnits } = useDiary();
  const { signInWithGoogle, signUpWithEmail, usesSupabase } = useAuth();

  // Answers.
  const [sex, setSex] = useState<Sex | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutsPerWeek | null>(null);
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>('cm');
  const [cmStr, setCmStr] = useState('');
  const [ftStr, setFtStr] = useState('');
  const [inStr, setInStr] = useState('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
  const [weightVal, setWeightVal] = useState(70); // in current weightUnit
  const [birthDate, setBirthDate] = useState(''); // YYYY-MM-DD
  const [goalType, setGoalType] = useState<GoalType | null>(null);
  const [targetVal, setTargetVal] = useState(65); // in current weightUnit
  const [timeframe, setTimeframe] = useState('60'); // preset days, or 'custom'
  const [customDate, setCustomDate] = useState(''); // YYYY-MM-DD when timeframe==='custom'
  const [diet, setDiet] = useState<DietType | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const wantsTarget = goalType === 'lose' || goalType === 'gain';
  const isCustomDate = timeframe === 'custom';
  const targetDate = wantsTarget
    ? isCustomDate
      ? customDate
      : addDays(toDateKey(), Number(timeframe))
    : undefined;

  // Ordered flow (target step only when relevant).
  const flow = useMemo<StepId[]>(() => {
    const base: StepId[] = ['sex', 'workouts', 'height', 'weight', 'birth', 'goal'];
    if (wantsTarget) base.push('target');
    base.push('diet', 'review', 'calculating', 'plan', 'account');
    return base;
  }, [wantsTarget]);

  const [stepId, setStepId] = useState<StepId>('sex');
  const returnToReview = useRef(false);

  // Derived metric values.
  const heightCm = heightUnit === 'cm' ? Number(cmStr) : ftInToCm(Number(ftStr), Number(inStr));
  const weightKg = weightUnit === 'kg' ? weightVal : lbToKg(weightVal);
  const targetKg = weightUnit === 'kg' ? targetVal : lbToKg(targetVal);
  const age = birthDate ? ageFromBirthDate(birthDate) : 0;

  const metrics = useMemo<UserMetrics | null>(() => {
    if (!sex || !workouts || !goalType || !diet) return null;
    if (!heightCm || !weightKg || !birthDate) return null;
    return {
      sex,
      birthDate,
      heightCm: Math.round(heightCm),
      weightKg: Math.round(weightKg * 10) / 10,
      workoutsPerWeek: workouts,
      goalType,
      diet,
      targetWeightKg: wantsTarget ? Math.round(targetKg * 10) / 10 : undefined,
      targetDate,
    };
  }, [sex, workouts, goalType, diet, heightCm, weightKg, birthDate, wantsTarget, targetKg, targetDate]);

  const goals = useMemo(() => (metrics ? computeGoals(metrics) : null), [metrics]);

  // Toggle weight unit → convert current values so the number stays sensible.
  function toggleWeightUnit(u: 'kg' | 'lbs') {
    if (u === weightUnit) return;
    const conv = u === 'lbs' ? kgToLb : lbToKg;
    setWeightVal((v) => Math.round(conv(v) * 10) / 10);
    setTargetVal((v) => Math.round(conv(v) * 10) / 10);
    setWeightUnit(u);
  }

  const validators: Partial<Record<StepId, boolean>> = {
    sex: sex !== null,
    workouts: workouts !== null,
    height: heightCm >= 100 && heightCm <= 250,
    weight: weightKg >= 30 && weightKg <= 300,
    birth: birthDate !== '' && age >= 13 && age <= 100,
    goal: goalType !== null,
    target: !wantsTarget || ((targetKg >= 30 && targetKg <= 300) && !!targetDate),
    diet: diet !== null,
    review: true,
    plan: true,
  };
  const canContinue = validators[stepId] ?? true;

  function goNext() {
    if (returnToReview.current && isInputStep(stepId)) {
      returnToReview.current = false;
      setStepId('review');
      return;
    }
    const idx = flow.indexOf(stepId);
    setStepId(flow[Math.min(idx + 1, flow.length - 1)]);
  }

  function goBack() {
    const idx = flow.indexOf(stepId);
    if (idx > 0) setStepId(flow[idx - 1]);
  }

  function editStep(id: StepId) {
    returnToReview.current = true;
    setStepId(id);
  }

  async function finish(provider: 'google' | 'email') {
    if (!metrics || !goals) return;
    const finalName = name.trim() || (provider === 'email' ? email.split('@')[0] : 'You');
    setAuthError(null);

    if (provider === 'google') {
      const err = await signInWithGoogle();
      if (err) {
        setAuthError(err);
        return;
      }
    } else {
      setAuthBusy(true);
      const err = await signUpWithEmail(finalName, email.trim(), password);
      setAuthBusy(false);
      if (err) {
        setAuthError(err);
        return;
      }
    }

    // Auth succeeded — persist the plan. DiaryContext seeds the cloud from this.
    setUnits(weightUnit === 'lbs' ? 'imperial' : 'metric');
    completeOnboarding({ name: finalName, metrics, goals });
  }

  // Progress across the *input* steps only.
  const inputSteps = flow.filter(isInputStep);
  const inputIndex = inputSteps.indexOf(stepId);
  const showProgress = inputIndex >= 0;

  return (
    <ThemedView style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Top bar: back + progress */}
        <View style={[styles.topBar, { paddingTop: insets.top + Spacing.two }]}>
          <Pressable onPress={goBack} hitSlop={10} disabled={flow.indexOf(stepId) === 0} style={styles.backBtn}>
            <Ionicons
              name="chevron-back"
              size={26}
              color={flow.indexOf(stepId) === 0 ? 'transparent' : theme.text}
            />
          </Pressable>
          <View style={styles.progressWrap}>
            {showProgress && (
              <ProgressBar value={(inputIndex + 1) / inputSteps.length} height={6} />
            )}
          </View>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Spacing.four }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.column}>
            <StepBody
              stepId={stepId}
              theme={theme}
              // values + setters
              sex={sex}
              setSex={setSex}
              workouts={workouts}
              setWorkouts={setWorkouts}
              heightUnit={heightUnit}
              setHeightUnit={setHeightUnit}
              cmStr={cmStr}
              setCmStr={setCmStr}
              ftStr={ftStr}
              setFtStr={setFtStr}
              inStr={inStr}
              setInStr={setInStr}
              weightUnit={weightUnit}
              toggleWeightUnit={toggleWeightUnit}
              weightVal={weightVal}
              setWeightVal={setWeightVal}
              birthDate={birthDate}
              setBirthDate={setBirthDate}
              age={age}
              goalType={goalType}
              setGoalType={setGoalType}
              targetVal={targetVal}
              setTargetVal={setTargetVal}
              timeframe={timeframe}
              setTimeframe={setTimeframe}
              customDate={customDate}
              setCustomDate={setCustomDate}
              targetDate={targetDate}
              diet={diet}
              setDiet={setDiet}
              name={name}
              setName={setName}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              usesSupabase={usesSupabase}
              authError={authError}
              authBusy={authBusy}
              metrics={metrics}
              goals={goals}
              onEdit={editStep}
              onCalcDone={goNext}
              onGoogle={() => finish('google')}
              onEmail={() => finish('email')}
            />
          </View>
        </ScrollView>

        {/* Footer button for standard steps */}
        {stepId !== 'calculating' && stepId !== 'account' && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three, borderTopColor: theme.border }]}>
            <View style={styles.footerInner}>
              <Button
                title={
                  stepId === 'review' ? "Looks good" : stepId === 'plan' ? 'Continue' : 'Continue'
                }
                onPress={goNext}
                disabled={!canContinue}
              />
              {stepId === 'plan' && (
                <Pressable onPress={() => setStepId('review')} style={styles.editLink}>
                  <ThemedText type="smallBold" style={{ color: theme.tint }}>
                    Edit my answers
                  </ThemedText>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function isInputStep(id: StepId): boolean {
  return ['sex', 'workouts', 'height', 'weight', 'birth', 'goal', 'target', 'diet'].includes(id);
}

// ---------------------------------------------------------------------------
// Step bodies
// ---------------------------------------------------------------------------

type StepBodyProps = {
  stepId: StepId;
  theme: ReturnType<typeof useTheme>;
  sex: Sex | null;
  setSex: (v: Sex) => void;
  workouts: WorkoutsPerWeek | null;
  setWorkouts: (v: WorkoutsPerWeek) => void;
  heightUnit: 'cm' | 'ft';
  setHeightUnit: (v: 'cm' | 'ft') => void;
  cmStr: string;
  setCmStr: (v: string) => void;
  ftStr: string;
  setFtStr: (v: string) => void;
  inStr: string;
  setInStr: (v: string) => void;
  weightUnit: 'kg' | 'lbs';
  toggleWeightUnit: (v: 'kg' | 'lbs') => void;
  weightVal: number;
  setWeightVal: (v: number) => void;
  birthDate: string;
  setBirthDate: (v: string) => void;
  age: number;
  goalType: GoalType | null;
  setGoalType: (v: GoalType) => void;
  targetVal: number;
  setTargetVal: (v: number) => void;
  timeframe: string;
  setTimeframe: (v: string) => void;
  customDate: string;
  setCustomDate: (v: string) => void;
  targetDate?: string;
  diet: DietType | null;
  setDiet: (v: DietType) => void;
  name: string;
  setName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  usesSupabase: boolean;
  authError: string | null;
  authBusy: boolean;
  metrics: UserMetrics | null;
  goals: ReturnType<typeof computeGoals> | null;
  onEdit: (id: StepId) => void;
  onCalcDone: () => void;
  onGoogle: () => void;
  onEmail: () => void;
};

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.heading}>
      <ThemedText type="title" style={styles.title}>
        {title}
      </ThemedText>
      {subtitle ? (
        <ThemedText type="default" themeColor="textSecondary">
          {subtitle}
        </ThemedText>
      ) : null}
    </View>
  );
}

function StepBody(p: StepBodyProps) {
  const { stepId, theme } = p;

  switch (stepId) {
    case 'sex':
      return (
        <>
          <Header title="What's your sex?" subtitle="Used only to estimate your energy needs." />
          <OptionCards
            value={p.sex}
            onChange={p.setSex}
            options={[
              { value: 'male', label: 'Male', icon: 'male' },
              { value: 'female', label: 'Female', icon: 'female' },
            ]}
          />
        </>
      );

    case 'workouts':
      return (
        <>
          <Header title="How often do you work out?" subtitle="Sessions in a typical week." />
          <OptionCards
            value={p.workouts}
            onChange={p.setWorkouts}
            options={[
              { value: '0-2', label: '0–2', hint: 'Little to no exercise', icon: 'walk' },
              { value: '3-5', label: '3–5', hint: 'A few times a week', icon: 'bicycle' },
              { value: '6+', label: '6+', hint: 'Nearly every day', icon: 'barbell' },
            ]}
          />
        </>
      );

    case 'height':
      return (
        <>
          <Header title="How tall are you?" />
          <Segmented
            value={p.heightUnit}
            onChange={p.setHeightUnit}
            options={[
              { value: 'cm', label: 'cm' },
              { value: 'ft', label: 'ft / in' },
            ]}
          />
          {p.heightUnit === 'cm' ? (
            <Field label="Height" value={p.cmStr} onChangeText={p.setCmStr} keyboardType="number-pad" placeholder="178" suffix="cm" />
          ) : (
            <View style={styles.row}>
              <View style={styles.flex}>
                <Field label="Feet" value={p.ftStr} onChangeText={p.setFtStr} keyboardType="number-pad" placeholder="5" suffix="ft" />
              </View>
              <View style={styles.flex}>
                <Field label="Inches" value={p.inStr} onChangeText={p.setInStr} keyboardType="number-pad" placeholder="10" suffix="in" />
              </View>
            </View>
          )}
        </>
      );

    case 'weight':
      return (
        <>
          <Header title="Your current weight" subtitle="Drag the slider or type it in exactly." />
          <WeightPicker
            unit={p.weightUnit}
            onToggleUnit={p.toggleWeightUnit}
            value={p.weightVal}
            onChange={p.setWeightVal}
          />
        </>
      );

    case 'birth':
      return (
        <>
          <Header title="When were you born?" />
          <DateField label="Date of birth" value={p.birthDate} onChange={p.setBirthDate} />
          {p.birthDate ? (
            <ThemedText type="small" themeColor="textSecondary">
              You are {p.age} years old.
            </ThemedText>
          ) : null}
        </>
      );

    case 'goal':
      return (
        <>
          <Header title="What's your goal?" />
          <OptionCards
            value={p.goalType}
            onChange={p.setGoalType}
            options={[
              { value: 'lose', label: 'Lose weight', icon: 'trending-down' },
              { value: 'maintain', label: 'Maintain', icon: 'remove' },
              { value: 'gain', label: 'Gain weight', icon: 'trending-up' },
            ]}
          />
        </>
      );

    case 'target':
      return (
        <>
          <Header title="What's your target weight?" subtitle="And when do you want to reach it?" />
          <WeightPicker
            unit={p.weightUnit}
            onToggleUnit={p.toggleWeightUnit}
            value={p.targetVal}
            onChange={p.setTargetVal}
            min={p.weightUnit === 'kg' ? 40 : 88}
            max={p.weightUnit === 'kg' ? 160 : 350}
          />
          <View style={styles.field}>
            <ThemedText type="smallBold">Reach it by</ThemedText>
            <Segmented
              wrap
              value={p.timeframe}
              onChange={p.setTimeframe}
              options={[...TIMEFRAMES.map((t) => ({ value: String(t.days), label: t.label })), { value: 'custom', label: 'Pick date' }]}
            />
            {p.timeframe === 'custom' ? (
              <DateField label="Target date" value={p.customDate} onChange={p.setCustomDate} futureOnly />
            ) : p.targetDate ? (
              <ThemedText type="small" themeColor="textSecondary">
                Target date: {relativeDayLabel(p.targetDate)}.
              </ThemedText>
            ) : null}
          </View>
        </>
      );

    case 'diet':
      return (
        <>
          <Header title="Any specific diet?" subtitle="We'll tune your macro targets to match." />
          <OptionCards
            value={p.diet}
            onChange={p.setDiet}
            options={[
              { value: 'balanced', label: 'Balanced', icon: 'restaurant' },
              { value: 'vegetarian', label: 'Vegetarian', icon: 'leaf' },
              { value: 'vegan', label: 'Vegan', icon: 'nutrition' },
              { value: 'pescatarian', label: 'Pescatarian', icon: 'fish' },
              { value: 'keto', label: 'Keto', icon: 'flame' },
            ]}
          />
        </>
      );

    case 'review':
      return <ReviewStep {...p} />;

    case 'calculating':
      return <CalculatingStep onDone={p.onCalcDone} />;

    case 'plan':
      return <PlanStep goals={p.goals} metrics={p.metrics} weightUnit={p.weightUnit} />;

    case 'account':
      return <AccountStep {...p} />;

    default:
      return null;
  }
}

function ReviewStep(p: StepBodyProps) {
  const rows: { id: StepId; label: string; value: string }[] = [
    { id: 'sex', label: 'Sex', value: cap(p.sex ?? '') },
    { id: 'workouts', label: 'Workouts', value: p.workouts ? WORKOUT_LABEL[p.workouts] : '' },
    { id: 'height', label: 'Height', value: heightLabel(p) },
    { id: 'weight', label: 'Weight', value: `${round1(p.weightVal)} ${p.weightUnit}` },
    { id: 'birth', label: 'Age', value: `${p.age} yrs` },
    { id: 'goal', label: 'Goal', value: p.goalType ? GOAL_LABEL[p.goalType] : '' },
  ];
  if (p.goalType === 'lose' || p.goalType === 'gain') {
    rows.push({ id: 'target', label: 'Target', value: `${round1(p.targetVal)} ${p.weightUnit}` });
    if (p.targetDate) {
      rows.push({
        id: 'target',
        label: 'By',
        value: fromDateKey(p.targetDate).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      });
    }
  }
  rows.push({ id: 'diet', label: 'Diet', value: p.diet ? DIET_LABEL[p.diet] : '' });

  return (
    <>
      <Header title="Does this look right?" subtitle="Tap anything to change it." />
      <Card style={styles.reviewCard}>
        {rows.map((r, i) => (
          <Pressable
            key={r.label}
            onPress={() => p.onEdit(r.id)}
            style={[styles.reviewRow, i < rows.length - 1 && { borderBottomColor: p.theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <ThemedText type="small" themeColor="textSecondary">
              {r.label}
            </ThemedText>
            <View style={styles.reviewValue}>
              <ThemedText type="smallBold">{r.value}</ThemedText>
              <Ionicons name="chevron-forward" size={16} color={p.theme.textSecondary} />
            </View>
          </Pressable>
        ))}
      </Card>
    </>
  );
}

function CalculatingStep({ onDone }: { onDone: () => void }) {
  const [pct, setPct] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    const started = Date.now();
    const duration = 2200;
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / duration);
      setPct(t);
      if (t >= 1 && !done.current) {
        done.current = true;
        clearInterval(id);
        setTimeout(onDone, 250);
      }
    }, 40);
    return () => clearInterval(id);
  }, [onDone]);

  const messages = ['Analyzing your metrics', 'Estimating your metabolism', 'Building your plan'];
  const msg = messages[Math.min(messages.length - 1, Math.floor(pct * messages.length))];

  return (
    <View style={styles.calc}>
      <ThemedText style={styles.calcPct}>{Math.round(pct * 100)}%</ThemedText>
      <View style={styles.calcBar}>
        <ProgressBar value={pct} height={10} />
      </View>
      <ThemedText type="default" themeColor="textSecondary">
        {msg}…
      </ThemedText>
    </View>
  );
}

function PlanStep({
  goals,
  metrics,
  weightUnit,
}: {
  goals: ReturnType<typeof computeGoals> | null;
  metrics: UserMetrics | null;
  weightUnit: 'kg' | 'lbs';
}) {
  const theme = useTheme();
  if (!goals) return null;
  return (
    <>
      <Header title="Your daily plan is ready 🎉" subtitle="You can fine-tune this anytime in your profile." />
      <Card style={styles.planCard}>
        <View style={[styles.planBadge, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="flame" size={16} color={theme.tint} />
          <ThemedText type="small" themeColor="textSecondary">
            Recommended
          </ThemedText>
        </View>
        <View style={styles.planHeadline}>
          <ThemedText style={styles.planNumber} themeColor="tint">
            {goals.calories}
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            calories per day
          </ThemedText>
        </View>
        <MacroRow consumed={{ protein: 0, carbs: 0, fat: 0 }} goal={goals.macros} />
        {metrics?.targetDate && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            On track for {Math.round(metrics.targetWeightKg && weightUnit === 'lbs' ? kgToLb(metrics.targetWeightKg) : metrics.targetWeightKg ?? 0)} {weightUnit} by {relativeDayLabel(metrics.targetDate)}.
          </ThemedText>
        )}
      </Card>
    </>
  );
}

function AccountStep(p: StepBodyProps) {
  const validEmail = /.+@.+\..+/.test(p.email.trim());
  // A real backend requires a password (min 6 chars); mock mode does not.
  const canCreate = validEmail && (!p.usesSupabase || p.password.length >= 6);
  return (
    <>
      <Header title="Save your progress" subtitle="Create an account so your plan is always with you." />
      <View style={styles.field}>
        <Field label="Your name" value={p.name} onChangeText={p.setName} placeholder="Alex" />
      </View>
      {!p.usesSupabase && (
        <>
          <GoogleButton onPress={p.onGoogle} />
          <View style={styles.divider}>
            <View style={[styles.line, { backgroundColor: p.theme.border }]} />
            <ThemedText type="small" themeColor="textSecondary">
              or
            </ThemedText>
            <View style={[styles.line, { backgroundColor: p.theme.border }]} />
          </View>
        </>
      )}
      <Field
        label="Email"
        value={p.email}
        onChangeText={p.setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />
      {p.usesSupabase && (
        <Field
          label="Password"
          value={p.password}
          onChangeText={p.setPassword}
          placeholder="At least 6 characters"
          secureTextEntry
          autoCapitalize="none"
        />
      )}
      {p.authError && (
        <ThemedText type="small" themeColor="danger">
          {p.authError}
        </ThemedText>
      )}
      <Button title="Create account" onPress={p.onEmail} disabled={!canCreate} loading={p.authBusy} />
    </>
  );
}

// Helpers for the review labels.
function heightLabel(p: StepBodyProps): string {
  if (p.heightUnit === 'cm') return `${p.cmStr || '–'} cm`;
  return `${p.ftStr || '–'}' ${p.inStr || '0'}"`;
}
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const round1 = (n: number) => Math.round(n * 10) / 10;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  backBtn: {
    width: 26,
  },
  progressWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.four,
  },
  heading: {
    gap: Spacing.two,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  field: {
    gap: Spacing.three,
  },
  weightValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  bigWeight: {
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '800',
  },
  reviewCard: {
    paddingVertical: Spacing.one,
    gap: 0,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
  },
  reviewValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  calc: {
    alignItems: 'center',
    gap: Spacing.four,
    paddingVertical: Spacing.six,
  },
  calcPct: {
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '800',
  },
  calcBar: {
    width: '100%',
  },
  planCard: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
  },
  planHeadline: {
    alignItems: 'center',
    gap: Spacing.half,
  },
  planNumber: {
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '800',
  },
  center: {
    textAlign: 'center',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    alignItems: 'center',
  },
  footerInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.two,
  },
  editLink: {
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
});
