import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { radius, useTheme } from '../lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function tap() {
  Haptics.selectionAsync().catch(() => {});
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, icon, variant = 'primary', disabled, loading, style }: ButtonProps) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.primary : variant === 'secondary' ? t.cardAlt : 'transparent';
  const fg = variant === 'primary' ? t.onPrimary : variant === 'secondary' ? t.text : t.primary;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={19} color={fg} />}
          <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.card, borderRadius: radius.lg, padding: 16 }, style]}>{children}</View>;
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        tap();
        onPress();
      }}
      style={[styles.chip, { backgroundColor: selected ? t.primary : t.cardAlt }]}
    >
      <Text style={{ color: selected ? t.onPrimary : t.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

/** Big page title at the top of each tab, with an optional action on the right. */
export function ScreenHeader({ title, action }: { title: string; action?: { label: string; icon?: IconName; onPress: () => void } }) {
  const t = useTheme();
  return (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={[styles.headerTitle, { color: t.text }]}>
        {title}
      </Text>
      {action && (
        <Pressable
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => {
            tap();
            action.onPress();
          }}
          style={styles.headerAction}
        >
          {action.icon && <Ionicons name={action.icon} size={18} color={t.primary} />}
          <Text style={{ color: t.primary, fontSize: 16, fontWeight: '600' }}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Two or three side-by-side choices, like the iOS segmented control. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: t.cardAlt }, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) tap();
              onChange(o.value);
            }}
            style={[styles.segment, on && { backgroundColor: t.card, shadowOpacity: 0.12 }]}
          >
            <Text style={{ color: on ? t.text : t.textMuted, fontWeight: '600', fontSize: 15 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.section, { color: t.textMuted }]}>{children}</Text>;
}


// "© <year> Weltzcraft Studios" copyright line at the bottom of the app; the name links to the studio
// site (clear STUDIO_URL to show plain text).
export const STUDIO_NAME = 'Weltzcraft Studios';
export const STUDIO_URL = 'https://weltzcraft.com';

export function StudioCredit({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const name = (
    <Text style={{ fontWeight: '600' }} onPress={STUDIO_URL ? () => Linking.openURL(STUDIO_URL) : undefined}>
      {STUDIO_NAME}
    </Text>
  );
  return (
    <View style={[{ paddingVertical: 20, alignItems: 'center' }, style]}>
      <Text style={{ color: t.textMuted, fontSize: 12, opacity: 0.8 }}>© {new Date().getFullYear()} {name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    paddingHorizontal: 18,
    borderRadius: radius.md,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  headerAction: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 6 },
  segmented: { flexDirection: 'row', padding: 3, borderRadius: radius.sm },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: radius.sm - 2,
    shadowColor: '#000',
    shadowOpacity: 0,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  section: { fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 20, marginBottom: 8 },
});
