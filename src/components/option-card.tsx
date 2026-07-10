import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useGradients } from '@/hooks/use-gradients';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

export interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface OptionCardsProps<T extends string> {
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
}

/**
 * A vertical list of large, tappable selection cards — the primary onboarding
 * input for single-choice questions (sex, goal, diet, workout volume). The
 * selected card fills with the brand gradient and glows; all cards spring on tap.
 */
export function OptionCards<T extends string>({ options, value, onChange }: OptionCardsProps<T>) {
  const theme = useTheme();
  const gradients = useGradients();

  return (
    <View style={styles.list}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <PressableScale
            key={opt.value}
            onPress={() => {
              haptics.selection();
              onChange(opt.value);
            }}
            scaleTo={0.97}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.card,
              {
                backgroundColor: selected ? 'transparent' : theme.backgroundElement,
                borderColor: selected ? 'transparent' : theme.border,
              },
              selected ? Shadow.glow(theme.tint) : Shadow.card,
            ]}>
            {selected ? (
              <LinearGradient
                colors={gradients.brand}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            {opt.icon ? (
              <View style={[styles.iconWrap, { backgroundColor: selected ? 'rgba(255,255,255,0.18)' : theme.tintSoft }]}>
                <Ionicons name={opt.icon} size={20} color={selected ? '#FFFFFF' : theme.tint} />
              </View>
            ) : null}
            <View style={styles.text}>
              <ThemedText type="smallBold" style={{ color: selected ? '#FFFFFF' : theme.text, fontSize: 16 }}>
                {opt.label}
              </ThemedText>
              {opt.hint ? (
                <ThemedText
                  type="small"
                  style={{ color: selected ? '#FFFFFF' : theme.textSecondary, opacity: selected ? 0.9 : 1 }}>
                  {opt.hint}
                </ThemedText>
              ) : null}
            </View>
            {selected ? <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" /> : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    minHeight: 64,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 1,
  },
});
