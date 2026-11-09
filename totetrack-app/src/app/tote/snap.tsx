import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ToteNative } from '../../../modules/tote-native';
import { Button, EmptyState, IconButton, SectionTitle, tap } from '../../components/ui';
import { suggestionsFrom } from '../../lib/snap';
import { useTotes } from '../../lib/store';
import { radius, useTheme } from '../../lib/theme';

type Suggestion = { name: string; from: 'photo' | 'text'; sure: boolean; on: boolean };

export default function Snap() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const store = useTotes();
  const tote = store.getTote(id);
  const [photo, setPhoto] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);

  const take = useCallback(async (camera: boolean) => {
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert('Camera access needed', 'Allow camera access in Settings to snap your tote.');
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    const uri = res.assets[0].uri;
    setPhoto(uri);
    setSuggestions(null);
    setBusy(true);
    try {
      const result = await ToteNative!.analyzePhoto(uri);
      const existing = new Set((tote?.items ?? []).map((i) => i.name.toLowerCase()));
      setSuggestions(
        suggestionsFrom(result)
          .filter((s) => !existing.has(s.name.toLowerCase()))
          .map((s) => ({ ...s, on: s.sure })),
      );
    } catch (e) {
      Alert.alert("Couldn't read that photo", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [tote]);

  // Open the camera straight away.
  useEffect(() => {
    if (!ToteNative || !tote) return;
    const timer = setTimeout(() => take(true), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!tote) return <EmptyState icon="cube-outline" title="Tote not found" body="It may have been deleted." />;
  if (!ToteNative) {
    return <EmptyState icon="camera-outline" title="Not available here" body="Snap to add needs the ToteTrack app from TestFlight or the App Store." />;
  }

  const chosen = suggestions?.filter((s) => s.on) ?? [];
  const addAll = () => {
    for (const s of chosen) store.addItem(tote.id, s.name, 1);
    tap();
    router.back();
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Snap to add',
          headerLeft: () => <IconButton icon="close" label="Cancel" onPress={() => router.back()} color={t.textMuted} />,
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" />
        ) : (
          <View style={[styles.photo, styles.placeholder, { backgroundColor: t.card }]}>
            <Ionicons name="camera-outline" size={40} color={t.textMuted} />
            <Text style={{ color: t.textMuted, marginTop: 8, textAlign: 'center', paddingHorizontal: 24 }}>
              Take a photo looking into the open tote. Spread things out a little so each one is visible.
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Button title={photo ? 'Retake' : 'Take photo'} icon="camera" variant={photo ? 'secondary' : 'primary'} onPress={() => take(true)} style={{ flex: 1 }} />
          <Button title="Library" icon="images-outline" variant="secondary" onPress={() => take(false)} style={{ flex: 1 }} />
        </View>

        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={t.primary} />
            <Text style={{ color: t.textMuted }}>Looking at your photo…</Text>
          </View>
        ) : null}

        {suggestions && suggestions.length === 0 ? (
          <Text style={{ color: t.textMuted, textAlign: 'center', marginTop: 20, lineHeight: 21 }}>
            Nothing new recognized. Try a closer, brighter photo, or add items by typing.
          </Text>
        ) : null}

        {suggestions && suggestions.length > 0 ? (
          <>
            {(['photo', 'text'] as const).map((kind) =>
              suggestions.some((x) => x.from === kind) ? (
                <View key={kind}>
                  <SectionTitle>{kind === 'photo' ? 'Things spotted in the photo' : 'Words on labels and packaging'}</SectionTitle>
                  <View style={styles.wrap}>
                    {suggestions.map((s, i) =>
                      s.from !== kind ? null : (
                        <Pressable
                          key={s.name}
                          onPress={() => {
                            tap();
                            setSuggestions((prev) => prev!.map((x, j) => (j === i ? { ...x, on: !x.on } : x)));
                          }}
                          style={[styles.chip, { backgroundColor: s.on ? t.primary : t.card, borderColor: s.on ? t.primary : t.border }]}
                        >
                          <Ionicons name={s.on ? 'checkmark' : 'add'} size={15} color={s.on ? t.onPrimary : t.textMuted} />
                          <Text style={{ color: s.on ? t.onPrimary : t.text, fontWeight: '600', fontSize: 15 }}>{s.name}</Text>
                        </Pressable>
                      ),
                    )}
                  </View>
                </View>
              ) : null,
            )}
            <Text style={{ color: t.textMuted, fontSize: 13, marginTop: 12, lineHeight: 18 }}>
              Tap the ones you want. Only confident matches start ticked. Everything is worked out on your iPhone, so the photo never leaves your
              phone. You can rename anything after adding it, and a closer photo of one or two things at a time works best.
            </Text>
            <Button
              title={chosen.length ? `Add ${chosen.length} item${chosen.length === 1 ? '' : 's'}` : 'Choose items to add'}
              icon="checkmark"
              disabled={!chosen.length}
              onPress={addAll}
              style={{ marginTop: 20 }}
            />
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', height: 260, borderRadius: radius.lg },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  busy: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 38, borderRadius: 19, borderWidth: 1 },
});
