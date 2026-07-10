/**
 * Design tokens for CalAI — colors, spacing, fonts, radii.
 *
 * Colors are defined for light and dark mode and consumed through
 * `useTheme()`. There are many other ways to style an app (Nativewind,
 * Tamagui, unistyles, …) but a plain token object keeps things dependency-free.
 */

import '@/global.css';

import { Platform } from 'react-native';

/** Brand accent — a deep navy blue that reads as focused / premium. */
const navy = '#1E3A8A';
const navyDark = '#4C6EF5';

export const Colors = {
  light: {
    text: '#0B1533',
    textSecondary: '#5A6478',
    background: '#F3F5FB',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E7EBF5',
    border: '#E1E6F0',
    tint: navy,
    /** Text/icon color that sits on top of a `tint`-filled surface. */
    onTint: '#FFFFFF',
    tabIconDefault: '#9AA0AE',
    tabIconSelected: navy,
    // Macros
    protein: '#3B82F6',
    carbs: '#F59E0B',
    fat: '#EF4444',
    // Accents
    streak: '#F97316',
    // Status
    success: '#16A34A',
    danger: '#EF4444',
  },
  dark: {
    text: '#EAEEF9',
    textSecondary: '#98A2B8',
    background: '#0A1022',
    backgroundElement: '#121A30',
    backgroundSelected: '#1E2842',
    border: '#26314F',
    tint: navyDark,
    onTint: '#FFFFFF',
    tabIconDefault: '#69748C',
    tabIconSelected: navyDark,
    // Macros
    protein: '#60A5FA',
    carbs: '#FBBF24',
    fat: '#F87171',
    // Accents
    streak: '#FB923C',
    // Status
    success: '#4ADE80',
    danger: '#F87171',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 20,
  full: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
