import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { PressableScale } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useGradients } from '@/hooks/use-gradients';
import { useTheme } from '@/hooks/use-theme';
import { fromDateKey, relativeDayLabel, weekOf } from '@/lib/nutrition';

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Far enough to be a deliberate page, short enough not to feel sticky. */
const COMMIT_DISTANCE = 48;
/** A flick counts even when it barely moved. */
const COMMIT_VELOCITY = 480;

const EXIT = { duration: 130 } as const;
const ENTER = { damping: 20, stiffness: 220, mass: 0.6 } as const;
const SNAP_BACK = { damping: 18, stiffness: 260, mass: 0.6 } as const;

interface Props {
  /** The day in focus. Its week is the week on screen. */
  selectedDate: string;
  today: string;
  onSelectDate: (key: string) => void;
  /** Page a whole week: -1 back, +1 forward. */
  onShiftWeek: (direction: -1 | 1) => void;
  /** False on the current week — there is nothing newer to show. */
  canGoForward: boolean;
  /** Whether a day should read as "goal met". Decided by the caller. */
  isMet: (key: string) => boolean;
}

/**
 * Home's week strip, pageable through history.
 *
 * Swiping is history *viewing*. It moves which day Home is pointed at, exactly
 * as tapping a day in the strip already did — it does not change where new food
 * is logged. The tab bar's ＋ still opens the logger on today; the only route
 * into a past date is the day's own empty-state card, and that modal names the
 * date in its title.
 *
 * The direction is the carousel convention: dragging right pulls the previous
 * week in from the left, dragging left brings a newer one. Forward stops at the
 * week containing today — future days are already untappable, and a strip full
 * of them would be a dead end.
 *
 * The animation runs entirely on shared values so the strip tracks the finger
 * on the UI thread rather than through React state. Past the threshold the
 * outgoing week finishes its travel, the incoming one is placed off the
 * opposite edge, and it springs in; below the threshold it simply snaps back.
 */
export function WeekStrip({
  selectedDate,
  today,
  onSelectDate,
  onShiftWeek,
  canGoForward,
  isMet,
}: Props) {
  const theme = useTheme();
  const gradients = useGradients();

  const week = weekOf(selectedDate);

  const translateX = useSharedValue(0);
  const width = useSharedValue(0);

  /**
   * Rebuilt every render rather than memoised.
   *
   * The gesture has to know the current boundary and the current callback, and
   * a memoised one would have to reach both through refs or extra shared
   * values — more machinery than a `Gesture.Pan()` costs to construct, and one
   * more place for a stale closure to hide.
   */
  const pan = Gesture.Pan()
    // Horizontal intent only: the strip sits at the top of a long scroll view,
    // and stealing a vertical drag would make Home feel broken.
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      // Dragging left (a negative translation) reaches for a newer week; the
      // strip always travels with the finger.
      const forward = event.translationX < 0;
      // Rubber-band rather than refuse, so the edge is felt, not guessed at.
      translateX.set(forward && !canGoForward ? event.translationX * 0.22 : event.translationX);
    })
    .onEnd((event) => {
      const forward = event.translationX < 0;
      const travelled =
        Math.abs(event.translationX) > COMMIT_DISTANCE ||
        Math.abs(event.velocityX) > COMMIT_VELOCITY;

      if (!travelled || (forward && !canGoForward)) {
        translateX.set(withSpring(0, SNAP_BACK));
        return;
      }

      const span = width.get() || 320;
      translateX.set(
        withTiming(forward ? -span : span, EXIT, (finished) => {
          if (!finished) return;
          // Swap the week first, then place the incoming one off the opposite
          // edge and spring it in. The render lands a frame later, while the
          // strip is still off-screen, so the change is never seen happening.
          runOnJS(onShiftWeek)(forward ? 1 : -1);
          translateX.set(forward ? span : -span);
          translateX.set(withSpring(0, ENTER));
        }),
      );
    });

  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.get() }] }));

  function onLayout(event: LayoutChangeEvent) {
    width.set(event.nativeEvent.layout.width);
  }

  return (
    <GestureDetector gesture={pan}>
      {/* The clip lives on the outer view so the outgoing week disappears at
          the edge instead of overlapping the screen padding. */}
      <View onLayout={onLayout} style={styles.clip}>
        <Animated.View style={[styles.week, animated]}>
          {week.map((key) => {
            const isSelected = key === selectedDate;
            const isTodayCell = key === today;
            const isFuture = key > today;
            const met = isMet(key);
            const dow = fromDateKey(key).getDay();
            return (
              <PressableScale
                key={key}
                scaleTo={0.9}
                style={styles.day}
                disabled={isFuture}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: isFuture }}
                accessibilityLabel={relativeDayLabel(key)}
                onPress={() => onSelectDate(key)}>
                <ThemedText
                  type={isTodayCell ? 'smallBold' : 'small'}
                  themeColor={isTodayCell ? 'tint' : 'textSecondary'}>
                  {WEEKDAY[dow]}
                </ThemedText>
                <View
                  style={[
                    styles.dayCircle,
                    {
                      backgroundColor: met
                        ? 'transparent'
                        : isSelected
                          ? theme.tintSoft
                          : 'transparent',
                      borderColor: isSelected ? theme.tint : met ? 'transparent' : theme.border,
                      borderWidth: isSelected ? 2 : 1.5,
                    },
                  ]}>
                  {met ? (
                    <LinearGradient
                      colors={gradients.brand}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[StyleSheet.absoluteFill, { borderRadius: Radius.full }]}
                    />
                  ) : null}
                  <ThemedText
                    type={isSelected || met ? 'smallBold' : 'small'}
                    style={{
                      color: met ? theme.onTint : isFuture ? theme.tabIconDefault : theme.text,
                    }}>
                    {fromDateKey(key).getDate()}
                  </ThemedText>
                </View>
              </PressableScale>
            );
          })}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
    width: '100%',
  },
  week: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  day: {
    alignItems: 'center',
    gap: Spacing.one,
    flex: 1,
  },
  dayCircle: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
