import { Ionicons } from '@expo/vector-icons';
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
  const { items, store, setLocation, renameItem } = useData();
  const item = items.find((i) => i.id === id);
  const [aisle, setAisle] = useState(item?.location.kind === 'aisle' ? item.location.aisle : '');
  const [name, setName] = useState(item?.name ?? '');

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
    renameItem(item.id, name);
    setLocation(item.id, { kind: 'aisle', aisle: a, source: 'user' }, name);
    router.back();
  };

  const saveDept = (department: Department) => {
    renameItem(item.id, name);
    setLocation(item.id, { kind: 'department', department, source: 'user' }, name);
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <TextInput
          value={name}
          onChangeText={setName}
          onSubmitEditing={() => renameItem(item.id, name)}
          onBlur={() => renameItem(item.id, name)}
          accessibilityLabel="Item name"
          returnKeyType="done"
          maxLength={80}
          style={[styles.title, styles.nameInput, { color: t.text, borderColor: t.border }]}
        />
        <Ionicons name="pencil" size={18} color={t.textMuted} />
      </View>
      <Text style={{ color: t.textMuted }}>
        {item.amount ? `${item.amount} · ` : ''}Now: {locationLabel(item).text}
      </Text>

      <SectionTitle>Aisle number</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput
            value={aisle}
            onChangeText={setAisle}
            placeholder="e.g. 14 or A14"
            maxLength={8}
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

      <Button
        title="Read it from a store-app screenshot"
        icon="scan"
        variant="secondary"
        onPress={() => router.push({ pathname: '/aisle-scan', params: { itemId: item.id } })}
        style={{ marginTop: 12 }}
      />

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
  nameInput: { flex: 1, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  input: { flex: 1, fontSize: 17, paddingHorizontal: 14, height: 52, borderRadius: radius.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
