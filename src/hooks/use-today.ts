import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { msUntilNextLocalMidnight } from '@/lib/day-state';
import { toDateKey } from '@/lib/nutrition';

/**
 * The current local calendar date, kept true while the app is open.
 *
 * `toDateKey()` read during render is only correct until the next render, which
 * is why an app left open overnight kept yesterday's date circled: nothing
 * re-rendered at midnight, and nothing recomputed on resume. Both are handled
 * here — a timer set to the next local midnight, and a check when the app comes
 * back to the foreground, which is what covers a device that was asleep through
 * the timer.
 *
 * The timer is rescheduled from the new date rather than repeated on a fixed
 * interval, so a daylight-saving change or a device clock adjustment corrects
 * itself on the following day instead of drifting.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => toDateKey());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const sync = () => {
      setToday(toDateKey());
      if (timer) clearTimeout(timer);
      timer = setTimeout(sync, msUntilNextLocalMidnight(Date.now()));
    };

    sync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });

    return () => {
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return today;
}
