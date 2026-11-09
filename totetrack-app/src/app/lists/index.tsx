import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, EmptyState, IconButton, tap } from '../../components/ui';
import { useLists } from '../../lib/lists';
import { radius, useTheme } from '../../lib/theme';

function promptNewList(create: (name: string) => { id: string }) {
  Alert.prompt('New packing list', 'Like “Camping trip” or “Beach weekend”.', (text) => {
    if (!text?.trim()) return;
    const l = create(text);
    router.push(`/lists/${l.id}`);
  });
}

export default function Lists() {
  const t = useTheme();
  const { lists, createList } = useLists();
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Packing lists',
          headerRight: () => <IconButton icon="add" label="New list" onPress={() => promptNewList(createList)} />,
        }}
      />
      {lists.length === 0 ? (
        <EmptyState
          icon="bag-check-outline"
          title="Pack from your totes"
          body="Make a list for a trip, pull in items from any tote, and check them off as you pack. It tells you which tote each thing is in."
          action={<Button title="New packing list" icon="add" onPress={() => promptNewList(createList)} />}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {lists.map((l) => {
            const done = l.entries.filter((e) => e.packed).length;
            return (
              <Pressable
                key={l.id}
                onPress={() => {
                  tap();
                  router.push(`/lists/${l.id}`);
                }}
                style={({ pressed }) => [styles.row, { backgroundColor: t.card, opacity: pressed ? 0.85 : 1 }]}
              >
                <View style={[styles.icon, { backgroundColor: t.primarySoft }]}>
                  <Ionicons name="bag-check" size={22} color={t.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: t.text }]}>{l.name}</Text>
                  <Text style={{ color: t.textMuted }}>
                    {l.entries.length ? `${done} of ${l.entries.length} packed` : 'No items yet'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.lg },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '700' },
});
