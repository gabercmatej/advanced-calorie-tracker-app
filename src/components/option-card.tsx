import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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
 * input for single-choice questions (sex, goal, diet, workout volume).
 */
export function OptionCards<T extends string>({ options, value, onChange }: OptionCardsProps<T>) {
  const theme = useTheme();

  return (
    <View style={styles.list}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: selected ? theme.tint : theme.backgroundElement,
                borderColor: selected ? theme.tint : theme.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            {opt.icon ? (
              <Ionicons
                name={opt.icon}
                size={22}
                color={selected ? theme.onTint : theme.textSecondary}
              />
            ) : null}
            <View style={styles.text}>
              <ThemedText
                type="smallBold"
                style={{ color: selected ? theme.onTint : theme.text, fontSize: 16 }}>
                {opt.label}
              </ThemedText>
              {opt.hint ? (
                <ThemedText
                  type="small"
                  style={{ color: selected ? theme.onTint : theme.textSecondary, opacity: selected ? 0.85 : 1 }}>
                  {opt.hint}
                </ThemedText>
              ) : null}
            </View>
            {selected ? <Ionicons name="checkmark-circle" size={22} color={theme.onTint} /> : null}
          </Pressable>
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
    minHeight: 60,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  text: {
    flex: 1,
    gap: 1,
  },
});
