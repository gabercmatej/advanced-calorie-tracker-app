import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChatBubble, ChatPending } from '@/components/chat-bubble';
import { Chip } from '@/components/chip';
import { Appear } from '@/components/motion';
import { RecipeCard, RecipeShortRow } from '@/components/recipe-card';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useCelebration } from '@/context/CelebrationContext';
import { useDiary } from '@/context/DiaryContext';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/hooks/use-theme';
import { hasClaudeKey } from '@/lib/claude';
import { answerFoodQuestion, STARTER_QUESTIONS } from '@/lib/food-qa';
import { currentMeal, toDateKey } from '@/lib/nutrition';
import { INGREDIENTS } from '@/lib/recipe-data';
import { filterRecipes, recipeToEntry, suggestRecipes, tasteProfile } from '@/lib/recipes';
import { INGREDIENT_GROUPS, MEAL_TYPES, type ChatMessage, type IngredientGroup, type MealType } from '@/types';

const MEAL_OPTIONS = MEAL_TYPES.map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) }));

const GROUP_LABEL: Record<IngredientGroup, string> = {
  protein: 'Protein',
  carbs: 'Carbs & grains',
  veg: 'Produce',
  dairy: 'Dairy',
  pantry: 'Pantry',
};

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/**
 * The Food tab. Two jobs behind one segmented control:
 *  - "Ideas": meal recommendations ranked against the day's remaining budget,
 *    the user's kitchen, and what they actually log.
 *  - "Ask": read-only questions answered from their own diary.
 */
export default function FoodScreen() {
  const [surface, setSurface] = useState<'ideas' | 'ask'>('ideas');

  return (
    <Screen brand title="Food">
      <Segmented
        value={surface}
        onChange={setSurface}
        options={[
          { value: 'ideas', label: 'Ideas' },
          { value: 'ask', label: 'Ask' },
        ]}
      />
      {surface === 'ideas' ? <IdeasSurface /> : <AskSurface />}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Ideas
// ---------------------------------------------------------------------------

function IdeasSurface() {
  const theme = useTheme();
  const { profile, entries, totalsForDate, addEntry } = useDiary();
  const {
    ready,
    pantry,
    favorites,
    hidden,
    library,
    togglePantry,
    setPantry,
    toggleFavorite,
    hideRecipe,
    addGenerated,
  } = useFood();
  const { celebrate } = useCelebration();

  const [meal, setMeal] = useState<MealType>(currentMeal());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pantryOpen, setPantryOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const today = toDateKey();
  const totals = totalsForDate(today);
  const diet = profile.metrics?.diet ?? 'balanced';

  // Memoized on primitives rather than the goal/total objects, which are rebuilt
  // every render and would defeat the memo (and the React Compiler) otherwise.
  const goalCalories = profile.goals.calories;
  const goalProtein = profile.goals.macros.protein;
  const eatenCalories = totals.calories;
  const eatenProtein = totals.macros.protein;

  const remaining = useMemo(
    () => ({
      calories: Math.max(0, Math.round(goalCalories - eatenCalories)),
      protein: Math.max(0, Math.round(goalProtein - eatenProtein)),
    }),
    [goalCalories, goalProtein, eatenCalories, eatenProtein],
  );

  const taste = useMemo(() => tasteProfile(entries), [entries]);

  const { ready: cookable, oneShort } = useMemo(
    () => filterRecipes(library, { meal, pantry, diet, remaining, taste, favorites, hidden }),
    [library, meal, pantry, diet, remaining, taste, favorites, hidden],
  );

  // Always starts collapsed. Opening it by default on first run buried the
  // recipes — the actual value — under a screen-and-a-half of chips; the
  // collapsed header does the teaching instead.
  const showPantry = pantryOpen;

  async function onGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const favouriteFoods = [...taste.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([word]) => word);
      const fresh = await suggestRecipes({
        meal,
        diet,
        pantry,
        remaining,
        existingNames: cookable.slice(0, 12).map((r) => r.name),
        favouriteFoods,
      });
      if (fresh.length === 0) {
        setGenerateError('Nothing new came back. Try a different meal or fewer pantry filters.');
      } else {
        addGenerated(fresh);
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Could not generate ideas.');
    } finally {
      setGenerating(false);
    }
  }

  function onLog(recipeId: string) {
    const recipe = library.find((r) => r.id === recipeId);
    if (!recipe) return;
    addEntry(recipeToEntry(recipe, meal, today));
    setExpandedId(null);
    celebrate(`+${recipe.calories} kcal logged`);
  }

  /**
   * The generate control. Hidden entirely without a key rather than shown and
   * broken — there is no offline equivalent, since every matching bundled
   * recipe is already on screen.
   */
  const generateBlock = hasClaudeKey ? (
    <>
      <Button
        title={generating ? 'Thinking…' : 'Generate ideas'}
        icon="sparkles"
        variant="secondary"
        loading={generating}
        onPress={onGenerate}
      />
      {generateError ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle-outline" size={15} color={theme.danger} />
          <ThemedText type="small" style={[styles.errorText, { color: theme.danger }]}>
            {generateError}
          </ThemedText>
        </View>
      ) : null}
    </>
  ) : (
    <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
      Connect a Supabase project to generate new ideas beyond the {library.length} built in.
    </ThemedText>
  );

  if (!ready) {
    return (
      <View style={styles.section}>
        <Skeleton height={44} radius={Radius.md} />
        <Skeleton height={120} radius={Radius.lg} />
        <Skeleton height={120} radius={Radius.lg} />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      {/* Anchors every suggestion below to the actual plan. */}
      <View style={styles.headroom}>
        <Ionicons name="pie-chart-outline" size={14} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.headroomText}>
          {remaining.calories > 0
            ? `${remaining.calories} kcal and ${remaining.protein}g protein left today`
            : "You've hit today's calories — these are lighter options"}
        </ThemedText>
      </View>

      <Segmented wrap value={meal} onChange={setMeal} options={MEAL_OPTIONS} />

      {/* --- Pantry ------------------------------------------------------- */}
      <Card style={styles.pantryCard}>
        <Pressable
          onPress={() => setPantryOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showPantry }}
          style={styles.pantryHeader}>
          <View style={styles.pantryTitle}>
            <Ionicons name="basket-outline" size={16} color={theme.tint} />
            <ThemedText type="smallBold">What I have</ThemedText>
          </View>
          <View style={styles.pantryMeta}>
            <ThemedText type="small" themeColor="textSecondary">
              {pantry.size === 0 ? 'Filter by ingredient' : `${pantry.size} selected`}
            </ThemedText>
            <Ionicons
              name={showPantry ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={theme.textSecondary}
            />
          </View>
        </Pressable>

        {showPantry ? (
          <Appear distance={8} style={styles.pantryBody}>
            <ThemedText type="small" themeColor="textSecondary">
              {pantry.size === 0
                ? 'Tap what you have in and ideas needing anything else drop off the list.'
                : 'Ideas needing something you have not selected are hidden.'}
            </ThemedText>

            {INGREDIENT_GROUPS.map((group) => (
              <View key={group} style={styles.pantryGroup}>
                <ThemedText type="small" themeColor="textSecondary">
                  {GROUP_LABEL[group]}
                </ThemedText>
                <View style={styles.chipWrap}>
                  {INGREDIENTS.filter((i) => i.group === group).map((ingredient) => (
                    <Chip
                      key={ingredient.id}
                      label={ingredient.label}
                      selected={pantry.has(ingredient.id)}
                      onPress={() => togglePantry(ingredient.id)}
                    />
                  ))}
                </View>
              </View>
            ))}

            {pantry.size > 0 ? (
              <Pressable
                onPress={() => setPantry([])}
                accessibilityRole="button"
                style={styles.clearRow}>
                <ThemedText type="small" style={{ color: theme.danger }}>
                  Clear selection
                </ThemedText>
              </Pressable>
            ) : null}
          </Appear>
        ) : null}
      </Card>

      {/* --- Ideas -------------------------------------------------------- */}
      {cookable.length === 0 && oneShort.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="restaurant-outline" size={26} color={theme.textSecondary} />
          <ThemedText type="smallBold">Nothing matches yet</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
            {pantry.size > 0
              ? `No ${meal} ideas use only what you have selected. Add a few more ingredients, or generate something new.`
              : `No ${meal} ideas fit your ${diet} plan yet. Try generating some.`}
          </ThemedText>
          {generateBlock}
        </Card>
      ) : (
        <>
          {cookable.map((recipe, i) => (
            <Appear key={recipe.id} delay={Math.min(i, 4) * 40}>
              <RecipeCard
                recipe={recipe}
                expanded={expandedId === recipe.id}
                onToggleExpand={() =>
                  setExpandedId((id) => (id === recipe.id ? null : recipe.id))
                }
                favorite={favorites.has(recipe.id)}
                onToggleFavorite={() => toggleFavorite(recipe.id)}
                onHide={() => {
                  hideRecipe(recipe.id);
                  setExpandedId(null);
                }}
                onLog={() => onLog(recipe.id)}
              />
            </Appear>
          ))}

          {oneShort.length > 0 ? (
            <View style={styles.shortBlock}>
              <ThemedText type="small" themeColor="textSecondary">
                One item short
              </ThemedText>
              {oneShort.slice(0, 5).map(({ recipe, missing }) => (
                <RecipeShortRow
                  key={recipe.id}
                  recipe={recipe}
                  missing={missing}
                  onAddMissing={() => togglePantry(missing.id)}
                />
              ))}
            </View>
          ) : null}

          {generateBlock}
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Ask
// ---------------------------------------------------------------------------

function AskSurface() {
  const theme = useTheme();
  const { profile, entries } = useDiary();
  const { chat, appendChat, clearChat } = useFood();

  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState(false);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    setQuestion('');
    setPending(true);
    appendChat({ id: newId(), role: 'user', text: trimmed, createdAt: Date.now() });

    const answer = await answerFoodQuestion(trimmed, entries, profile);
    appendChat({ id: newId(), role: 'assistant', text: answer, createdAt: Date.now() });
    setPending(false);
  }

  // Newest first: the answer you just asked for should not require a scroll.
  const transcript = useMemo(() => [...chat].reverse(), [chat]);

  return (
    <View style={styles.section}>
      <Card style={styles.askCard}>
        <View style={styles.askRow}>
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="Ask about your food log…"
            placeholderTextColor={theme.textSecondary}
            onSubmitEditing={() => ask(question)}
            returnKeyType="send"
            editable={!pending}
            accessibilityLabel="Ask a question about your food log"
            style={[
              styles.askInput,
              {
                color: theme.text,
                backgroundColor: theme.backgroundSelected,
                borderColor: theme.border,
              },
            ]}
          />
          <Pressable
            onPress={() => ask(question)}
            disabled={pending || question.trim().length === 0}
            accessibilityRole="button"
            accessibilityLabel="Send question"
            style={[
              styles.send,
              {
                backgroundColor: theme.tintSoft,
                borderColor: theme.border,
              },
              (pending || question.trim().length === 0) && styles.sendDisabled,
            ]}>
            <Ionicons name="arrow-up" size={18} color={theme.tint} />
          </Pressable>
        </View>

        <ThemedText type="small" themeColor="textSecondary">
          Answers come from your own entries. It can&apos;t log food for you.
        </ThemedText>
      </Card>

      {chat.length === 0 ? (
        <View style={styles.section}>
          <ThemedText type="small" themeColor="textSecondary">
            Try one of these
          </ThemedText>
          <View style={styles.chipWrap}>
            {STARTER_QUESTIONS.map((q) => (
              <Chip key={q} label={q} icon="chatbubble-outline" onPress={() => ask(q)} />
            ))}
          </View>
          {entries.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              You have not logged anything yet, so there is little to ask about. Log a meal from
              Home first.
            </ThemedText>
          ) : null}
        </View>
      ) : (
        <View style={styles.section}>
          {pending ? <ChatPending /> : null}
          {transcript.map((message: ChatMessage) => (
            <ChatBubble key={message.id} message={message} />
          ))}
          <Pressable onPress={clearChat} accessibilityRole="button" style={styles.clearRow}>
            <ThemedText type="small" themeColor="textSecondary">
              Clear history
            </ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.three,
  },
  headroom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  headroomText: {
    flex: 1,
  },
  pantryCard: {
    gap: Spacing.two,
  },
  pantryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    minHeight: 28,
  },
  pantryTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pantryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  pantryBody: {
    gap: Spacing.three,
  },
  pantryGroup: {
    gap: Spacing.two,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  clearRow: {
    paddingVertical: Spacing.two,
  },
  emptyCard: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  emptyText: {
    textAlign: 'center',
  },
  shortBlock: {
    gap: Spacing.two,
  },
  note: {
    textAlign: 'center',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  errorText: {
    flex: 1,
  },
  askCard: {
    gap: Spacing.two,
  },
  askRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  askInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.4,
  },
});
