import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * Local notifications for the retention hook (streak congratulations + a daily
 * nudge). Everything here is a no-op on web, where expo-notifications has no
 * scheduling support — callers don't need to branch.
 */

const isSupported = Platform.OS !== 'web';

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

/** Fire an immediate "streak" celebration notification. */
export async function notifyStreak(days: number): Promise<void> {
  if (!isSupported) return;
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${days}-day streak! 🔥`,
      body:
        days === 1
          ? 'You logged your first day. Keep it going tomorrow!'
          : `You've logged ${days} days in a row. Amazing consistency!`,
    },
    trigger: null, // deliver now
  });
}

/**
 * (Re)schedule a daily reminder at the given hour to log food. Cancels any
 * previously scheduled reminders first so we never stack duplicates.
 */
export async function scheduleDailyReminder(hour = 19): Promise<void> {
  if (!isSupported) return;
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Don't break your streak 🔥",
      body: 'Log your meals to stay on track with your goal.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute: 0,
    },
  });
}

/** Turn off all scheduled reminders. */
export async function cancelReminders(): Promise<void> {
  if (!isSupported) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}
