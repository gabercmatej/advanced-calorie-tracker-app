import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { syncDailyReminder } from '@/lib/notifications';
import { toDateKey } from '@/lib/nutrition';

interface Options {
  /** Hold off until the diary has hydrated — before that, "nothing logged" is a lie. */
  ready: boolean;
  /** The user's Profile preference. */
  enabled: boolean;
  /** Date keys that have at least one food entry. */
  loggedDates: Set<string>;
}

/**
 * Keeps the noon reminder in step with the diary.
 *
 * Mounted once, at the root. It reconciles on three occasions — hydration, a
 * change to whether today has been logged, and the app coming to the
 * foreground — and reconciling is idempotent, so the overlap between them
 * costs nothing.
 *
 * The foreground listener is what handles the passage of time: an app left
 * open overnight has a stale `today`, so the handler recomputes the date key
 * and reads the diary through a ref rather than trusting the values captured
 * when the listener was attached.
 *
 * Note that nothing here *posts* a notification. Opening the app can only
 * queue or cancel a future one.
 */
export function useDailyReminder({ ready, enabled, loggedDates }: Options): void {
  const latest = useRef({ enabled, loggedDates });
  useEffect(() => {
    latest.current = { enabled, loggedDates };
  }, [enabled, loggedDates]);

  const loggedToday = loggedDates.has(toDateKey());

  useEffect(() => {
    if (!ready) return;
    syncDailyReminder({ enabled, hasLoggedToday: loggedToday });
  }, [ready, enabled, loggedToday]);

  useEffect(() => {
    if (!ready) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const { enabled: on, loggedDates: dates } = latest.current;
      syncDailyReminder({ enabled: on, hasLoggedToday: dates.has(toDateKey()) });
    });
    return () => sub.remove();
  }, [ready]);
}
