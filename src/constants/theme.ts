/**
 * Design tokens for CalAI — colors, gradients, spacing, fonts, radii, shadows.
 *
 * Dark-first, premium-fitness aesthetic: a vibrant indigo→violet brand gradient,
 * near-black layered surfaces, soft glows. Colors are defined for light and dark
 * mode and consumed through `useTheme()`. Gradients (arrays) live in `Gradients`
 * and are consumed through `useGradients()`.
 */

import '@/global.css';

import { Platform } from 'react-native';

/** Brand accent — a vivid indigo/violet that reads as energetic + premium. */
const indigo = '#6366F1';
const indigoDark = '#8B80FF';

export const Colors = {
  light: {
    text: '#0E1020',
    textSecondary: '#5A6178',
    background: '#F4F6FC',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EDEFF9',
    border: '#E5E8F2',
    tint: indigo,
    /** A soft, translucent tint wash for icon chips / glows. */
    tintSoft: '#ECEDFE',
    /** Text/icon color that sits on top of a `tint`-filled surface. */
    onTint: '#FFFFFF',
    tabIconDefault: '#9AA0AE',
    tabIconSelected: indigo,
    /** Scrim behind modals / menus. */
    overlay: 'rgba(14,16,32,0.45)',
    // Macros
    protein: '#4F7DFF',
    carbs: '#F5A524',
    fat: '#F45B7A',
    // Accents
    streak: '#FB8C3C',
    // Status
    success: '#16A34A',
    danger: '#EF4444',
  },
  dark: {
    text: '#F3F4FB',
    textSecondary: '#9BA2BC',
    background: '#080A14',
    backgroundElement: '#13151F',
    backgroundSelected: '#1E2130',
    border: '#262A3B',
    tint: indigoDark,
    tintSoft: '#20213A',
    onTint: '#FFFFFF',
    tabIconDefault: '#69748C',
    tabIconSelected: indigoDark,
    overlay: 'rgba(3,4,10,0.62)',
    // Macros
    protein: '#6E96FF',
    carbs: '#FBBF4A',
    fat: '#FF7A96',
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
 * `brand` is the signature indigo→violet used on rings, hero surfaces, the FAB
 * and primary buttons.
 */
export const Gradients = {
  light: {
    brand: ['#6366F1', '#8B5CF6', '#A855F7'],
    brandSoft: ['#EEF0FE', '#F3EDFF'],
    streak: ['#FDBA74', '#FB8C3C'],
    success: ['#34D399', '#16A34A'],
    danger: ['#FB7185', '#EF4444'],
    hero: ['#EEF1FF', '#F4F6FC'],
    /** Subtle surface sheen for standard cards. */
    card: ['#FFFFFF', '#F6F7FE'],
    cardRaised: ['#FFFFFF', '#EEF0FB'],
  },
  dark: {
    brand: ['#7C6CFF', '#9A6BFF', '#B15CFF'],
    brandSoft: ['#1B1C34', '#241E3A'],
    streak: ['#FCA34F', '#F97316'],
    success: ['#34D399', '#16A34A'],
    danger: ['#FB7185', '#F43F5E'],
    hero: ['#161832', '#0B0D18'],
    card: ['#181A28', '#111320'],
    cardRaised: ['#1E2030', '#141622'],
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
    boxShadow: '0px 6px 20px rgba(12,14,30,0.10)',
    elevation: 2,
  },
  raised: {
    boxShadow: '0px 12px 32px rgba(12,14,30,0.16)',
    elevation: 6,
  },
  floating: {
    boxShadow: '0px 16px 40px rgba(12,14,30,0.22)',
    elevation: 10,
  },
  /** A colored glow beneath a tinted surface (FAB, primary CTA). */
  glow(color: string) {
    return {
      boxShadow: `0px 10px 28px ${color}59`,
      elevation: 8,
    };
  },
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
