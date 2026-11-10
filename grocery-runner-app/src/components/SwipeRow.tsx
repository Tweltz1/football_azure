import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import { radius, useTheme } from '../lib/theme';
import { tap } from './ui';

const DELETE_AT = 110;

/**
 * A row that is removed by swiping it to the left. Built on React Native's own gestures.
 * The gesture keeps the first `onDelete` it was given, so pass one that stays valid for the row.
 */
export function SwipeRow({ children, onDelete }: { children: ReactNode; onDelete: () => void }) {
  const t = useTheme();
  const [x] = useState(() => new Animated.Value(0));
  const [pan] = useState(() =>
    PanResponder.create({
      // Only take over clearly sideways drags, so the list still scrolls.
      onMoveShouldSetPanResponder: (_, g) => g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderMove: (_, g) => x.setValue(Math.min(0, g.dx)),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -DELETE_AT || g.vx < -1.2) {
          tap();
          Animated.timing(x, { toValue: -600, duration: 160, useNativeDriver: true }).start(() => {
            onDelete();
            x.setValue(0);
          });
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(),
    }),
  );

  return (
    <View>
      <View style={[StyleSheet.absoluteFill, styles.behind, { backgroundColor: t.danger }]}>
        <Ionicons name="trash" size={20} color="#fff" />
        <Text style={styles.behindText}>Remove</Text>
      </View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  behind: { borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingRight: 18 },
  behindText: { color: '#fff', fontWeight: '700' },
});
