import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  PanResponder,
  StyleSheet,
  View,
  type PanResponderInstance,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const TAP_SLOP = 14;
const SWIPE_DISTANCE = 60;
export const LONG_PRESS_MS = 600;

interface Handlers {
  onTap: () => void;
  onLongPress: () => void;
  onSwipe: (direction: 'next' | 'prev') => void;
}

/**
 * One PanResponder decides between tap, long-press and horizontal swipe, so the
 * three never conflict. `box.current` always holds the latest handlers.
 */
function createSlateResponder(box: { current: Handlers }): PanResponderInstance {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let longPressed = false;
  let moved = false;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      longPressed = false;
      moved = false;
      clear();
      timer = setTimeout(() => {
        if (!moved) {
          longPressed = true;
          box.current.onLongPress();
        }
      }, LONG_PRESS_MS);
    },
    onPanResponderMove: (_e, g) => {
      if (Math.abs(g.dx) > TAP_SLOP || Math.abs(g.dy) > TAP_SLOP) {
        moved = true;
        clear();
      }
    },
    onPanResponderRelease: (_e, g) => {
      clear();
      if (longPressed) return;
      if (Math.abs(g.dx) >= SWIPE_DISTANCE && Math.abs(g.dx) > Math.abs(g.dy) * 1.5) {
        box.current.onSwipe(g.dx < 0 ? 'next' : 'prev');
      } else if (Math.abs(g.dx) <= TAP_SLOP && Math.abs(g.dy) <= TAP_SLOP) {
        box.current.onTap();
      }
    },
    onPanResponderTerminate: clear,
  });
}

/**
 * Full-screen gesture surface for the slate. Child Pressables (nav buttons)
 * still win their own touches because they become responder first.
 */
export function SlateSurface({
  onTap,
  onLongPress,
  onSwipe,
  style,
  children,
}: Handlers & { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const handlers = useRef<Handlers>({ onTap, onLongPress, onSwipe });
  // The factory only dereferences `handlers.current` inside touch callbacks, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => createSlateResponder(handlers));

  useEffect(() => {
    handlers.current = { onTap, onLongPress, onSwipe };
  }, [onTap, onLongPress, onSwipe]);

  return (
    <View style={[styles.fill, style]} {...responder.panHandlers}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
