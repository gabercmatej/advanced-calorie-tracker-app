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
  /**
   * Epoch millis of the last edit. Absent on entries written before sync
   * existed — merge falls back to `createdAt` for those. This is what decides
   * which copy wins when the same entry exists locally and in the cloud.
   */
  updatedAt?: number;
  /** True when the values came from the AI estimator rather than a database. */
  aiEstimated?: boolean;
  /** Local URI of the photo the meal was logged from (local-only mode / preview). */
  photoUri?: string;
  /** Every photo the meal was logged from. `photoUri` is always the first of these. */
  photoUris?: string[];
  /**
   * Legacy: object path of a photo uploaded by an older build. Photos are no
   * longer synced, so nothing writes this any more — it is kept only so old
   * stored entries still parse.
   */
  photoPath?: string;
  /** Per-component breakdown, when the estimate produced one. Display only. */
  items?: EntryItem[];
  /**
   * Dietary fibre in grams, when known. Deliberately NOT part of `Macros`:
   * fibre carries no calorie-split target, so it sums alongside the macros
   * rather than participating in their arithmetic. Absent means "not known",
   * which the UI distinguishes from a known zero.
   */
  fiber?: number;
}

/** Where a single component of a logged meal got its numbers. */
export type ItemSource = 'label' | 'estimate';

/**
 * One component of a logged meal. `label` items were read off a scanned
 * barcode and are exact; `estimate` items were inferred from a photo or the
 * description. Stored on the entry purely so the breakdown can be shown again.
 */
export interface EntryItem {
  name: string;
  calories: number;
  macros: Macros;
  source: ItemSource;
}

/** A single body-weight measurement, stored in kilograms. */
export interface WeightEntry {
  /** ISO date string (YYYY-MM-DD). One measurement per day (latest wins). */
  date: string;
  weightKg: number;
  /** Epoch millis of the last write. Absent on pre-sync entries. */
  updatedAt?: number;
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
  /** Epoch millis of the last profile write, used to resolve sync conflicts. */
  updatedAt?: number;
}

/**
 * A food the user pinned for one-tap logging. Values are always for a single
 * serving; the amount is chosen again each time it is logged.
 */
export interface SavedFood {
  id: string;
  name: string;
  calories: number;
  macros: Macros;
  fiber?: number;
  /** Meal slot to preselect when logging it. */
  usualMeal?: MealType;
  createdAt: number;
}

/** A signed-in account (local mock persistence for now). */
export interface Session {
  name: string;
  email: string;
  provider: 'google' | 'email';
}

// ---------------------------------------------------------------------------
// Food tab — recipes and chat
// ---------------------------------------------------------------------------

/** Which shelf an ingredient lives on, used to group the pantry picker. */
export type IngredientGroup = 'protein' | 'carbs' | 'veg' | 'dairy' | 'pantry';

export const INGREDIENT_GROUPS: IngredientGroup[] = [
  'protein',
  'carbs',
  'veg',
  'dairy',
  'pantry',
];

/** A pantry ingredient the user can toggle on/off. */
export interface Ingredient {
  id: string;
  label: string;
  group: IngredientGroup;
}

/**
 * A meal idea. Bundled recipes live in `src/lib/recipe-data.ts`; model-generated
 * ones arrive in exactly this shape so the UI cannot tell them apart.
 */
export interface Recipe {
  id: string;
  name: string;
  /** Meal slots this fits — a recipe can serve more than one. */
  meals: MealType[];
  calories: number;
  macros: Macros;
  /** Dietary fibre in grams for one serving, when known. */
  fiber?: number;
  /** Hands-on time in minutes. */
  minutes: number;
  /** Ingredient ids, matched against the user's pantry. */
  ingredients: string[];
  /** Seasonings and staples that don't participate in pantry filtering. */
  extras?: string[];
  steps: string[];
  /** Diets this is compatible with. */
  diets: DietType[];
  /** True when the model produced it rather than the bundled library. */
  generated?: boolean;
}

/** One turn in the Ask transcript. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
}
