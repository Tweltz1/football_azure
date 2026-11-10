import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { tap } from './ui';

const ACTION_WIDTH = 88;

/**
 * A list row you can swipe left to delete, like Mail or Reminders: a short swipe shows a Delete
 * button, a long swipe deletes straight away. Vertical drags still scroll the list.
 */
export function SwipeRow({
  children,
  onDelete,
  color,
  background,
  label = 'Delete',
}: {
  children: ReactNode;
  onDelete: () => void;
  /** The delete button's color. */
  color: string;
  /** The row's own background, which covers the button until you swipe. */
  background: string;
  label?: string;
}) {
  const { width } = useWindowDimensions();
  const [x] = useState(() => new Animated.Value(0));
  const offset = useRef(0);
  const deleting = useRef(false);
  const [open, setOpen] = useState(false);
  const latest = useRef({ onDelete, width });
  useEffect(() => {
    latest.current = { onDelete, width };
  });

  const settle = (to: number) => {
    offset.current = to;
    setOpen(to !== 0);
    Animated.spring(x, { toValue: to, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
  };

  const remove = () => {
    if (deleting.current) return;
    deleting.current = true;
    tap();
    Animated.timing(x, { toValue: -latest.current.width, duration: 180, useNativeDriver: true }).start(() => latest.current.onDelete());
  };

  // The refs are only read inside the gesture callbacks, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => x.setValue(Math.min(0, offset.current + g.dx)),
      onPanResponderRelease: (_, g) => {
        const end = offset.current + g.dx;
        if (end < -latest.current.width * 0.5 || (g.vx < -1.6 && end < -ACTION_WIDTH)) remove();
        else if (end < -ACTION_WIDTH / 2 || g.vx < -0.5) settle(-ACTION_WIDTH);
        else settle(0);
      },
      onPanResponderTerminate: () => settle(0),
    }),
  );

  return (
    <View style={{ overflow: 'hidden' }}>
      <View style={[StyleSheet.absoluteFill, styles.behind, { backgroundColor: color }]}>
        <Pressable accessibilityLabel={label} onPress={remove} style={styles.action}>
          <Ionicons name="trash" size={20} color="#fff" />
          <Text style={styles.actionText}>{label}</Text>
        </Pressable>
      </View>
      <Animated.View
        {...pan.panHandlers}
        // While swiped open, a tap on the row just closes it instead of opening the item.
        pointerEvents={open ? 'box-only' : 'auto'}
        onTouchEnd={() => open && !deleting.current && settle(0)}
        style={{ backgroundColor: background, transform: [{ translateX: x }] }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  behind: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'stretch' },
  action: { width: ACTION_WIDTH, alignItems: 'center', justifyContent: 'center', gap: 2 },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
