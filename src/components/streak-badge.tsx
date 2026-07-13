import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useGradients } from '@/hooks/use-gradients';
import { useTheme } from '@/hooks/use-theme';

/**
 * Header streak pill, always visible: lit orange while a streak is alive,
 * washed-out at 0 so the flame reads as "waiting to be earned".
 */
export function StreakBadge({ days }: { days: number }) {
  const theme = useTheme();
  const gradients = useGradients();

  if (days <= 0) {
    return (
      <View
        style={[
          styles.pill,
          styles.mutedPill,
          { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
        ]}>
        <Ionicons name="flame-outline" size={16} color={`${theme.streak}80`} />
        <ThemedText type="smallBold" themeColor="textSecondary">
          0
        </ThemedText>
      </View>
    );
  }

  return (
    <LinearGradient
      colors={gradients.streak}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.pill}>
      <Ionicons name="flame" size={16} color="#FFFFFF" />
      <ThemedText type="smallBold" style={styles.litText}>
        {days}
      </ThemedText>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
  },
  mutedPill: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  litText: {
    color: '#FFFFFF',
  },
});
