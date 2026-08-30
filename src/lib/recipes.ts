import { callClaudeJson, hasClaudeKey } from '@/lib/claude';
import { INGREDIENTS, RECIPES } from '@/lib/recipe-data';
import { daysBetween, toDateKey } from '@/lib/nutrition';
import type { DietType, FoodEntry, Ingredient, MealType, Recipe } from '@/types';

/**
 * Recipe ranking, filtering, and model-backed generation.
 *
 * Pure logic — the bundled data lives in `recipe-data.ts` and the React state
 * in `FoodContext`. Everything here is deterministic except `suggestRecipes`,
 * which falls back to dealing unseen bundled cards when there is no API key.
 */

const INGREDIENT_BY_ID = new Map(INGREDIENTS.map((i) => [i.id, i]));

export function ingredientById(id: string): Ingredient | undefined {
  return INGREDIENT_BY_ID.get(id);
}

/** Human labels for a list of ingredient ids, skipping any that are unknown. */
export function ingredientLabels(ids: string[]): string[] {
  return ids.map((id) => INGREDIENT_BY_ID.get(id)?.label ?? id);
}

// ---------------------------------------------------------------------------
// Taste profile — what the user actually eats
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'and', 'with', 'the', 'a', 'of', 'in', 'on', 'my', 'some', 'plus', 'from',
  'homemade', 'fresh', 'large', 'small', 'medium', 'grilled', 'baked', 'fried',
]);

/** Words worth matching on, lowercased and de-punctuated. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * A recency-weighted map of the words that show up in the user's own log over
 * the last 60 days. This is the whole of "it knows what I like" — no explicit
 * input required, and it works from day one of history.
 */
export function tasteProfile(entries: FoodEntry[], today = toDateKey()): Map<string, number> {
  const weights = new Map<string, number>();
  for (const entry of entries) {
    const age = daysBetween(entry.date, today);
    if (age < 0 || age > 60) continue;
    // Something eaten yesterday counts roughly twice something eaten a month ago.
    const weight = 1 / (1 + age / 30);
    for (const token of tokenize(entry.name)) {
      weights.set(token, (weights.get(token) ?? 0) + weight);
    }
  }
  return weights;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Roughly how much of a day's remaining budget each meal should take. */
const MEAL_SHARE: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.3,
  dinner: 0.35,
  snack: 0.12,
};

export interface RecipeContext {
  meal: MealType;
  /** Ingredient ids the user has. Empty means "don't filter yet". */
  pantry: Set<string>;
  diet: DietType;
  /** Calories and protein still available today. */
  remaining: { calories: number; protein: number };
  taste: Map<string, number>;
  favorites: Set<string>;
  hidden: Set<string>;
}

/** Ingredient ids in `recipe` that the pantry doesn't cover. */
export function missingIngredients(recipe: Recipe, pantry: Set<string>): string[] {
  return recipe.ingredients.filter((id) => !pantry.has(id));
}

/**
 * Rank a recipe for the current context. Higher is better. The weights are
 * tuned so pantry fit and plan fit dominate, taste nudges, and a heart wins
 * ties outright.
 */
export function scoreRecipe(recipe: Recipe, ctx: RecipeContext): number {
  let score = 0;

  // Pantry coverage, 0–40.
  if (ctx.pantry.size > 0 && recipe.ingredients.length > 0) {
    const have = recipe.ingredients.length - missingIngredients(recipe, ctx.pantry).length;
    score += (have / recipe.ingredients.length) * 40;
  }

  // Fit to what's left of the day's budget, 0–25, with a penalty for blowing it.
  if (ctx.remaining.calories > 0) {
    const ideal = Math.max(150, ctx.remaining.calories * MEAL_SHARE[ctx.meal]);
    const drift = Math.min(1, Math.abs(recipe.calories - ideal) / ideal);
    score += (1 - drift) * 25;
    if (recipe.calories > ctx.remaining.calories) score -= 20;
  }

  // Protein density, 0–20 — this is what makes the tab useful on a cut.
  const density = recipe.calories > 0 ? (recipe.macros.protein / recipe.calories) * 100 : 0;
  score += Math.min(20, density * 2.5);

  // Protein still owed today nudges high-protein options up further.
  if (ctx.remaining.protein > 0 && recipe.macros.protein >= ctx.remaining.protein * 0.3) {
    score += 8;
  }

  // Taste affinity, 0–20.
  const words = new Set([...tokenize(recipe.name), ...tokenize(ingredientLabels(recipe.ingredients).join(' '))]);
  let affinity = 0;
  for (const word of words) affinity += ctx.taste.get(word) ?? 0;
  score += Math.min(20, affinity * 3);

  if (ctx.favorites.has(recipe.id)) score += 30;
  // A small nudge so freshly generated ideas surface above the bundled ones.
  if (recipe.generated) score += 2;

  return score;
}

export interface FilterResult {
  /** Recipes the pantry fully covers, best first. */
  ready: Recipe[];
  /** Recipes missing exactly one ingredient, so the list is never empty. */
  oneShort: { recipe: Recipe; missing: Ingredient }[];
}

/**
 * Split the library into what the user can cook right now and what they're one
 * item short of. Hidden recipes are dropped; an empty pantry disables filtering
 * entirely rather than showing nothing on first run.
 */
export function filterRecipes(library: Recipe[], ctx: RecipeContext): FilterResult {
  const candidates = library
    .filter((r) => !ctx.hidden.has(r.id))
    .filter((r) => r.meals.includes(ctx.meal))
    .filter((r) => r.diets.includes(ctx.diet));

  const ready: Recipe[] = [];
  const oneShort: { recipe: Recipe; missing: Ingredient }[] = [];

  for (const recipe of candidates) {
    const missing = ctx.pantry.size === 0 ? [] : missingIngredients(recipe, ctx.pantry);
    if (missing.length === 0) {
      ready.push(recipe);
    } else if (missing.length === 1) {
      const ingredient = INGREDIENT_BY_ID.get(missing[0]);
      if (ingredient) oneShort.push({ recipe, missing: ingredient });
    }
  }

  const byScore = (a: Recipe, b: Recipe) => scoreRecipe(b, ctx) - scoreRecipe(a, ctx);
  ready.sort(byScore);
  oneShort.sort((a, b) => byScore(a.recipe, b.recipe));

  return { ready, oneShort };
}

/** Turn a recipe into a diary entry payload, ready for `addEntry`. */
export function recipeToEntry(
  recipe: Recipe,
  meal: MealType,
  date: string,
): Omit<FoodEntry, 'id' | 'createdAt'> {
  return {
    name: recipe.name,
    date,
    meal,
    calories: recipe.calories,
    macros: recipe.macros,
    fiber: recipe.fiber,
    quantity: 1,
    aiEstimated: Boolean(recipe.generated),
  };
}

// ---------------------------------------------------------------------------
// Model-generated ideas
// ---------------------------------------------------------------------------

const ALLOWED_IDS = INGREDIENTS.map((i) => i.id);

const RECIPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    recipes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          meals: { type: 'array', items: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] } },
          calories: { type: 'integer' },
          protein_g: { type: 'integer' },
          carbs_g: { type: 'integer' },
          fat_g: { type: 'integer' },
          minutes: { type: 'integer' },
          ingredients: { type: 'array', items: { type: 'string', enum: ALLOWED_IDS } },
          extras: { type: 'array', items: { type: 'string' } },
          steps: { type: 'array', items: { type: 'string' } },
          diets: {
            type: 'array',
            items: { type: 'string', enum: ['balanced', 'vegetarian', 'vegan', 'pescatarian', 'keto'] },
          },
        },
        required: ['name', 'meals', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'minutes', 'ingredients', 'steps', 'diets'],
      },
    },
  },
  required: ['recipes'],
} as const;

interface GeneratedRecipe {
  name: string;
  meals: MealType[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  minutes: number;
  ingredients: string[];
  extras?: string[];
  steps: string[];
  diets: DietType[];
}

const SYSTEM_PROMPT =
  'You suggest meal ideas for a calorie-tracking app. The user is usually cutting, ' +
  'so favour high protein for the calories. Respect their diet strictly. Only use ' +
  'ingredient ids from the allowed list — put seasonings, stock, vinegar and other ' +
  'assumed staples in "extras" instead, since those never block a recipe. Keep steps ' +
  'to three or four short imperative sentences. Give realistic totals for one serving. ' +
  'Do not repeat any recipe name the user already has.';

export interface SuggestInput {
  meal: MealType;
  diet: DietType;
  pantry: Set<string>;
  remaining: { calories: number; protein: number };
  /** Names the user already has on screen, so the model doesn't repeat them. */
  existingNames: string[];
  /** Foods they log most, as taste context. */
  favouriteFoods: string[];
}

/** Stable-ish id for a generated recipe, so favourites survive a reload. */
function generatedId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `gen-${slug}`;
}

function toRecipe(raw: GeneratedRecipe): Recipe {
  const nonNeg = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
  return {
    id: generatedId(raw.name),
    name: raw.name.trim(),
    meals: raw.meals?.length ? raw.meals : ['lunch'],
    calories: nonNeg(raw.calories),
    macros: { protein: nonNeg(raw.protein_g), carbs: nonNeg(raw.carbs_g), fat: nonNeg(raw.fat_g) },
    minutes: Math.max(1, nonNeg(raw.minutes)),
    // Guard against ids outside the vocabulary, which would break pantry filtering.
    ingredients: (raw.ingredients ?? []).filter((id) => INGREDIENT_BY_ID.has(id)),
    extras: raw.extras?.filter(Boolean),
    steps: (raw.steps ?? []).filter(Boolean),
    diets: raw.diets?.length ? raw.diets : ['balanced'],
    generated: true,
  };
}

/**
 * Ask Claude for a few fresh ideas.
 *
 * This deliberately has no offline fallback. The Ideas list already shows every
 * bundled recipe that matches, ranked — so there is nothing held back to
 * "reveal", and dealing already-visible cards would be a button that appears to
 * work and doesn't. Callers should hide the control when `hasClaudeKey` is
 * false, and surface the thrown message when a call fails.
 */
export async function suggestRecipes(input: SuggestInput): Promise<Recipe[]> {
  if (!hasClaudeKey) {
    throw new Error('Generating new ideas needs an Anthropic API key.');
  }

  const pantryLabels = ingredientLabels([...input.pantry]);
  const prompt = [
    `Meal: ${input.meal}.`,
    `Diet: ${input.diet}.`,
    input.remaining.calories > 0
      ? `They have about ${Math.round(input.remaining.calories)} kcal and ${Math.round(input.remaining.protein)} g protein left today.`
      : 'They have already met today\'s targets, so keep it light.',
    pantryLabels.length
      ? `They have these ingredients on hand: ${pantryLabels.join(', ')}. Strongly prefer recipes that need nothing else.`
      : 'They have not told us what is in their kitchen, so assume common staples.',
    input.favouriteFoods.length ? `They often eat: ${input.favouriteFoods.join(', ')}.` : '',
    input.existingNames.length ? `Already suggested, do not repeat: ${input.existingNames.join('; ')}.` : '',
    'Give exactly 4 ideas.',
  ]
    .filter(Boolean)
    .join('\n');

  const data = await callClaudeJson<{ recipes: GeneratedRecipe[] }>({
    system: SYSTEM_PROMPT,
    content: [{ type: 'text', text: prompt }],
    schema: RECIPE_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1600,
  });
  // Drop anything that duplicates a bundled recipe — the library already ranks
  // those, so re-adding one would look like the button did nothing.
  const bundled = new Set(RECIPES.map((r) => r.id));
  return (data.recipes ?? [])
    .map(toRecipe)
    .filter((r) => r.name && r.calories > 0 && !bundled.has(r.id));
}

/**
 * Development guard: every ingredient id referenced by a bundled recipe must
 * exist. A typo here would silently make a recipe permanently unreachable.
 */
export function assertRecipeData(): void {
  if (!__DEV__) return;
  for (const recipe of RECIPES) {
    for (const id of recipe.ingredients) {
      if (!INGREDIENT_BY_ID.has(id)) {
        console.warn(`[recipes] "${recipe.id}" references unknown ingredient "${id}"`);
      }
    }
  }
}
