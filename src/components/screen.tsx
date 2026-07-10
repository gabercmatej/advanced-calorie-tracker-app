import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';

interface ScreenProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Set false for screens that manage their own scrolling (e.g. FlatList). */
  scroll?: boolean;
  /** Right-aligned header slot (e.g. a settings button). */
  headerRight?: ReactNode;
}

/**
 * Standard screen frame: safe-area aware, centered max-width column, optional
 * scroll and page header. Keeps every screen consistent across phones,
 * tablets, and web.
 */
export function Screen({ title, subtitle, children, scroll = true, headerRight }: ScreenProps) {
  const insets = useSafeAreaInsets();

  const header = title ? (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <ThemedText type="title" style={styles.title}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="default" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {headerRight}
    </View>
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
    fontSize: 34,
    lineHeight: 40,
    // Serif display face for the main page headings (Home / Progress / Profile).
    fontFamily: Fonts?.serif,
  },
});
