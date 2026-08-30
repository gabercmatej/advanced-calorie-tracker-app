import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LinearGradient } from 'expo-linear-gradient';

import { Button } from '@/components/button';
import { CalorieRing } from '@/components/calorie-ring';
import { Card } from '@/components/card';
import { DateField } from '@/components/date-field';
import { Field } from '@/components/field';
import { MacroRow } from '@/components/macro-row';
import { Appear, CountUp, Floating } from '@/components/motion';
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
import { useGradients } from '@/hooks/use-gradients';
import { useTheme } from '@/hooks/use-theme';
import {
  addDays,
  ageFromBirthDate,
  computeAdaptivePlan,
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
import { StorageKeys, storage } from '@/lib/storage';
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
  | 'account'
  | 'verify';

/**
 * Everything the wizard needs to rebuild itself, saved on every change.
 *
 * Onboarding runs before an account exists, and the confirmation step then
 * sends the user out to their inbox — which on iOS is a realistic chance of the
 * app being evicted. Persisting the answers means coming back resumes rather
 * than restarting. Credentials are deliberately absent: a password has no
 * business in AsyncStorage.
 */
interface OnboardingDraft {
  stepId: StepId;
  sex: Sex | null;
  workouts: WorkoutsPerWeek | null;
  heightUnit: 'cm' | 'ft';
  cmStr: string;
  ftStr: string;
  inStr: string;
  weightUnit: 'kg' | 'lbs';
  weightVal: number;
  birthDate: string;
  goalType: GoalType | null;
  targetVal: number;
  timeframe: string;
  customDate: string;
  diet: DietType | null;
  name: string;
  email: string;
}

const TIMEFRAMES = [
  { label: '1 mo', days: 30 },
  { label: '2 mo', days: 60 },
  { label: '3 mo', days: 90 },
  { label: '6 mo', days: 180 },
];

export default function OnboardingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { completeOnboarding, profile, setName: saveName, setUnits } = useDiary();
  // Captured once, via a lazy initial state: `completeOnboarding` flips this
  // partway through the wizard, and re-reading it live would make the draft
  // effect clear the very input it is meant to restore.
  const [onboardedAlready] = useState(profile.onboarded);
  const {
    signInWithGoogle,
    signUpWithEmail,
    signInWithEmail,
    resendVerification,
    usesSupabase,
    session,
  } = useAuth();

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

  // Ordered flow. The target step appears only when relevant, and the account
  // steps only when there is no session yet — someone who signed in first and
  // is being asked to onboard has nothing to create.
  const alreadySignedIn = session !== null;
  const flow = useMemo<StepId[]>(() => {
    const base: StepId[] = ['sex', 'workouts', 'height', 'weight', 'birth', 'goal'];
    if (wantsTarget) base.push('target');
    base.push('diet', 'review', 'calculating', 'plan');
    if (!alreadySignedIn) base.push('account', 'verify');
    return base;
  }, [wantsTarget, alreadySignedIn]);

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

  /**
   * The plan the app will actually run.
   *
   * `computeGoals` sets protein as a share of calories (40% on a cut), while
   * the adaptive engine sets it from bodyweight at 2 g/kg. For a cutter those
   * disagree badly — 255 g against 166 g at 83 kg — and `DiaryContext` applies
   * the adaptive plan within a second of onboarding finishing. So the wizard
   * used to display, and briefly store, a target that was replaced before the
   * user reached the home screen. Computing the adaptive plan here (with no
   * history yet, so it is the formula case) means the number on the plan card,
   * the number written to storage, and the number on the home screen are the
   * same number from the first frame.
   */
  const goals = useMemo(() => {
    if (!metrics) return null;
    const adaptive = computeAdaptivePlan(metrics, [], [], null);
    return adaptive ? { calories: adaptive.calories, macros: adaptive.macros } : computeGoals(metrics);
  }, [metrics]);

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
    // For an already-signed-in user the plan step is the end of the wizard;
    // saving is what lets the router move them into the app.
    if (stepId === 'plan' && alreadySignedIn) {
      savePlan();
      storage.remove(StorageKeys.onboardingDraft);
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

  // --- Draft: resume where the wizard left off ------------------------------
  const [draftLoaded, setDraftLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    // A draft is stale once the plan is saved *and* an account exists —
    // clearing it here, rather than at the end of the wizard, means it cannot
    // outlive its purpose even if the router unmounts this screen mid-step.
    //
    // Onboarded but signed out is deliberately not stale: that is the user who
    // finished their plan, left to open the confirmation mail, and came back.
    // The draft is what returns them to the account step instead of to the
    // first question of a wizard they have already completed.
    if (onboardedAlready && alreadySignedIn) {
      storage.remove(StorageKeys.onboardingDraft).then(() => {
        if (!cancelled) setDraftLoaded(true);
      });
      return;
    }
    storage.get<OnboardingDraft>(StorageKeys.onboardingDraft).then((d) => {
      if (cancelled || !d) {
        if (!cancelled) setDraftLoaded(true);
        return;
      }
      setSex(d.sex);
      setWorkouts(d.workouts);
      setHeightUnit(d.heightUnit);
      setCmStr(d.cmStr);
      setFtStr(d.ftStr);
      setInStr(d.inStr);
      setWeightUnit(d.weightUnit);
      setWeightVal(d.weightVal);
      setBirthDate(d.birthDate);
      setGoalType(d.goalType);
      setTargetVal(d.targetVal);
      setTimeframe(d.timeframe);
      setCustomDate(d.customDate);
      setDiet(d.diet);
      setName(d.name);
      setEmail(d.email);
      // Never resume onto 'calculating' (it auto-advances) or 'verify' (which
      // would poll for a sign-up this session never made).
      setStepId(d.stepId === 'calculating' ? 'review' : d.stepId === 'verify' ? 'account' : d.stepId);
      setDraftLoaded(true);
    });
    return () => {
      cancelled = true;
    };
    // `onboardedAlready` is captured once and never changes; it is listed only
    // to satisfy the exhaustive-deps check.
  }, [onboardedAlready, alreadySignedIn]);

  useEffect(() => {
    if (!draftLoaded) return;
    const draft: OnboardingDraft = {
      stepId,
      sex,
      workouts,
      heightUnit,
      cmStr,
      ftStr,
      inStr,
      weightUnit,
      weightVal,
      birthDate,
      goalType,
      targetVal,
      timeframe,
      customDate,
      diet,
      name,
      email,
    };
    storage.set(StorageKeys.onboardingDraft, draft);
  }, [
    draftLoaded, stepId, sex, workouts, heightUnit, cmStr, ftStr, inStr, weightUnit,
    weightVal, birthDate, goalType, targetVal, timeframe, customDate, diet, name, email,
  ]);

  // --- Save the plan as soon as there *is* one ------------------------------
  //
  // This is the whole fix for onboarding data going missing. It used to run
  // after sign-up returned, which meant every answer lived only in this
  // component's state until an account existed — and with email confirmation
  // turned on, sign-up never "succeeds" in the same session, so the plan was
  // computed, shown, and then dropped. Saving it here makes the profile durable
  // in AsyncStorage before the account step is even reached; whatever happens
  // to sign-up afterwards, the plan is already the user's.
  const planSaved = useRef(false);

  function savePlan() {
    if (!metrics || !goals) return;
    planSaved.current = true;
    setUnits(weightUnit === 'lbs' ? 'imperial' : 'metric');
    completeOnboarding({ metrics, goals });
  }

  useEffect(() => {
    // Only auto-save while signed out. For a signed-in user `onboarded` is what
    // the router gates the app on, so writing it here would tear this screen
    // down before the plan it just computed had been shown.
    if (alreadySignedIn) return;
    if (stepId !== 'plan' || !metrics || !goals || planSaved.current) return;
    planSaved.current = true;
    setUnits(weightUnit === 'lbs' ? 'imperial' : 'metric');
    completeOnboarding({ metrics, goals });
  }, [alreadySignedIn, stepId, metrics, goals, weightUnit, setUnits, completeOnboarding]);

  // Editing an answer after the plan was saved must update the saved plan too,
  // or the review screen and the stored profile quietly disagree.
  useEffect(() => {
    if (!planSaved.current || !metrics || !goals) return;
    completeOnboarding({ metrics, goals });
  }, [metrics, goals, completeOnboarding]);

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
      saveName(finalName);
      await storage.remove(StorageKeys.onboardingDraft);
      return;
    }

    setAuthBusy(true);
    const result = await signUpWithEmail(finalName, email.trim(), password);
    setAuthBusy(false);

    if (result.status === 'error') {
      setAuthError(result.message);
      return;
    }

    // The account exists either way, so the name belongs on the profile now.
    saveName(finalName);

    if (result.status === 'needs-verification') {
      // Not a failure. Hand over to the verify step, which waits for the
      // confirmation instead of dumping the user back to a sign-in form.
      setStepId('verify');
      return;
    }

    await storage.remove(StorageKeys.onboardingDraft);
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
            <Appear key={stepId} distance={20}>
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
              onSignIn={signInWithEmail}
              onResend={resendVerification}
              metrics={metrics}
              goals={goals}
              onEdit={editStep}
              onCalcDone={goNext}
              onGoogle={() => finish('google')}
              onEmail={() => finish('email')}
            />
            </Appear>
          </View>
        </ScrollView>

        {/* Footer button for standard steps */}
        {stepId !== 'calculating' && stepId !== 'account' && stepId !== 'verify' && (
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
  onSignIn: (email: string, password: string) => Promise<string | null>;
  onResend: (email: string) => Promise<string | null>;
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
  const { stepId } = p;

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

    case 'verify':
      return <VerifyStep {...p} />;

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

  const gradients = useGradients();
  const messages = ['Analyzing your metrics', 'Estimating your metabolism', 'Building your plan'];
  const msg = messages[Math.min(messages.length - 1, Math.floor(pct * messages.length))];

  return (
    <View style={styles.calc}>
      <CalorieRing value={pct} gradient={gradients.brand} size={200} thickness={18} animate={false}>
        <Floating amplitude={4}>
          <Ionicons name="sparkles" size={30} color={gradients.brand[1]} />
        </Floating>
        <ThemedText style={styles.calcPct}>{Math.round(pct * 100)}%</ThemedText>
      </CalorieRing>
      <ThemedText type="default" themeColor="textSecondary" style={styles.center}>
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
  const gradients = useGradients();
  if (!goals) return null;
  return (
    <>
      <Header title="Your daily plan is ready 🎉" subtitle="You can fine-tune this anytime in your profile." />
      <Appear delay={80}>
        <Card variant="raised" style={styles.planCard}>
          <LinearGradient
            colors={gradients.brand}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.planBadge}>
            <Ionicons name="flame" size={14} color="#FFFFFF" />
            <ThemedText type="small" style={{ color: '#FFFFFF' }}>
              Recommended
            </ThemedText>
          </LinearGradient>
          <View style={styles.planHeadline}>
            <View style={styles.planNumberRow}>
              <CountUp value={goals.calories} duration={1100} style={styles.planNumber} themeColor="tint" />
            </View>
            <ThemedText type="default" themeColor="textSecondary">
              calories per day
            </ThemedText>
          </View>
          <MacroRow consumed={{ protein: 0, carbs: 0, fat: 0 }} goal={goals.macros} />
          {metrics?.targetDate && (
            <View style={[styles.planTarget, { borderTopColor: gradients.brand[0] + '33' }]}>
              <Ionicons name="trophy" size={16} color={gradients.brand[1]} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.planTargetText}>
                On track for {Math.round(metrics.targetWeightKg && weightUnit === 'lbs' ? kgToLb(metrics.targetWeightKg) : metrics.targetWeightKg ?? 0)} {weightUnit} by {relativeDayLabel(metrics.targetDate)}.
              </ThemedText>
            </View>
          )}
        </Card>
      </Appear>
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
      <ThemedText type="small" themeColor="textSecondary">
        Your plan is already saved on this phone. Creating an account backs it up and
        lets you restore it if you change device.
      </ThemedText>
    </>
  );
}

/** How often to test whether the confirmation link has been followed. */
const VERIFY_POLL_MS = 3000;
/** Stop polling after this long; the manual button still works afterwards. */
const VERIFY_POLL_LIMIT_MS = 10 * 60 * 1000;

/**
 * Waiting for the confirmation email.
 *
 * The old behaviour ended the wizard here with an error-styled "check your
 * email, then sign in" and no way forward, so the user had to back out through
 * screens they had already finished and re-enter credentials they had just
 * typed. This screen instead keeps hold of those credentials and quietly
 * retries the sign-in that will start working the moment the link is followed.
 *
 * Polling is the fallback, not the mechanism: tapping the link normally
 * reopens the app and `AuthContext`'s deep-link handler establishes the session
 * immediately. But that depends on the redirect URL being allow-listed in the
 * Supabase dashboard and on the mail client actually handing off to the app,
 * neither of which is guaranteed — whereas "the password they just chose starts
 * working once the account is confirmed" is guaranteed. Nothing here weakens
 * verification: an unconfirmed account keeps failing sign-in, which is exactly
 * what confirmation is for.
 */
function VerifyStep(p: StepBodyProps) {
  const [status, setStatus] = useState<'waiting' | 'checking' | 'failed'>('waiting');
  const [note, setNote] = useState<string | null>(null);
  // Lazy so the clock is read once, on mount, rather than on every render.
  const startedAt = useRef<number | null>(null);

  const email = p.email.trim();
  const password = p.password;
  const onSignIn = p.onSignIn;

  useEffect(() => {
    if (!p.usesSupabase || !password) return;
    startedAt.current = Date.now();
    let cancelled = false;

    const id = setInterval(() => {
      if (cancelled) return;
      if (Date.now() - (startedAt.current ?? 0) > VERIFY_POLL_LIMIT_MS) {
        clearInterval(id);
        return;
      }
      // A failure here is the expected state while the mail is unread, so it
      // deliberately does not surface as an error.
      onSignIn(email, password);
    }, VERIFY_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [email, password, onSignIn, p.usesSupabase]);

  async function checkNow() {
    setStatus('checking');
    setNote(null);
    const err = await onSignIn(email, password);
    // On success the session flips and this screen unmounts, so reaching here
    // at all means it did not work yet.
    setStatus(err ? 'failed' : 'waiting');
    if (err) setNote("That didn't work yet — open the link in the email first.");
  }

  async function resend() {
    setNote(null);
    const err = await p.onResend(email);
    setNote(err ?? 'Sent. Check your inbox again in a moment.');
  }

  return (
    <>
      <Header
        title="Confirm your email"
        subtitle={`We sent a link to ${email}. Open it and you'll come straight back here.`}
      />
      <Card style={styles.verifyCard}>
        <Ionicons name="mail-open-outline" size={28} color={p.theme.tint} />
        <ThemedText type="smallBold">Waiting for you to confirm…</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.verifyBody}>
          This screen unlocks by itself the moment the link is opened. Your plan is
          already saved — nothing you entered can be lost from here.
        </ThemedText>
      </Card>
      {note && (
        <ThemedText type="small" themeColor="textSecondary">
          {note}
        </ThemedText>
      )}
      <Button
        title="I've confirmed — continue"
        icon="arrow-forward"
        onPress={checkNow}
        loading={status === 'checking'}
      />
      <Pressable onPress={resend} style={styles.editLink}>
        <ThemedText type="smallBold" style={{ color: p.theme.tint }}>
          Resend the email
        </ThemedText>
      </Pressable>
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
  verifyCard: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
  },
  verifyBody: {
    textAlign: 'center',
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
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '800',
    marginTop: Spacing.one,
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
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
  },
  planHeadline: {
    alignItems: 'center',
    gap: Spacing.half,
  },
  planNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  planNumber: {
    fontSize: 60,
    lineHeight: 64,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  planTarget: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
    width: '100%',
  },
  planTargetText: {
    flex: 1,
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
