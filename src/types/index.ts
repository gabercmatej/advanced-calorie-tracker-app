/** Core domain types for CalAI. */

/** The three tracked macronutrients, in grams. */
export interface Macros {
  protein: number;
  carbs: number;
  fat: number;
}

/** Which part of the day a food was eaten. */
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** A single logged food item. */
export interface FoodEntry {
  id: string;
  name: string;
  /** ISO date string (YYYY-MM-DD) this entry is logged against. */
  date: string;
  meal: MealType;
  calories: number;
  macros: Macros;
  /** Serving quantity multiplier (1 = one serving). */
  quantity: number;
  /** Epoch millis of creation, used for ordering. */
  createdAt: number;
  /** True when the values came from the AI estimator rather than a database. */
  aiEstimated?: boolean;
  /** Local URI of the photo the meal was logged from (local-only mode / preview). */
  photoUri?: string;
  /** Object path in the Supabase `meal-photos` bucket, when synced to the cloud. */
  photoPath?: string;
}

/** A single body-weight measurement, stored in kilograms. */
export interface WeightEntry {
  /** ISO date string (YYYY-MM-DD). One measurement per day (latest wins). */
  date: string;
  weightKg: number;
}

/** The user's daily nutrition targets. */
export interface Goals {
  calories: number;
  macros: Macros;
}

/** Biological sex, used only for the BMR equation. */
export type Sex = 'male' | 'female';

/** What the user is trying to do with their weight. */
export type GoalType = 'lose' | 'maintain' | 'gain';

export const GOAL_TYPES: GoalType[] = ['lose', 'maintain', 'gain'];

/** Weekly training volume bucket (maps to a TDEE multiplier). */
export type WorkoutsPerWeek = '0-2' | '3-5' | '6+';

export const WORKOUT_BUCKETS: WorkoutsPerWeek[] = ['0-2', '3-5', '6+'];

/** Dietary preference (nudges the macro split). */
export type DietType = 'balanced' | 'vegetarian' | 'vegan' | 'pescatarian' | 'keto';

export const DIET_TYPES: DietType[] = ['balanced', 'vegetarian', 'vegan', 'pescatarian', 'keto'];

/** Measurement unit preference for display/entry. */
export type UnitSystem = 'metric' | 'imperial';

/** Theme preference. */
export type ThemePreference = 'light' | 'dark';

/** Physical stats collected during onboarding to personalize the plan. */
export interface UserMetrics {
  sex: Sex;
  /** Date of birth as YYYY-MM-DD (age is derived from this). */
  birthDate: string;
  heightCm: number;
  weightKg: number;
  workoutsPerWeek: WorkoutsPerWeek;
  goalType: GoalType;
  diet: DietType;
  /** Target weight in kg (optional — only for lose/gain goals). */
  targetWeightKg?: number;
  /** ISO date the user wants to reach the target by (optional). */
  targetDate?: string;
}

/** User profile used to personalize goals. */
export interface Profile {
  name: string;
  goals: Goals;
  /** Present once the user has completed onboarding. */
  metrics?: UserMetrics;
  /** Gate for the first-run onboarding flow. */
  onboarded: boolean;
  /** Whether streak reminder notifications are enabled. */
  notificationsEnabled: boolean;
  /** Preferred display units. */
  units: UnitSystem;
  /** Light / dark appearance. */
  theme: ThemePreference;
}

/** A signed-in account (local mock persistence for now). */
export interface Session {
  name: string;
  email: string;
  provider: 'google' | 'email';
}
