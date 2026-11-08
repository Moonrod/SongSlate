import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { colors } from './theme';

/**
 * Horizontal bar over a time range. Drag or tap to set `value`; the
 * highlighted region shows the section that will be cut.
 */
export function ScrubBar({
  min,
  max,
  value,
  region,
  onChange,
  disabled,
  accessibilityLabel,
}: {
  min: number;
  max: number;
  value: number;
  region?: { start: number; end: number };
  onChange: (value: number) => void;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  const [width, setWidth] = useState(0);
  // Latest props for the responder, which is created once.
  const latest = useRef({ min, max, width, onChange, disabled });
  useEffect(() => {
    latest.current = { min, max, width, onChange, disabled };
  }, [min, max, width, onChange, disabled]);

  // The responder only reads `latest.current` inside touch callbacks, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => {
    const fromX = (x: number) => {
      const { min: lo, max: hi, width: w, onChange: cb, disabled: off } = latest.current;
      if (off || w <= 0 || hi <= lo) return;
      cb(lo + Math.min(1, Math.max(0, x / w)) * (hi - lo));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => fromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => fromX(e.nativeEvent.locationX),
    });
  });

  const span = Math.max(1e-6, max - min);
  const pct = (t: number) => `${Math.min(100, Math.max(0, ((t - min) / span) * 100))}%` as const;

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, disabled && { opacity: 0.4 }]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      {...responder.panHandlers}
    >
      {region ? (
        <View
          pointerEvents="none"
          style={[styles.region, { left: pct(region.start), width: `${Math.max(0, ((region.end - region.start) / span) * 100)}%` }]}
        />
      ) : null}
      <View pointerEvents="none" style={[styles.handle, { left: pct(value) }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  region: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 200, 83, 0.28)',
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: colors.slateGreen,
  },
  handle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 4,
    marginLeft: -2,
    backgroundColor: colors.accent,
  },
});
