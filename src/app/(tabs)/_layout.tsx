import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Appear, PressableScale } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Shadow, Spacing } from '@/constants/theme';
import { useDiary } from '@/context/DiaryContext';
import { useGradients } from '@/hooks/use-gradients';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { toDateKey } from '@/lib/nutrition';

/**
 * Bottom tab navigator (Home / Progress / Profile) plus a floating "+" button
 * that opens a small menu to log food or weight — mirroring Cal AI's layout.
 * JS-based tabs + vector icons render identically on iOS, Android, and web.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const gradients = useGradients();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectedDate } = useDiary();
  const [menuOpen, setMenuOpen] = useState(false);

  const fabBottom = (Platform.OS === 'web' ? 16 : insets.bottom) + 64;

  // Log against the day Home is focused on, so the + works from a past day too.
  function go(path: '/add' | '/log-weight') {
    haptics.light();
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
            height: (Platform.OS === 'web' ? 64 : 56) + insets.bottom,
            paddingTop: 6,
          },
          tabBarLabelStyle: { fontFamily: Fonts?.sans, fontSize: 11, fontWeight: '600' },
          tabBarItemStyle: { paddingVertical: 4 },
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
          <Appear delay={0}>
            <MenuAction icon="restaurant" label="Log food" onPress={() => go('/add')} />
          </Appear>
          <Appear delay={60}>
            <MenuAction icon="scale" label="Log weight" onPress={() => go('/log-weight')} />
          </Appear>
        </View>
      )}

      {/* Floating add button */}
      <PressableScale
        onPress={() => {
          haptics.medium();
          setMenuOpen((o) => !o);
        }}
        scaleTo={0.9}
        accessibilityRole="button"
        accessibilityLabel={menuOpen ? 'Close menu' : 'Add'}
        style={[styles.fab, { bottom: fabBottom }, Shadow.glow(theme.tint)]}>
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabFill}>
          <Ionicons name={menuOpen ? 'close' : 'add'} size={30} color="#FFFFFF" />
        </LinearGradient>
      </PressableScale>
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
  const gradients = useGradients();
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.94}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.menuItem, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, Shadow.raised]}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.menuIcon}>
        <Ionicons name={icon} size={18} color="#FFFFFF" />
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 62,
    height: 62,
    borderRadius: Radius.full,
  },
  fabFill: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
  },
  menuIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
