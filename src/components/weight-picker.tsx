import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { PressableScale } from '@/components/motion';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import {
  clampTenths,
  formatTenths,
  fromTenths,
  parseWeightInput,
  sanitizeWeightText,
  toTenths,
  type WeightUnit,
} from '@/lib/weight-input';

interface WeightPickerProps {
  /** Value in the current display unit. */
  value: number;
  unit: WeightUnit;
  onChange: (value: number) => void;
  onToggleUnit?: (unit: WeightUnit) => void;
  /** Bounds in the display unit. Defaults come from `WEIGHT_BOUNDS`. */
  min?: number;
  max?: number;
}

/**
 * Pixels of drag per 0.1 unit.
 *
 * This is the number that decides whether the control feels precise. The old
 * slider mapped its entire 30–250 kg range onto the width of the screen, which
 * put roughly 0.7 kg under every pixel — 0.1 kg was not merely hard to hit, it
 * was unrepresentable. A ruler instead scrolls *past* a fixed marker, so the
 * scale is set by how far your thumb travels rather than by how wide the phone
 * is: 6 px per tenth means 1 kg costs about a centimetre of travel, fine enough
 * to land on a specific tenth and coarse enough to cross a couple of kg in one
 * swipe. Anything further away is faster to type, which is what the field is for.
 */
const PX_PER_TENTH = 6;

/** Ticks are drawn this far beyond each edge so none pops in at the boundary. */
const OVERSCAN_PX = 40;

/**
 * Weight entry to a tenth of a unit.
 *
 * Three ways in, because they serve genuinely different jobs: drag the ruler for
 * the daily "about the same as yesterday" adjustment, tap ± when you are one
 * tick out, and type when the number is far from where you are (onboarding, or a
 * unit you don't think in). All three write the same integer-tenths value, so
 * they can't disagree with each other.
 *
 * The drag deliberately reads `gestureState.dx` from where the gesture started
 * rather than the touch's position within the view. Position-based tracking is
 * what made the old slider jump: `locationX` is relative to whichever view
 * received the event, so the moment a finger crossed the 28 px thumb the
 * coordinates changed frame of reference and the value leapt. An accumulated
 * delta has no such frame to lose, and it also means the value never shifts on
 * release — there is nothing left to re-derive.
 */
export function WeightPicker({ value, unit, onChange, onToggleUnit, min, max }: WeightPickerProps) {
  const theme = useTheme();

  const bounds = {
    min: min == null ? undefined : toTenths(min),
    max: max == null ? undefined : toTenths(max),
  };
  const clamp = (t: number) => clampTenths(t, unit, bounds);

  const tenths = clamp(toTenths(value));

  /**
   * The pan handlers are built once, so they cannot close over this render's
   * props. A single ref holding everything they need — kept current by an
   * effect rather than written during render — is what bridges that.
   */
  const live = useRef({
    tenths,
    clamp,
    onChange,
    lastUnit: Math.floor(tenths / 10),
  });
  useEffect(() => {
    live.current.tenths = tenths;
    live.current.clamp = clamp;
    live.current.onChange = onChange;
  });

  const dragStartRef = useRef(tenths);
  const [width, setWidth] = useState(0);

  // --- Typed entry ---------------------------------------------------------
  //
  // `draft` is non-null only while the field has focus. Outside an edit the box
  // simply *is* the value, with no effect syncing the two — which is what used
  // to rewrite the box under the cursor and make a two-digit number impossible
  // to type.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? formatTenths(tenths);

  function commitTenths(next: number, haptic = true) {
    const clamped = live.current.clamp(next);
    if (clamped === live.current.tenths) return;
    if (haptic && Math.floor(clamped / 10) !== live.current.lastUnit) {
      live.current.lastUnit = Math.floor(clamped / 10);
      haptics.selection();
    }
    live.current.tenths = clamped;
    live.current.onChange(fromTenths(clamped));
  }

  // The rule below fires because the factory runs during render and the
  // closures inside it mention `live.current`. It is a syntactic check and
  // cannot see that none of those closures *runs* during render — they are
  // gesture callbacks, invoked only from a touch, which is exactly the "event
  // handlers and effects" case the rule permits. Reading the ref is the point:
  // a drag must follow the value as it currently is, and re-creating the
  // responder on every render to capture fresh props would drop an in-flight
  // gesture mid-swipe.
  const responder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2,
        // Claim the gesture from any parent ScrollView once it is clearly horizontal.
        onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > Math.abs(g.dy) + 2,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragStartRef.current = live.current.tenths;
          live.current.lastUnit = Math.floor(live.current.tenths / 10);
        },
        onPanResponderMove: (_e, g) => {
          // Dragging left (negative dx) reveals higher numbers, like a real tape.
          commitTenths(dragStartRef.current - Math.round(g.dx / PX_PER_TENTH));
        },
        // No work on release: the value is already exactly what is on screen.
      }),
    [],
  );

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  function nudge(delta: number) {
    haptics.light();
    commitTenths(live.current.tenths + delta, false);
  }

  function onType(raw: string) {
    const cleaned = sanitizeWeightText(raw);
    setDraft(cleaned);
    const parsed = parseWeightInput(cleaned);
    // Only publish a complete number. "8" on the way to "82" is not a weight,
    // and clamping it to the minimum is how the old field ate keystrokes.
    if (parsed != null) commitTenths(parsed, false);
  }

  function onBlur() {
    // Whatever half-finished text is left, commit it and drop the draft — the
    // box then reads straight off the value again.
    const parsed = parseWeightInput(draft ?? '');
    if (parsed != null) commitTenths(parsed, false);
    setDraft(null);
  }

  // --- Ruler ticks ---------------------------------------------------------
  const centre = width / 2;
  const ticks: { x: number; t: number }[] = [];
  if (width > 0) {
    const span = Math.ceil((centre + OVERSCAN_PX) / PX_PER_TENTH);
    for (let d = -span; d <= span; d += 1) {
      const t = tenths + d;
      // The tape simply stops at the bounds rather than wrapping or clamping,
      // so the ends of the range are visible instead of silently piling up.
      if (clamp(t) !== t) continue;
      ticks.push({ x: centre + d * PX_PER_TENTH, t });
    }
  }

  return (
    <View style={styles.container}>
      {onToggleUnit && (
        <Segmented
          value={unit}
          onChange={onToggleUnit}
          options={[
            { value: 'kg', label: 'kg' },
            { value: 'lbs', label: 'lbs' },
          ]}
        />
      )}

      <View style={styles.valueRow}>
        <PressableScale
          onPress={() => nudge(-1)}
          scaleTo={0.9}
          accessibilityRole="button"
          accessibilityLabel={`Decrease weight by 0.1 ${unit}`}
          style={[styles.nudge, { borderColor: theme.border }]}
        >
          <Ionicons name="remove" size={20} color={theme.text} />
        </PressableScale>

        <Pressable style={styles.valueTap}>
          <TextInput
            value={text}
            onChangeText={onType}
            // Start from an empty box rather than the current number: the first
            // thing anyone does when correcting a weight is type the whole
            // value, and clearing beats making them delete four characters.
            onFocus={() => setDraft('')}
            onBlur={onBlur}
            keyboardType="decimal-pad"
            // NOT `selectTextOnFocus`. Every keystroke re-renders this
            // controlled input, and on web that re-selects the contents, so the
            // next character replaces the previous one — typing "82" yields
            // "2". Clearing on focus gives the same convenience without it.
            accessibilityLabel={`Weight in ${unit}`}
            style={[styles.input, { color: theme.text }]}
          />
          <ThemedText type="default" themeColor="textSecondary" style={styles.unit}>
            {unit}
          </ThemedText>
        </Pressable>

        <PressableScale
          onPress={() => nudge(1)}
          scaleTo={0.9}
          accessibilityRole="button"
          accessibilityLabel={`Increase weight by 0.1 ${unit}`}
          style={[styles.nudge, { borderColor: theme.border }]}
        >
          <Ionicons name="add" size={20} color={theme.text} />
        </PressableScale>
      </View>

      <View
        style={[styles.ruler, { backgroundColor: theme.backgroundSelected }]}
        onLayout={onLayout}
        accessibilityRole="adjustable"
        accessibilityLabel={`Weight ruler, ${formatTenths(tenths)} ${unit}`}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        {...responder.panHandlers}
      >
        {ticks.map(({ x, t }) => {
          const whole = t % 10 === 0;
          const half = t % 5 === 0;
          return (
            <View
              key={t}
              pointerEvents="none"
              style={[
                styles.tick,
                {
                  left: x,
                  height: whole ? 22 : half ? 14 : 8,
                  backgroundColor: whole ? theme.textSecondary : theme.border,
                },
              ]}
            />
          );
        })}
        {/* Centre marker: the value under it is the value in the field. */}
        <View
          pointerEvents="none"
          style={[styles.marker, { left: centre - 1, backgroundColor: theme.tint }]}
        />
      </View>

      <View style={styles.scaleRow}>
        <ThemedText type="small" themeColor="textSecondary">
          Drag to adjust · ± steps 0.1 {unit}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  valueTap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: Spacing.one,
    minWidth: 150,
  },
  nudge: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    fontSize: 48,
    fontWeight: '800',
    textAlign: 'center',
    minWidth: 120,
    paddingVertical: Spacing.one,
  },
  unit: {
    fontSize: 18,
  },
  ruler: {
    height: 56,
    borderRadius: Radius.md,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  tick: {
    position: 'absolute',
    width: StyleSheet.hairlineWidth * 2,
    top: 17,
  },
  marker: {
    position: 'absolute',
    width: 2,
    top: 8,
    bottom: 8,
    borderRadius: 1,
  },
  scaleRow: {
    alignItems: 'center',
  },
});
