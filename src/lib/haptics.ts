/**
 * Thin haptic-feedback wrapper. No-ops on web (and swallows errors on devices
 * without a Taptic engine) so callers can fire freely from any platform.
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS !== 'web';

function run(fn: () => Promise<unknown>) {
  if (!enabled) return;
  fn().catch(() => {});
}

export const haptics = {
  /** Light tap — buttons, chips, toggles. */
  light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Medium tap — primary actions, FAB. */
  medium: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Selection tick — segmented / picker changes. */
  selection: () => run(() => Haptics.selectionAsync()),
  /** Success buzz — a meal/weight logged, streak extended. */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Warning buzz — going over goal, errors. */
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
