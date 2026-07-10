import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

import { Celebration } from '@/components/celebration';

interface CelebrationContextValue {
  /** Show the reward flourish with a short message. */
  celebrate: (message: string) => void;
}

const CelebrationContext = createContext<CelebrationContextValue | null>(null);

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);

  const celebrate = useCallback((msg: string) => setMessage(msg), []);
  const clear = useCallback(() => setMessage(null), []);

  return (
    <CelebrationContext.Provider value={{ celebrate }}>
      {children}
      {message !== null ? <Celebration message={message} onDone={clear} /> : null}
    </CelebrationContext.Provider>
  );
}

export function useCelebration(): CelebrationContextValue {
  const ctx = useContext(CelebrationContext);
  if (!ctx) throw new Error('useCelebration must be used within a CelebrationProvider');
  return ctx;
}
