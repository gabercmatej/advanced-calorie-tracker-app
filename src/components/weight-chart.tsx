import { Fragment, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Polygon,
  Polyline,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { daysBetween, fromDateKey, kgToLb } from '@/lib/nutrition';
import type { UnitSystem, WeightEntry } from '@/types';

interface WeightChartProps {
  actual: WeightEntry[];
  /** Straight-line "should be going" projection, start → target. */
  projection?: { date: string; weightKg: number }[];
  units: UnitSystem;
  height?: number;
}

const PAD_LEFT = 34;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 22;

/**
 * Weight-over-time chart: a solid line for logged weights and a dashed line
 * for the target trajectory, so users can see actual vs. plan at a glance.
 */
export function WeightChart({ actual, projection = [], units, height = 200 }: WeightChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  const sorted = [...actual].sort((a, b) => (a.date < b.date ? -1 : 1));
  const all = [...sorted, ...projection];

  if (all.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <ThemedText type="small" themeColor="textSecondary">
          Log your weight to see progress here.
        </ThemedText>
      </View>
    );
  }

  const toDisplay = (kg: number) => (units === 'imperial' ? kgToLb(kg) : kg);

  // Domains.
  const startDate = all.reduce((min, p) => (p.date < min ? p.date : min), all[0].date);
  const endDate = all.reduce((max, p) => (p.date > max ? p.date : max), all[0].date);
  const spanDays = Math.max(1, daysBetween(startDate, endDate));

  const values = all.map((p) => toDisplay(p.weightKg));
  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  if (yMin === yMax) {
    yMin -= 2;
    yMax += 2;
  }
  const yPad = (yMax - yMin) * 0.15;
  yMin -= yPad;
  yMax += yPad;

  const innerW = Math.max(1, width - PAD_LEFT - PAD_RIGHT);
  const innerH = height - PAD_TOP - PAD_BOTTOM;

  const px = (date: string) => PAD_LEFT + (daysBetween(startDate, date) / spanDays) * innerW;
  const py = (kg: number) =>
    PAD_TOP + innerH - ((toDisplay(kg) - yMin) / (yMax - yMin)) * innerH;

  const actualPts = sorted.map((p) => `${px(p.date)},${py(p.weightKg)}`).join(' ');
  const projCoords = projection.map((p) => ({ x: px(p.date), y: py(p.weightKg) }));
  const projPts = projCoords.map((p) => `${p.x},${p.y}`).join(' ');
  // Soft filled band under the target trajectory (line + area down to the axis).
  const chartBottom = PAD_TOP + innerH;
  const projArea =
    projCoords.length >= 2
      ? [
          ...projCoords.map((p) => `${p.x},${p.y}`),
          `${projCoords[projCoords.length - 1].x},${chartBottom}`,
          `${projCoords[0].x},${chartBottom}`,
        ].join(' ')
      : '';

  const unit = units === 'imperial' ? 'lb' : 'kg';

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="targetBand" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={theme.success} stopOpacity={0.28} />
              <Stop offset="1" stopColor={theme.success} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {/* Horizontal gridlines + y labels */}
          {[0, 0.5, 1].map((t) => {
            const y = PAD_TOP + innerH * t;
            const val = Math.round(yMax - (yMax - yMin) * t);
            return (
              <Fragment key={`grid${t}`}>
                <Line
                  x1={PAD_LEFT}
                  y1={y}
                  x2={width - PAD_RIGHT}
                  y2={y}
                  stroke={theme.border}
                  strokeWidth={1}
                />
                <SvgText
                  x={PAD_LEFT - 6}
                  y={y + 3}
                  fontSize={9}
                  fill={theme.textSecondary}
                  textAnchor="end">
                  {val}
                </SvgText>
              </Fragment>
            );
          })}

          {/* Target trajectory — a soft gradient band with a smooth line on top */}
          {projArea ? <Polygon points={projArea} fill="url(#targetBand)" /> : null}
          {projPts ? (
            <Polyline
              points={projPts}
              fill="none"
              stroke={theme.success}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.9}
            />
          ) : null}

          {/* Actual weights (solid) */}
          {actualPts ? (
            <Polyline
              points={actualPts}
              fill="none"
              stroke={theme.tint}
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
          ) : null}
          {sorted.map((p) => (
            <Circle key={p.date} cx={px(p.date)} cy={py(p.weightKg)} r={3.5} fill={theme.tint} />
          ))}

          {/* X axis end labels */}
          <SvgText x={PAD_LEFT} y={height - 6} fontSize={9} fill={theme.textSecondary} textAnchor="start">
            {monthLabel(startDate)}
          </SvgText>
          <SvgText
            x={width - PAD_RIGHT}
            y={height - 6}
            fontSize={9}
            fill={theme.textSecondary}
            textAnchor="end">
            {monthLabel(endDate)}
          </SvgText>
        </Svg>
      )}

      <View style={styles.legend}>
        <Legend color={theme.tint} label={`Actual (${unit})`} />
        {projection.length ? <Legend color={theme.success} label="Target" /> : null}
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendLine, { backgroundColor: color }]} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function monthLabel(date: string): string {
  return fromDateKey(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    flexDirection: 'row',
    gap: Spacing.three,
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  legendLine: {
    width: 16,
    height: 3,
    borderRadius: 2,
  },
});
