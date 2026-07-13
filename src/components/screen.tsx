import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Appear } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';

interface ScreenProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Set false for screens that manage their own scrolling (e.g. FlatList). */
  scroll?: boolean;
  /** Right-aligned header slot (e.g. a streak badge). */
  headerRight?: ReactNode;
  /** Show the one-line "CalorieTracker AI" brand bar above the title (tab screens). */
  brand?: boolean;
}

/**
 * Standard screen frame: safe-area aware, centered max-width column, ambient
 * backdrop, and a spring entrance so every screen has motion. Keeps every
 * screen consistent across phones, tablets, and web.
 */
export function Screen({ title, subtitle, children, scroll = true, headerRight, brand }: ScreenProps) {
  const insets = useSafeAreaInsets();

  const header =
    title || brand ? (
      <Appear style={styles.headerBlock}>
        {brand ? (
          <View style={styles.brandRow}>
            <ThemedText
              type="smallBold"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={styles.brandName}>
              CalorieTracker AI
            </ThemedText>
            {headerRight}
          </View>
        ) : null}
        {title ? (
          <View style={styles.header}>
            <View style={styles.headerText}>
              <ThemedText type="title" numberOfLines={1} adjustsFontSizeToFit style={styles.title}>
                {title}
              </ThemedText>
              {subtitle ? (
                <ThemedText type="default" themeColor="textSecondary">
                  {subtitle}
                </ThemedText>
              ) : null}
            </View>
            {!brand ? headerRight : null}
          </View>
        ) : null}
      </Appear>
    ) : null;

  const body = (
    <View style={styles.column}>
      {header}
      {children}
    </View>
  );

  return (
    <ThemedView style={styles.flex}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.six },
          ]}
          showsVerticalScrollIndicator={false}>
          {body}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.content,
            styles.flex,
            { paddingTop: insets.top + Spacing.three, paddingBottom: Spacing.three },
          ]}>
          {body}
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.four,
  },
  headerBlock: {
    gap: Spacing.three,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  brandName: {
    flexShrink: 1,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontFamily: Fonts?.sans,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headerText: {
    flex: 1,
    gap: Spacing.one,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
    fontWeight: '800',
    fontFamily: Fonts?.sans,
  },
});
