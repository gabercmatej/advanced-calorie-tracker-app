/**
 * Resolve the active theme's gradient palettes (arrays for `LinearGradient`).
 * Mirrors `useTheme()` but for multi-stop gradients.
 */

import { Gradients } from '@/constants/theme';
import { useResolvedScheme } from '@/context/ThemeContext';

export function useGradients() {
  return Gradients[useResolvedScheme()];
}
