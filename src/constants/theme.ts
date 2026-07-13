/**
 * Design tokens for CalAI — colors, gradients, spacing, fonts, radii, shadows.
 *
 * Dark-first, focused-fitness aesthetic: a single emerald accent on near-black,
 * green-tinted surfaces. Flat and confident rather than multi-hue — the accent
 * gradient stays tone-on-tone so fills read as one color with depth. Colors are
 * defined for light and dark mode and consumed through `useTheme()`. Gradients
 * (arrays) live in `Gradients` and are consumed through `useGradients()`.
 */

import '@/global.css';

import { Platform } from 'react-native';

/** Brand accent — a fresh emerald that reads as healthy + focused. */
const emerald = '#0E9F6E';
const emeraldDark = '#3ECF8E';

export const Colors = {
  light: {
    text: '#101413',
    textSecondary: '#5F6B66',
    background: '#F5F7F6',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EBEFEC',
    border: '#E2E7E4',
    tint: emerald,
    /** A soft, translucent tint wash for icon chips / glows. */
    tintSoft: '#E3F5EC',
    /** Text/icon color that sits on top of a `tint`-filled surface. */
    onTint: '#FFFFFF',
    tabIconDefault: '#93A79A',
    tabIconSelected: emerald,
    /** Scrim behind modals / menus. */
    overlay: 'rgba(13,23,18,0.45)',
    // Macros
    protein: '#E8446B',
    carbs: '#3B82F6',
    fat: '#EA9013',
    // Accents
    streak: '#FB8C3C',
    // Status
    success: '#16A34A',
    danger: '#EF4444',
  },
  dark: {
    text: '#F1F5F2',
    textSecondary: '#93A099',
    background: '#0D0F0E',
    backgroundElement: '#151817',
    backgroundSelected: '#1D2120',
    border: '#262B29',
    tint: emeraldDark,
    tintSoft: '#152420',
    /** Dark ink on the emerald fill — green buttons carry dark text. */
    onTint: '#07150D',
    tabIconDefault: '#5E7367',
    tabIconSelected: emeraldDark,
    overlay: 'rgba(2,6,4,0.62)',
    // Macros
    protein: '#FF6B8B',
    carbs: '#5B9BFF',
    fat: '#FFB84D',
    // Accents
    streak: '#FCA34F',
    // Status
    success: '#4ADE80',
    danger: '#FB7185',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Multi-stop gradient palettes (arrays passed straight to `LinearGradient`).
 * `brand` is a deliberately narrow emerald→emerald ramp — enough to give fills
 * depth without ever reading as a rainbow.
 */
export const Gradients = {
  light: {
    brand: ['#22C583', '#0E9F6E'],
    brandSoft: ['#E7F7EE', '#DFF3E8'],
    streak: ['#FDBA74', '#FB8C3C'],
    success: ['#34D399', '#16A34A'],
    danger: ['#FB7185', '#EF4444'],
    hero: ['#EFF3F0', '#F5F7F6'],
    /** Subtle surface sheen for standard cards. */
    card: ['#FFFFFF', '#F7FAF8'],
    cardRaised: ['#FFFFFF', '#EFF3F0'],
  },
  dark: {
    brand: ['#46E3A1', '#2FB579'],
    brandSoft: ['#14231C', '#101D17'],
    streak: ['#FCA34F', '#F97316'],
    success: ['#34D399', '#16A34A'],
    danger: ['#FB7185', '#F43F5E'],
    hero: ['#141716', '#0D0F0E'],
    card: ['#161918', '#111413'],
    cardRaised: ['#1A1D1C', '#141716'],
  },
} as const;

export type GradientName = keyof typeof Gradients.light & keyof typeof Gradients.dark;

/** The tuple shape `expo-linear-gradient` expects for its `colors` prop. */
export type GradientColors = readonly [string, string, ...string[]];

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
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
} as const;

/**
 * Soft, layered shadows. `boxShadow` renders on web + RN new architecture;
 * `elevation` is the Android fallback. Kept subtle so dark surfaces read as
 * "lifted" rather than muddy.
 */
export const Shadow = {
  none: {},
  card: {
    boxShadow: '0px 6px 20px rgba(8,14,10,0.10)',
    elevation: 2,
  },
  raised: {
    boxShadow: '0px 12px 32px rgba(8,14,10,0.16)',
    elevation: 6,
  },
  floating: {
    boxShadow: '0px 16px 40px rgba(8,14,10,0.22)',
    elevation: 10,
  },
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
