import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useDiary } from '@/context/DiaryContext';
import { useTheme } from '@/hooks/use-theme';
import { toDateKey } from '@/lib/nutrition';

/**
 * Bottom tab navigator (Home / Progress / Profile) plus a floating "+" button
 * that opens a small menu to log food or weight — mirroring Cal AI's layout.
 * JS-based tabs + vector icons render identically on iOS, Android, and web.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectedDate } = useDiary();
  const [menuOpen, setMenuOpen] = useState(false);

  const fabBottom = (Platform.OS === 'web' ? 16 : insets.bottom) + 64;

  // Log against the day Home is focused on, so the + works from a past day too.
  function go(path: '/add' | '/log-weight') {
    setMenuOpen(false);
    const suffix = selectedDate && selectedDate !== toDateKey() ? `?date=${selectedDate}` : '';
    router.push(`${path}${suffix}` as typeof path);
  }

  return (
    <View style={styles.flex}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.tabIconSelected,
          tabBarInactiveTintColor: theme.tabIconDefault,
          tabBarStyle: {
            backgroundColor: theme.backgroundElement,
            borderTopColor: theme.border,
          },
          tabBarLabelStyle: { fontFamily: Fonts?.sans },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="progress"
          options={{
            title: 'Progress',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="stats-chart" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-circle" size={size} color={color} />
            ),
          }}
        />
      </Tabs>

      {/* Tap-away backdrop while the menu is open */}
      {menuOpen && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setMenuOpen(false)}
          accessibilityLabel="Close menu"
        />
      )}

      {/* Action menu — shown above the + button */}
      {menuOpen && (
        <View style={[styles.menu, { bottom: fabBottom + 70 }]}>
          <MenuAction
            icon="restaurant"
            label="Log food"
            onPress={() => go('/add')}
          />
          <MenuAction
            icon="scale"
            label="Log weight"
            onPress={() => go('/log-weight')}
          />
        </View>
      )}

      {/* Floating add button */}
      <Pressable
        onPress={() => setMenuOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={menuOpen ? 'Close menu' : 'Add'}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: theme.tint,
            bottom: fabBottom,
            opacity: pressed ? 0.9 : 1,
          },
        ]}>
        <Ionicons name={menuOpen ? 'close' : 'add'} size={30} color={theme.onTint} />
      </Pressable>
    </View>
  );
}

function MenuAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.menuItem,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View style={[styles.menuIcon, { backgroundColor: theme.tint }]}>
        <Ionicons name={icon} size={18} color={theme.onTint} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 58,
    height: 58,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.2)',
    elevation: 6,
  },
  menu: {
    position: 'absolute',
    right: 20,
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.one,
    paddingVertical: Spacing.one,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.15)',
    elevation: 4,
  },
  menuIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
