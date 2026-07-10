import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface FieldProps extends TextInputProps {
  label: string;
  /** Trailing unit label (e.g. "cm", "kg", "g"). */
  suffix?: string;
}

/** A labelled text/number input that lights up its border on focus. */
export function Field({ label, suffix, style, onFocus, onBlur, ...props }: FieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: theme.backgroundSelected,
            borderColor: focused ? theme.tint : theme.border,
            borderWidth: focused ? 1.5 : StyleSheet.hairlineWidth,
          },
          focused && { boxShadow: `0px 0px 0px 3px ${theme.tint}22` },
        ]}>
        <TextInput
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }, style]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
        {suffix ? (
          <ThemedText type="small" themeColor="textSecondary">
            {suffix}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
});
