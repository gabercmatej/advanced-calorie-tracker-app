import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Appear, PressableScale } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { ingredientLabels } from '@/lib/recipes';
import type { Ingredient, Recipe } from '@/types';

interface RecipeCardProps {
  recipe: Recipe;
  expanded: boolean;
  onToggleExpand: () => void;
  favorite: boolean;
  onToggleFavorite: () => void;
  onHide: () => void;
  onLog: () => void;
}

/**
 * One meal idea. Tapping the card expands the steps in place rather than
 * pushing a detail route — the content is three or four lines, and staying put
 * keeps the rest of the list available for comparison.
 */
export function RecipeCard({
  recipe,
  expanded,
  onToggleExpand,
  favorite,
  onToggleFavorite,
  onHide,
  onLog,
}: RecipeCardProps) {
  const theme = useTheme();
  const ingredients = ingredientLabels(recipe.ingredients).join(' · ');

  return (
    <Card style={styles.card}>
      <Pressable
        onPress={() => {
          haptics.light();
          onToggleExpand();
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${recipe.name}, ${recipe.calories} calories, ${recipe.macros.protein} grams protein`}
        style={styles.headerPress}>
        <View style={styles.headerRow}>
          <ThemedText type="subtitle" style={styles.name}>
            {recipe.name}
          </ThemedText>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={theme.textSecondary}
          />
        </View>

        <View style={styles.metaRow}>
          <Meta icon="flame-outline" text={`${recipe.calories} kcal`} />
          {/* Only the icon carries the macro colour — the macro tokens sit below
              4.5:1 as small text, and 3:1 is the bar for a graphic. */}
          <Meta icon="barbell-outline" text={`${recipe.macros.protein}g protein`} iconTint={theme.protein} />
          <Meta icon="time-outline" text={`${recipe.minutes} min`} />
          {recipe.generated ? <Meta icon="sparkles" text="AI" iconTint={theme.tint} /> : null}
        </View>

        <ThemedText type="small" themeColor="textSecondary" numberOfLines={expanded ? undefined : 1}>
          {ingredients}
        </ThemedText>
      </Pressable>

      {expanded ? (
        <Appear distance={8} style={styles.expanded}>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          {recipe.steps.map((step, i) => (
            <View key={step} style={styles.stepRow}>
              <View style={[styles.stepNumber, { backgroundColor: theme.tintSoft }]}>
                <ThemedText type="small">{i + 1}</ThemedText>
              </View>
              <ThemedText type="small" style={styles.stepText}>
                {step}
              </ThemedText>
            </View>
          ))}

          {recipe.extras?.length ? (
            <ThemedText type="small" themeColor="textSecondary">
              Also needs: {recipe.extras.join(', ')}
            </ThemedText>
          ) : null}

          <View style={styles.actions}>
            <Button
              title="Log this"
              icon="add-circle-outline"
              onPress={onLog}
              style={styles.logButton}
            />
            <PressableScale
              onPress={() => {
                haptics.light();
                onHide();
              }}
              scaleTo={0.94}
              hoverLift={false}
              accessibilityRole="button"
              accessibilityLabel={`Hide ${recipe.name}`}
              style={[styles.hideButton, { borderColor: theme.border }]}>
              <ThemedText type="small" themeColor="textSecondary">
                Not for me
              </ThemedText>
            </PressableScale>
          </View>
        </Appear>
      ) : null}

      {/* Heart sits above the pressable header so it stays independently tappable. */}
      <Pressable
        onPress={() => {
          haptics.light();
          onToggleFavorite();
        }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityState={{ selected: favorite }}
        accessibilityLabel={favorite ? `Unfavourite ${recipe.name}` : `Favourite ${recipe.name}`}
        style={styles.heart}>
        <Ionicons
          name={favorite ? 'heart' : 'heart-outline'}
          size={20}
          color={favorite ? theme.tint : theme.textSecondary}
        />
      </Pressable>
    </Card>
  );
}

function Meta({
  icon,
  text,
  iconTint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  /** Colours the icon only; the label always stays at readable contrast. */
  iconTint?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={13} color={iconTint ?? theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary">
        {text}
      </ThemedText>
    </View>
  );
}

/**
 * The dimmed "one item short" variant. A dense row rather than a card, so the
 * hierarchy is obvious at a glance: these are not things you can cook now.
 */
export function RecipeShortRow({
  recipe,
  missing,
  onAddMissing,
}: {
  recipe: Recipe;
  missing: Ingredient;
  onAddMissing: () => void;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={() => {
        haptics.light();
        onAddMissing();
      }}
      scaleTo={0.98}
      hoverLift={false}
      accessibilityRole="button"
      accessibilityLabel={`${recipe.name}, needs ${missing.label}. Tap to add ${missing.label} to your kitchen.`}
      style={[styles.shortRow, { borderColor: theme.border }]}>
      <View style={styles.shortText}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {recipe.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {recipe.calories} kcal · {recipe.macros.protein}g protein
        </ThemedText>
      </View>
      <View style={[styles.needPill, { backgroundColor: theme.backgroundSelected }]}>
        <Ionicons name="add" size={13} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          {missing.label}
        </ThemedText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
  },
  headerPress: {
    gap: Spacing.two,
    // Leave room for the absolutely positioned heart.
    paddingRight: Spacing.five,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  name: {
    flex: 1,
    fontSize: 17,
    lineHeight: 23,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  heart: {
    position: 'absolute',
    top: Spacing.three,
    right: Spacing.three,
    padding: Spacing.half,
  },
  expanded: {
    gap: Spacing.two,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.one,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  logButton: {
    flex: 1,
  },
  hideButton: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
    justifyContent: 'center',
  },
  shortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.75,
  },
  shortText: {
    flex: 1,
    gap: Spacing.half,
  },
  needPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
  },
});
