import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useEffect, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../lib/theme';
import { tap } from './ui';

/** How far a short swipe opens the row, showing the Delete button. */
const OPEN_AT = 92;

// Only one row stays open at a time, like Mail: opening another (or scrolling) closes the last one.
const setWidth = (box: { width: number }, w: number) => {
  box.width = w;
};

const setDelete = (box: { onDelete: () => void }, f: () => void) => {
  box.onDelete = f;
};

let closeOpenRow: (() => void) | null = null;
export function closeSwipeRows() {
  closeOpenRow?.();
  closeOpenRow = null;
}

/**
 * A row you swipe left to delete, built on React Native's own gestures.
 * - A short swipe opens it and shows a red Delete button; tap it to delete, or tap the row to close.
 * - A long, fast swipe (past half the row) deletes straight away.
 * `onDelete` is read when the delete happens, so it can change between renders.
 */
export function SwipeRow({
  children,
  onDelete,
  style,
  label = 'Delete',
}: {
  children: ReactNode;
  onDelete: () => void;
  /** Rounded corners etc. for the red area behind, to match the row. */
  style?: StyleProp<ViewStyle>;
  label?: string;
}) {
  const t = useTheme();
  const [x] = useState(() => new Animated.Value(0));
  // A plain box (not a ref) the gesture handlers read and write; made once per row.
  // offset: 0 closed, -OPEN_AT open.
  const [box] = useState(() => ({ width: 360, offset: 0, onDelete }));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setDelete(box, onDelete);
  }, [box, onDelete]);

  // Made once, so the gesture (also made once) and the open-row tracking see the same functions.
  const [{ close, remove, settle }] = useState(() => {
    const settle = (to: number) => {
      box.offset = to;
      setOpen(to < 0);
      Animated.spring(x, { toValue: to, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
    };
    const close = () => settle(0);
    const remove = () => {
      tap();
      if (closeOpenRow === close) closeOpenRow = null;
      Animated.timing(x, { toValue: -box.width - 40, duration: 180, useNativeDriver: true }).start(() => {
        box.onDelete();
        box.offset = 0;
        setOpen(false);
        x.setValue(0);
      });
    };
    return { close, remove, settle };
  });

  const [pan] = useState(() =>
    PanResponder.create({
      // Only take over clearly sideways drags, so the list still scrolls up and down.
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6 && (g.dx < 0 || box.offset < 0),
      onPanResponderGrant: () => {
        if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
        closeOpenRow = close;
      },
      // Keep the swipe once it started, so the list's scrolling doesn't cancel it halfway.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderMove: (_, g) => x.setValue(Math.min(0, box.offset + g.dx)),
      onPanResponderRelease: (_, g) => {
        const at = box.offset + g.dx;
        if (at < -box.width * 0.5 || (g.vx < -1.6 && at < -OPEN_AT / 2)) remove();
        else if (at < -OPEN_AT / 2) settle(-OPEN_AT);
        else close();
      },
      onPanResponderTerminate: () => close(),
    }),
  );

  // While Delete shows, the whole red area deletes; the faded row button closes it again.
  const deleteOpacity = x.interpolate({ inputRange: [-OPEN_AT, -24, 0], outputRange: [1, 0.4, 0], extrapolate: 'clamp' });
  return (
    <View onLayout={(e) => setWidth(box, e.nativeEvent.layout.width)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={remove}
        style={[StyleSheet.absoluteFill, styles.behind, { backgroundColor: t.danger }, style]}
      >
        <Animated.View style={[styles.behindInner, { opacity: deleteOpacity }]}>
          <Ionicons name="trash" size={20} color="#fff" />
          <Text style={styles.behindText}>{label}</Text>
        </Animated.View>
      </Pressable>
      <Animated.View
        style={{ transform: [{ translateX: x }] }}
        {...pan.panHandlers}
        onTouchStart={() => {
          if (closeOpenRow && closeOpenRow !== close) closeSwipeRows();
        }}
        // Screen readers can't swipe; give them a Delete action on the row.
        accessibilityActions={[{ name: 'delete', label }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === 'delete' && box.onDelete()}
      >
        {children}
        {open && <Pressable accessibilityLabel="Close" onPress={close} style={StyleSheet.absoluteFill} />}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  behind: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  behindInner: { width: OPEN_AT, alignItems: 'center', justifyContent: 'center', gap: 2 },
  behindText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
