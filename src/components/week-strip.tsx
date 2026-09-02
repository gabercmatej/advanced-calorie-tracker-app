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
import { dayState } from '@/lib/day-state';
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
  /** Any day in the week to display. Moved by paging, never by tapping. */
  anchorDate: string;
  /** The day Home is pointed at. Highlighted only when it falls in this week. */
  selectedDate: string;
  today: string;
  onSelectDate: (key: string) => void;
  /** Page a whole week: -1 back, +1 forward. */
  onShiftWeek: (direction: -1 | 1) => void;
  /** False on the current week — there is nothing newer to show. */
  canGoForward: boolean;
  /** Whether a day has at least one food entry. Read straight off the diary. */
  hasFood: (key: string) => boolean;
  /** Whether a day has a weigh-in. Either one on its own counts as activity. */
  hasWeight: (key: string) => boolean;
}

/**
 * Home's week strip, pageable through history.
 *
 * Paging and selection are separate. A swipe changes only which seven days are
 * on screen; the day Home is pointed at changes when — and only when — you tap
 * one. Paging back from a selected Tuesday used to jump the selection to the
 * previous Tuesday, which meant browsing history silently moved the day whose
 * meals were on screen. Now the previous week is simply shown, still with
 * Tuesday's totals below it, until a day in it is tapped.
 *
 * Three separate facts are drawn on the same seven circles, and each gets its
 * own channel so none can be mistaken for another: **today** is the filled
 * emerald circle and nothing else ever is; a **past day with activity** — food
 * or a weigh-in — is an emerald ring; the **selected** day carries a small dot
 * beneath it. Selection deliberately does not reuse the green circle, because
 * that is precisely how yesterday came to look like today.
 *
 * A consequence worth knowing: while you are looking at another week, no cell
 * is selected, because the selected day is not among the seven on screen.
 * That is the honest rendering — a highlight would have to point at a day that
 * is not the one the screen is describing.
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
  anchorDate,
  selectedDate,
  today,
  onSelectDate,
  onShiftWeek,
  canGoForward,
  hasFood,
  hasWeight,
}: Props) {
  const theme = useTheme();
  const gradients = useGradients();

  const week = weekOf(anchorDate);

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
            const { isToday, isSelected, hasActivity: active, isFuture } = dayState({
              date: key,
              today,
              selectedDate,
              hasFood: hasFood(key),
              hasWeight: hasWeight(key),
            });
            const dow = fromDateKey(key).getDay();
            return (
              <PressableScale
                key={key}
                scaleTo={0.9}
                style={styles.day}
                disabled={isFuture}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: isFuture }}
                accessibilityLabel={`${relativeDayLabel(key)}${active ? ', logged' : ''}`}
                onPress={() => onSelectDate(key)}>
                <ThemedText
                  type={isToday ? 'smallBold' : 'small'}
                  themeColor={isToday ? 'tint' : 'textSecondary'}>
                  {WEEKDAY[dow]}
                </ThemedText>
                <View
                  style={[
                    styles.dayCircle,
                    {
                      // Today is filled; a day with activity is ringed; a day
                      // with neither is the plain hairline border.
                      backgroundColor: 'transparent',
                      borderColor: isToday
                        ? 'transparent'
                        : active
                          ? theme.tint
                          : theme.border,
                      borderWidth: active && !isToday ? 2 : 1.5,
                    },
                  ]}>
                  {isToday ? (
                    <LinearGradient
                      colors={gradients.brand}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[StyleSheet.absoluteFill, { borderRadius: Radius.full }]}
                    />
                  ) : null}
                  <ThemedText
                    type={isToday || active ? 'smallBold' : 'small'}
                    style={{
                      color: isToday
                        ? theme.onTint
                        : isFuture
                          ? theme.tabIconDefault
                          : theme.text,
                    }}>
                    {fromDateKey(key).getDate()}
                  </ThemedText>
                </View>
                {/* Selection, kept off the circle entirely. The space is always
                    reserved so the strip does not change height as it moves. */}
                <View
                  style={[
                    styles.selectedDot,
                    { backgroundColor: isSelected ? theme.tint : 'transparent' },
                  ]}
                />
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
  selectedDot: {
    width: 5,
    height: 5,
    borderRadius: Radius.full,
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
