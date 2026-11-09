import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, SectionTitle, tap, ToteBadge } from '../components/ui';
import { EXPIRY_WINDOW_DAYS, expiryLabel, reminderCount, reminders, SEASON_WINDOW_DAYS, timeSince } from '../lib/extras';
import { useTotes } from '../lib/store';
import { useTheme } from '../lib/theme';

export default function RemindersScreen() {
  const t = useTheme();
  const { totes, updateItem } = useTotes();
  const r = useMemo(() => reminders(totes), [totes]);

  return (
    <>
      <Stack.Screen options={{ title: 'Reminders' }} />
      {reminderCount(r) === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="All clear"
          body={`Seasonal totes show up here ${SEASON_WINDOW_DAYS} days ahead, expiring items ${EXPIRY_WINDOW_DAYS} days ahead, and anything you've lent out until it's back.`}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {r.seasons.length > 0 && <SectionTitle>Coming up</SectionTitle>}
          {r.seasons.map((s) => (
            <Card key={s.season} style={{ marginBottom: 12 }}>
              <Text style={[styles.big, { color: t.text }]}>
                {s.season} {s.days === 0 ? 'starts today' : `in ${s.days} day${s.days === 1 ? '' : 's'}`}
              </Text>
              <Text style={{ color: t.textMuted, marginBottom: 8 }}>Time to get these out:</Text>
              {s.totes.map((tote) => (
                <Pressable key={tote.id} onPress={() => router.push(`/tote/${tote.id}`)} style={styles.row}>
                  <ToteBadge color={tote.color} icon={tote.icon} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: t.text }]}>{tote.name}</Text>
                    {tote.location ? <Text style={{ color: t.textMuted }}>{tote.location}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
                </Pressable>
              ))}
            </Card>
          ))}

          {r.expiring.length > 0 && <SectionTitle>Expiring</SectionTitle>}
          {r.expiring.length > 0 && (
            <Card style={{ padding: 0 }}>
              {r.expiring.map(({ tote, item, days }, i) => (
                <Pressable
                  key={item.id}
                  onPress={() => router.push(`/tote/${tote.id}`)}
                  style={[styles.line, { borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: t.border }]}
                >
                  <Ionicons name="hourglass-outline" size={20} color={days < 0 ? t.danger : '#B45309'} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: t.text }]}>{item.name}</Text>
                    <Text style={{ color: days < 0 ? t.danger : t.textMuted }}>
                      {expiryLabel(item.expires!)} · {tote.name}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </Card>
          )}

          {r.out.length > 0 && <SectionTitle>Lent out or taken out</SectionTitle>}
          {r.out.length > 0 && (
            <Card style={{ padding: 0 }}>
              {r.out.map(({ tote, item }, i) => (
                <View key={item.id} style={[styles.line, { borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: t.border }]}>
                  <Ionicons name="arrow-redo-outline" size={20} color="#B45309" />
                  <Pressable style={{ flex: 1 }} onPress={() => router.push(`/tote/${tote.id}`)}>
                    <Text style={[styles.name, { color: t.text }]}>{item.name}</Text>
                    <Text style={{ color: t.textMuted }}>
                      With {item.out!.to} for {timeSince(item.out!.at)} · from {tote.name}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      tap();
                      updateItem(tote.id, item.id, { out: undefined });
                    }}
                    style={[styles.back, { backgroundColor: t.primarySoft }]}
                  >
                    <Text style={{ color: t.primary, fontWeight: '700' }}>It’s back</Text>
                  </Pressable>
                </View>
              ))}
            </Card>
          )}
        </ScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  name: { fontSize: 16, fontWeight: '600' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  back: { paddingHorizontal: 12, height: 34, borderRadius: 10, justifyContent: 'center' },
});
