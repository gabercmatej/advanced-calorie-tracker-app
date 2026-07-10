import { useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type GestureResponderEvent,
} from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

/**
 * A minimal, dependency-free horizontal slider built on PanResponder so it
 * works on iOS, Android and web. Reports snapped values within [min, max].
 */
export function Slider({ value, min, max, step = 1, onChange }: SliderProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);

  const clampSnap = (v: number) => {
    const snapped = Math.round(v / step) * step;
    return Math.max(min, Math.min(max, snapped));
  };

  const valueAt = (x: number) => {
    const w = widthRef.current;
    if (w <= 0) return value;
    const frac = Math.max(0, Math.min(1, x / w));
    return clampSnap(min + frac * (max - min));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => onChange(valueAt(e.nativeEvent.locationX)),
      onPanResponderMove: (e: GestureResponderEvent) => onChange(valueAt(e.nativeEvent.locationX)),
    }),
  ).current;

  function onLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setWidth(w);
  }

  const frac = max > min ? (Math.max(min, Math.min(max, value)) - min) / (max - min) : 0;
  const thumbX = frac * width;

  return (
    <View style={styles.container} onLayout={onLayout} {...responder.panHandlers}>
      <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.fill, { width: thumbX, backgroundColor: theme.tint }]} />
      </View>
      <View
        style={[
          styles.thumb,
          { left: thumbX - 14, backgroundColor: theme.backgroundElement, borderColor: theme.tint },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 44,
    justifyContent: 'center',
    // Give touches near the ends room.
    paddingHorizontal: 0,
  },
  track: {
    height: 8,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: Radius.full,
  },
  thumb: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
  },
});
