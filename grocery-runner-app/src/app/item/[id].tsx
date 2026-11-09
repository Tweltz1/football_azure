import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, Chip, SectionTitle } from '../../components/ui';
import { DEPARTMENT_LABEL, DEPARTMENT_ORDER, guessDepartment } from '../../lib/departments';
import { locationLabel } from '../../lib/labels';
import { useData } from '../../lib/store';
import { radius, useTheme } from '../../lib/theme';
import { Department } from '../../lib/types';

export default function ItemScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, store, setLocation } = useData();
  const item = items.find((i) => i.id === id);
  const [aisle, setAisle] = useState(item?.location.kind === 'aisle' ? item.location.aisle : '');

  if (!item) return null;
  const current =
    item.location.kind === 'department'
      ? item.location.department
      : item.location.kind === 'unknown'
        ? guessDepartment(item.name)
        : null;

  const saveAisle = () => {
    const a = aisle.trim();
    if (!a) return;
    setLocation(item.id, { kind: 'aisle', aisle: a, source: 'user' });
    router.back();
  };

  const saveDept = (department: Department) => {
    setLocation(item.id, { kind: 'department', department, source: 'user' });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, { color: t.text }]}>{item.name}</Text>
      <Text style={{ color: t.textMuted }}>Now: {locationLabel(item).text}</Text>

      <SectionTitle>Aisle number</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput
            value={aisle}
            onChangeText={setAisle}
            placeholder="e.g. 14 or A14"
            placeholderTextColor={t.textMuted}
            autoCapitalize="characters"
            onSubmitEditing={saveAisle}
            style={[styles.input, { color: t.text, backgroundColor: t.cardAlt }]}
          />
          <Button title="Save" onPress={saveAisle} disabled={!aisle.trim()} />
        </View>
        {store && (
          <Text style={{ color: t.textMuted, marginTop: 8 }}>{store.id.startsWith("custom:") ? `Remembered for ${store.name} next time.` : `Remembered, and shared with other shoppers at ${store.name}.`}</Text>
        )}
      </Card>

      <SectionTitle>Or a department</SectionTitle>
      <View style={styles.chips}>
        {DEPARTMENT_ORDER.map((d) => (
          <Chip key={d} label={DEPARTMENT_LABEL[d]} selected={current === d} onPress={() => saveDept(d)} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
  input: { flex: 1, fontSize: 17, paddingHorizontal: 14, height: 52, borderRadius: radius.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
