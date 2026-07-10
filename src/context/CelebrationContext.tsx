import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

import { Celebration } from '@/components/celebration';
import { haptics } from '@/lib/haptics';

interface CelebrateOptions {
  /** Rain confetti (streak milestones and other big moments). */
  confetti?: boolean;
}

interface CelebrationContextValue {
  /** Show the reward flourish with a short message. */
  celebrate: (message: string, options?: CelebrateOptions) => void;
}

const CelebrationContext = createContext<CelebrationContextValue | null>(null);

interface CelebrationState {
  message: string;
  confetti: boolean;
}

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CelebrationState | null>(null);

  const celebrate = useCallback((message: string, options?: CelebrateOptions) => {
    haptics.success();
    setState({ message, confetti: options?.confetti ?? false });
  }, []);
  const clear = useCallback(() => setState(null), []);

  return (
    <CelebrationContext.Provider value={{ celebrate }}>
      {children}
      {state !== null ? (
        <Celebration message={state.message} confetti={state.confetti} onDone={clear} />
      ) : null}
    </CelebrationContext.Provider>
  );
}

export function useCelebration(): CelebrationContextValue {
  const ctx = useContext(CelebrationContext);
  if (!ctx) throw new Error('useCelebration must be used within a CelebrationProvider');
  return ctx;
}
