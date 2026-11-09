import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useMemo } from 'react';
import { ActionSheetIOS, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, EmptyState, IconButton, SectionTitle, tap, ToteBadge } from '../components/ui';
import { useTotes } from '../lib/store';
import { radius, useTheme } from '../lib/theme';
import { Tote } from '../lib/types';

const ROOMS = ['Kitchen', 'Living room', 'Primary bedroom', 'Bedroom 2', 'Bathroom', 'Office', 'Garage', 'Basement', 'Attic', 'Kids room'];

export default function Moving() {
  const t = useTheme();
  const { totes, updateTote } = useTotes();
  const used = useMemo(() => [...new Set(totes.map((x) => x.moveTo).filter((r): r is string => !!r))], [totes]);
  const assigned = totes.filter((x) => x.moveTo);
  const unassigned = totes.filter((x) => !x.moveTo);
  const unloaded = assigned.filter((x) => x.unloadedAt).length;

  const byRoom = new Map<string, Tote[]>();
  for (const x of assigned) byRoom.set(x.moveTo!, [...(byRoom.get(x.moveTo!) ?? []), x]);

  const pickRoom = (tote: Tote) => {
    const rooms = [...new Set([...used, ...ROOMS])];
    const typeRoom = () =>
      Alert.prompt('Which room?', undefined, (text) => text?.trim() && updateTote(tote.id, { moveTo: text.trim(), unloadedAt: undefined }), 'plain-text', tote.moveTo ?? '');
    const options = [...rooms, 'Other room…', ...(tote.moveTo ? ['Not moving this one'] : []), 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions(
      { title: `Where does “${tote.name}” go?`, options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: tote.moveTo ? options.length - 2 : undefined },
      (i) => {
        if (i < rooms.length) updateTote(tote.id, { moveTo: rooms[i], unloadedAt: undefined });
        else if (i === rooms.length) typeRoom();
        else if (tote.moveTo && i === rooms.length + 1) updateTote(tote.id, { moveTo: undefined, unloadedAt: undefined });
      },
    );
  };

  const finish = () =>
    Alert.alert('Done moving?', 'This clears the room and unloaded marks from every tote. Your totes and items stay.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => assigned.forEach((x) => updateTote(x.id, { moveTo: undefined, unloadedAt: undefined })) },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: 'Moving', headerRight: () => (assigned.length ? <IconButton icon="checkmark-done" label="Done moving" onPress={finish} /> : null) }} />
      {totes.length === 0 ? (
        <EmptyState icon="car-outline" title="No totes yet" body="Add your totes first, then give each one a room at the new place." />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          <Card>
            <Text style={[styles.big, { color: t.text }]}>
              {assigned.length ? `${unloaded} of ${assigned.length} unloaded` : 'Moving soon?'}
            </Text>
            <Text style={{ color: t.textMuted, lineHeight: 20, marginBottom: 12 }}>
              Give each tote a room at the new place. On moving day, scan each tote as it comes off the truck. The scanner tells the movers which room it
              goes to and checks it off here.
            </Text>
            {assigned.length > 0 && (
              <View style={[styles.track, { backgroundColor: t.cardAlt }]}>
                <View style={[styles.fill, { backgroundColor: t.success, width: `${(unloaded / assigned.length) * 100}%` }]} />
              </View>
            )}
            <Button title="Scan totes off the truck" icon="scan" onPress={() => router.push('/scan?mode=unload')} disabled={!assigned.length} />
          </Card>

          {[...byRoom.entries()].map(([room, list]) => (
            <View key={room}>
              <SectionTitle>
                {room} · {list.filter((x) => x.unloadedAt).length}/{list.length}
              </SectionTitle>
              <Card style={{ padding: 0 }}>
                {list.map((x, i) => (
                  <ToteLine key={x.id} tote={x} first={i === 0} onPress={() => pickRoom(x)} />
                ))}
              </Card>
            </View>
          ))}

          {unassigned.length > 0 && <SectionTitle>No room yet</SectionTitle>}
          {unassigned.length > 0 && (
            <Card style={{ padding: 0 }}>
              {unassigned.map((x, i) => (
                <ToteLine key={x.id} tote={x} first={i === 0} onPress={() => pickRoom(x)} />
              ))}
            </Card>
          )}
        </ScrollView>
      )}
    </>
  );
}

function ToteLine({ tote, first, onPress }: { tote: Tote; first: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={[styles.line, { borderTopWidth: first ? 0 : StyleSheet.hairlineWidth, borderTopColor: t.border }]}
    >
      <ToteBadge color={tote.color} icon={tote.icon} size={34} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{tote.name || 'Untitled tote'}</Text>
        <Text style={{ color: t.textMuted }}>{tote.moveTo ? `→ ${tote.moveTo}` : 'Tap to pick a room'}</Text>
      </View>
      {tote.moveTo ? (
        <Ionicons name={tote.unloadedAt ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={tote.unloadedAt ? t.success : t.textMuted} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  track: { height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 14 },
  fill: { height: '100%', borderRadius: radius.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
});
