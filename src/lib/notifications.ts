import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { planReminder, type ScheduledReminder } from '@/lib/reminder';

/**
 * The app's only notification: one nudge at local noon, on days where nothing
 * has been logged yet.
 *
 * There used to be two more, and they were the problem. A streak notification
 * fired from a `useEffect` that compared the streak against a ref initialised
 * to zero — so every cold start, once the diary hydrated, looked like the
 * streak had just grown from 0 to 7 and posted a banner. That is why
 * notifications arrived simply for opening the app. Alongside it, a *repeating*
 * daily trigger fired whether or not the day had been logged, so the nudge kept
 * arriving after the meal it was nudging about.
 *
 * Both are gone. What replaces them is deliberately not another scheduler: the
 * decision lives in `reminder.ts` as a pure function, and everything here does
 * is read the OS queue, apply the plan, and write it back. `syncDailyReminder`
 * is idempotent — call it on every app open, every log, and every toggle; the
 * second call in a row does nothing at all.
 *
 * Everything is a no-op on web, where `expo-notifications` cannot schedule.
 */

const isSupported = Platform.OS !== 'web';

/** Marks a queued notification as ours, and records when we meant it to fire. */
const REMINDER_KIND = 'calai/daily-reminder';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Ask the OS for permission. Returns true if we may post notifications. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isSupported) return false;
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

/**
 * Everything currently queued, as the planner wants to see it.
 *
 * *Everything*, not just ours: this app schedules nothing else, so any queued
 * notification that isn't the reminder we want is stale by definition. Reading
 * them all is what retires the old repeating 19:00 trigger from a previous
 * install — it has no `fireAt`, so it reads as 0, matches no target, and gets
 * cancelled on the first sync after the update.
 */
async function readScheduled(): Promise<ScheduledReminder[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.map((request) => {
    const data = request.content.data as { kind?: string; fireAt?: unknown } | null | undefined;
    const fireAt =
      data?.kind === REMINDER_KIND && typeof data.fireAt === 'number' && Number.isFinite(data.fireAt)
        ? data.fireAt
        : 0;
    return { id: request.identifier, fireAt };
  });
}

async function reconcile(input: { enabled: boolean; hasLoggedToday: boolean; now: number }): Promise<void> {
  if (!isSupported) return;

  // Permission can be revoked in system settings long after the toggle was
  // flipped, so it is checked here rather than trusted from the profile.
  const granted = input.enabled ? (await Notifications.getPermissionsAsync()).granted : false;

  const plan = planReminder({
    now: input.now,
    enabled: input.enabled && granted,
    hasLoggedToday: input.hasLoggedToday,
    scheduled: await readScheduled(),
  });

  for (const id of plan.cancel) {
    await Notifications.cancelScheduledNotificationAsync(id);
  }

  if (plan.schedule != null) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Nothing logged yet',
        body: "Don't forget to log your meals today.",
        data: { kind: REMINDER_KIND, fireAt: plan.schedule },
      },
      trigger: {
        // A one-shot date trigger, never a repeating one. The next day's
        // reminder is queued only after this one has been resolved, which is
        // what lets "did they log today?" be part of the decision at all.
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(plan.schedule),
      },
    });
  }
}

/**
 * Serialises reconciliation.
 *
 * Two concurrent syncs — the mount effect and a foreground event landing
 * together — would both read an empty queue and both schedule, which is exactly
 * the duplicate this module exists to prevent. Chaining makes the read-then-
 * write atomic with respect to other callers. The `catch` keeps the chain
 * resolved so one failure cannot wedge every later sync.
 */
let queue: Promise<void> = Promise.resolve();

/**
 * Bring the OS queue in line with the current state. Safe to call as often as
 * you like: it posts nothing, and does nothing when already correct.
 */
export function syncDailyReminder(input: {
  enabled: boolean;
  hasLoggedToday: boolean;
  now?: number;
}): Promise<void> {
  queue = queue
    .then(() => reconcile({ ...input, now: input.now ?? Date.now() }))
    .catch((err) => console.warn('[notifications] reminder sync failed', err));
  return queue;
}
