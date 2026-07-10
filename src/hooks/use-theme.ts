/**
 * Resolve the active theme's color tokens.
 *
 * The effective scheme comes from `ResolvedThemeProvider`, which combines the
 * user's Light/Dark/System preference with the device setting. Learn more:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useResolvedScheme } from '@/context/ThemeContext';

export function useTheme() {
  return Colors[useResolvedScheme()];
}
