import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { radius, useTheme } from '../lib/theme';

/** A labelled text box for the store manager screens. */
export function Field({ label, style, ...props }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 10, flex: 1 }}>
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
      <TextInput
        placeholderTextColor={t.textMuted}
        {...props}
        style={[styles.input, { color: t.text, backgroundColor: t.cardAlt, borderColor: t.border }, style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: '600', fontSize: 14, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
