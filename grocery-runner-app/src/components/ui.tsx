import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { radius, Theme, useTheme } from '../lib/theme';

/** The soft lift under cards (light mode only; dark mode uses the card color alone). */
export function lift(t: Theme): ViewStyle {
  return t.bg === '#F7F4EC'
    ? { shadowColor: '#4A3B1A', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } }
    : {};
}

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
  /** For icon-only buttons. */
  label?: string;
};

export function Button({ title, onPress, icon, variant = 'primary', disabled, loading, style, label }: ButtonProps) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.primary : variant === 'secondary' ? t.cardAlt : 'transparent';
  const fg = variant === 'primary' ? t.onPrimary : variant === 'secondary' ? t.text : t.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
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
          {!!title && <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
        </>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.card, borderRadius: radius.lg, padding: 16 }, lift(t), style]}>{children}</View>;
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
      style={[styles.chip, selected ? { backgroundColor: t.text, borderColor: t.text } : { backgroundColor: t.card, borderColor: t.border }]}
    >
      <Text style={{ color: selected ? t.bg : t.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

/** Big page title at the top of each tab, with an optional action on the right. */
export function ScreenHeader({
  title,
  subtitle,
  action,
  iconAction,
}: {
  title: string;
  /** A short line under the title, like "8 to get". */
  subtitle?: string;
  action?: { label: string; icon?: IconName; onPress: () => void };
  /** A plain icon button left of the action (e.g. the account). */
  iconAction?: { icon: IconName; label: string; onPress: () => void };
}) {
  const t = useTheme();
  return (
    <View style={styles.header}>
      <View style={{ flexShrink: 1 }}>
        {!!subtitle && (
          <Text style={[styles.headerSub, { color: t.accent }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
        <Text accessibilityRole="header" style={[styles.headerTitle, { color: t.text }]}>
          {title}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 18 }}>
      {iconAction && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={iconAction.label}
          hitSlop={12}
          onPress={() => {
            tap();
            iconAction.onPress();
          }}
          style={styles.headerAction}
        >
          <Ionicons name={iconAction.icon} size={24} color={t.primary} />
        </Pressable>
      )}
      {action && (
        <Pressable
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => {
            tap();
            action.onPress();
          }}
          style={[styles.headerAction, styles.headerPill, { backgroundColor: t.primarySoft }]}
        >
          {action.icon && <Ionicons name={action.icon} size={17} color={t.primary} />}
          <Text style={{ color: t.primary, fontSize: 15, fontWeight: '700' }}>{action.label}</Text>
        </Pressable>
      )}
      </View>
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
  return <Text style={[styles.section, { color: t.text }]}>{children}</Text>;
}


// "© <year> Weltzcraft Studios" copyright line at the bottom of the app; the name links to the studio
// site (clear STUDIO_URL to show plain text).
export const STUDIO_NAME = 'Weltzcraft Studios';
export const STUDIO_URL = 'https://weltzcraft.com';
// Support email (arrives in the studio inbox, replies go out from the same address) and privacy page.
export const SUPPORT_EMAIL = 'shopstride@weltzcraft.com';
export const PRIVACY_URL = 'https://weltzcraft.com/shopstride/privacy';

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
      <Text style={{ color: t.textMuted, fontSize: 12, opacity: 0.8, marginTop: 6 }}>
        <Text
          style={{ fontWeight: '600' }}
          accessibilityRole="link"
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Shop Stride feedback')}`)}
        >
          Contact us
        </Text>
        {'  ·  '}
        <Text style={{ fontWeight: '600' }} accessibilityRole="link" onPress={() => Linking.openURL(PRIVACY_URL)}>
          Privacy
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    paddingHorizontal: 22,
    borderRadius: 999,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  headerTitle: { fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  headerSub: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2, marginBottom: 1 },
  headerAction: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 6 },
  headerPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, marginBottom: 4 },
  segmented: { flexDirection: 'row', padding: 3, borderRadius: 999 },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  section: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2, marginTop: 22, marginBottom: 10 },
});
