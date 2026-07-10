import { createContext, useContext, type ReactNode } from 'react';

import type { ThemePreference } from '@/types';

/**
 * Exposes the user's Light / Dark preference to `useTheme()`. The app no longer
 * follows the OS setting — the user picks Light or Dark explicitly.
 */
const ResolvedSchemeContext = createContext<'light' | 'dark'>('light');

export function ResolvedThemeProvider({
  preference,
  children,
}: {
  preference: ThemePreference;
  children: ReactNode;
}) {
  const resolved: 'light' | 'dark' = preference === 'dark' ? 'dark' : 'light';

  return (
    <ResolvedSchemeContext.Provider value={resolved}>{children}</ResolvedSchemeContext.Provider>
  );
}

export function useResolvedScheme(): 'light' | 'dark' {
  return useContext(ResolvedSchemeContext);
}
