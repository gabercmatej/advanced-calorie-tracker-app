import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { EntryItem, ItemSource } from '@/types';

/**
 * The per-component breakdown of a meal.
 *
 * Its whole job is to make provenance visible: which numbers came off a label,
 * which the user typed, and which the model guessed at. That distinction is the
 * difference between a tracker you can correct and one you have to trust
 * blindly, so it is shown rather than averaged into a single confidence badge.
 *
 * Shared by the logger's review card and the entry editor so the two can never
 * describe the same entry differently.
 */

interface SourceStyle {
  icon: keyof typeof Ionicons.glyphMap;
  /** Which theme color the icon takes. */
  tone: 'success' | 'tint' | 'muted' | 'danger';
  /** Prefix on the calorie figure — a tilde marks a number that is a guess. */
  approximate: boolean;
  label: string;
}

const SOURCE_STYLES: Record<ItemSource, SourceStyle> = {
  user: { icon: 'create-outline', tone: 'success', approximate: false, label: 'you stated this' },
  label: { icon: 'pricetag', tone: 'success', approximate: false, label: 'from the label' },
  saved: { icon: 'bookmark', tone: 'success', approximate: false, label: 'your saved product' },
  library: { icon: 'book-outline', tone: 'tint', approximate: true, label: 'from the food table' },
  estimate: { icon: 'sparkles-outline', tone: 'muted', approximate: true, label: 'estimated' },
  unresolved: { icon: 'help-circle-outline', tone: 'danger', approximate: false, label: 'not worked out' },
};

export function Breakdown({ items }: { items: EntryItem[] }) {
  const theme = useTheme();
  if (!items.length) return null;

  const toneColor = {
    success: theme.success,
    tint: theme.tint,
    muted: theme.textSecondary,
    danger: theme.danger,
  };

  return (
    <View style={[styles.breakdown, { borderColor: theme.border }]}>
      {items.map((item, i) => {
        const style = SOURCE_STYLES[item.source] ?? SOURCE_STYLES.estimate;
        const unresolved = item.source === 'unresolved';
        return (
          <View key={`${item.name}-${i}`} style={styles.row}>
            <Ionicons name={style.icon} size={12} color={toneColor[style.tone]} />
            <ThemedText type="small" style={styles.name} numberOfLines={1}>
              {item.name}
            </ThemedText>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={unresolved ? { color: theme.danger } : undefined}>
              {unresolved ? 'needs a number' : `${style.approximate ? '~' : ''}${item.calories} kcal`}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  breakdown: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: {
    flex: 1,
  },
});
