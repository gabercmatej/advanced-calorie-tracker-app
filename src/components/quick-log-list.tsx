import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { LayoutAnimation, Platform, StyleSheet, TextInput, UIManager, View } from 'react-native';

import { PressableScale } from '@/components/motion';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { defaultPortion, scaleFood, type LibraryFood } from '@/lib/food-library';
import { haptics } from '@/lib/haptics';
import type { QuickFood } from '@/lib/quick-log';

export type QuickTab = 'recent' | 'saved';

// Old Android needs this switched on explicitly before LayoutAnimation does
// anything; on iOS and web it is already available.
if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

interface Props {
  tab: QuickTab;
  onTabChange: (tab: QuickTab) => void;
  query: string;
  onQueryChange: (query: string) => void;
  recent: QuickFood[];
  saved: QuickFood[];
  /** Library matches for the current query. Empty when the query is blank. */
  results: LibraryFood[];
  /** Load a previously logged food into the editor for review. */
  onPick: (food: QuickFood) => void;
  /** Log a previously logged food straight away. */
  onLogNow: (food: QuickFood) => void;
  /** Load a library food into the editor, where the amount can be adjusted. */
  onPickLibrary: (food: LibraryFood) => void;
  /** Log a library food at its default portion in one tap. */
  onLogLibrary: (food: LibraryFood) => void;
}

const TABS = [
  { value: 'recent' as const, label: 'Recent' },
  { value: 'saved' as const, label: 'Saved' },
];

/**
 * Logging something without spending a model call.
 *
 * Three sources, one surface. Recents and saved foods come from the user's own
 * history; the search box reaches into the bundled food library. They are not
 * three separate modes — searching simply replaces the list, because typing is
 * already an unambiguous statement of intent.
 *
 * Two targets per row, because the two things people want here are genuinely
 * different: the row opens the food for review (change the portion, correct a
 * number), while the ＋ logs it unchanged in a single tap. On a long cut the
 * second is the common case by a wide margin, so it gets the tinted control.
 *
 * **The list starts collapsed.** After a few months of logging it had grown
 * into a wall the capture buttons sat below, so opening the logger meant
 * scrolling past history to reach the camera. Collapsed it is one row; the
 * search box stays out of the fold because it is compact and answers a
 * different question, and search results always render regardless — asking for
 * something specific should never also require expanding a section.
 */
export function QuickLogList({
  tab,
  onTabChange,
  query,
  onQueryChange,
  recent,
  saved,
  results,
  onPick,
  onLogNow,
  onPickLibrary,
  onLogLibrary,
}: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const searching = query.trim().length > 0;
  const list = tab === 'recent' ? recent : saved;

  function toggle() {
    haptics.light();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((prev) => !prev);
  }

  return (
    <View style={styles.wrap}>
      <PressableScale
        onPress={toggle}
        scaleTo={0.99}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${open ? 'Hide' : 'Show'} ${
          tab === 'recent' ? 'recent foods' : 'saved foods'
        }`}>
        <ThemedText type="smallBold">
          {tab === 'recent' ? 'Recent foods' : 'Saved foods'}
        </ThemedText>
        <View style={styles.headerRight}>
          {list.length > 0 ? (
            <View style={[styles.countPill, { backgroundColor: theme.tintSoft }]}>
              <ThemedText type="small" style={{ color: theme.tint }}>
                {list.length}
              </ThemedText>
            </View>
          ) : null}
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={theme.textSecondary}
          />
        </View>
      </PressableScale>

      {open && !searching ? (
        <View style={styles.tabs}>
          <Segmented value={tab} onChange={onTabChange} options={TABS} />
        </View>
      ) : null}

      <View
        style={[
          styles.search,
          { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
        ]}>
        <Ionicons name="search" size={16} color={theme.textSecondary} />
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search foods — chicken, oats, banana…"
          placeholderTextColor={theme.textSecondary}
          autoCorrect={false}
          accessibilityLabel="Search the food library"
          style={[styles.searchInput, { color: theme.text }]}
        />
        {searching ? (
          <PressableScale
            onPress={() => onQueryChange('')}
            scaleTo={0.9}
            accessibilityRole="button"
            accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
          </PressableScale>
        ) : null}
      </View>

      {searching ? (
        results.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Nothing matched. Take a photo or describe it instead — that path handles
            anything the library doesn&apos;t know.
          </ThemedText>
        ) : (
          <View style={styles.list}>
            {results.map((food) => {
              const portion = defaultPortion(food);
              const n = scaleFood(food, portion.grams);
              return (
                <Row
                  key={food.id}
                  title={food.name}
                  subtitle={`${portion.label} · ${n.calories} kcal · ${Math.round(n.protein)}g protein`}
                  onPick={() => onPickLibrary(food)}
                  onLogNow={() => onLogLibrary(food)}
                />
              );
            })}
          </View>
        )
      ) : !open ? null : list.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {tab === 'recent'
            ? 'Foods you log will show up here, ready to add again in one tap.'
            : 'Save a food from the review screen to pin it here.'}
        </ThemedText>
      ) : (
        <View style={styles.list}>
          {list.map((food) => (
            <Row
              key={food.key}
              title={food.name}
              subtitle={`${food.calories} kcal · ${Math.round(food.macros.protein)}g protein${
                food.timesLogged > 1 ? ` · logged ${food.timesLogged}×` : ''
              }`}
              onPick={() => onPick(food)}
              onLogNow={() => onLogNow(food)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function Row({
  title,
  subtitle,
  onPick,
  onLogNow,
}: {
  title: string;
  subtitle: string;
  onPick: () => void;
  onLogNow: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
      ]}>
      <PressableScale
        onPress={() => {
          haptics.light();
          onPick();
        }}
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityLabel={`Review ${title} before logging`}
        style={styles.rowMain}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {subtitle}
        </ThemedText>
      </PressableScale>

      <PressableScale
        onPress={() => {
          haptics.light();
          onLogNow();
        }}
        scaleTo={0.9}
        accessibilityRole="button"
        accessibilityLabel={`Log ${title} now`}
        style={[styles.addButton, { backgroundColor: theme.tint }]}>
        <Ionicons name="add" size={20} color={theme.onTint} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    minHeight: 30,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  countPill: {
    minWidth: 22,
    height: 20,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  tabs: {
    alignSelf: 'flex-start',
    minWidth: 190,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: Spacing.one,
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    paddingVertical: Spacing.two,
  },
  rowMain: {
    flex: 1,
    gap: 1,
    paddingVertical: Spacing.one,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
