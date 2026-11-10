import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ToteNative } from '../../../modules/tote-native';
import { ProPaywall } from '../../components/ProPaywall';
import { Button, EmptyState, IconButton, SectionTitle, tap } from '../../components/ui';
import { usePro } from '../../lib/pro';
import { suggestionsFrom } from '../../lib/snap';
import { forgetLooks, loadLooks, matchLooks, rememberLooks } from '../../lib/snapLooks';
import { applyMemory, forgetSnapMemory, type LearnedSuggestion, learnedCount, loadSnapMemory, rememberSnap, type SnapMemory } from '../../lib/snapMemory';
import { useTotes } from '../../lib/store';
import { radius, useTheme } from '../../lib/theme';

type Suggestion = LearnedSuggestion & { on: boolean };

const section = (s: Suggestion) => (s.from === 'text' ? 'text' : 'photo');

export default function Snap() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const store = useTotes();
  const tote = store.getTote(id);
  const [photo, setPhoto] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const [memory, setMemory] = useState<SnapMemory | null>(null);
  const pro = usePro();
  // Out of free snaps: the Pro screen shows here, and Snap carries on once subscribed.
  const [needPro, setNeedPro] = useState(false);

  useEffect(() => {
    loadSnapMemory().then(setMemory);
  }, []);

  const take = useCallback(async (camera: boolean) => {
    if (!pro.canSnap) return setNeedPro(true);
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
    setShowSkipped(false);
    setBusy(true);
    try {
      const result = await ToteNative!.analyzePhoto(uri);
      pro.usedSnap();
      const existing = new Set((tote?.items ?? []).map((i) => i.name.toLowerCase()));
      // What you've renamed, added and skipped before shapes what Snap offers now.
      const mem = await loadSnapMemory();
      // Things that look like ones you've added before come first, under your name for them.
      const yours = matchLooks(await loadLooks(), result.looks ?? []);
      const taken = new Set(yours.map((s) => s.name.toLowerCase()));
      const fresh = suggestionsFrom(result).filter((s) => !taken.has(s.name.toLowerCase()));
      setSuggestions(
        applyMemory(mem, [...yours, ...fresh])
          .filter((s) => !existing.has(s.name.toLowerCase()))
          .map((s) => ({ ...s, on: s.sure && !s.skipped })),
      );
    } catch (e) {
      Alert.alert("Couldn't read that photo", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [tote, pro]);

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

  if (needPro && !pro.isPro) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'ToteTrack Pro',
            headerLeft: () => <IconButton icon="close" label="Cancel" onPress={() => router.back()} color={t.textMuted} />,
          }}
        />
        <ProPaywall reason="snap" />
      </>
    );
  }

  const visible = suggestions?.filter((s) => showSkipped || !s.skipped) ?? [];
  const hiddenCount = (suggestions?.length ?? 0) - visible.length;
  const chosen = visible.filter((s) => s.on);
  const learned = memory ? learnedCount(memory) : 0;

  const addAll = () => {
    for (const s of chosen) store.addItem(tote.id, s.name, s.qty);
    // Only what you saw counts, so hidden suggestions aren't marked as skipped again.
    rememberSnap(visible.map((s) => ({ key: s.key, name: s.name, added: s.on })));
    rememberLooks(chosen.map((s) => ({ name: s.name, look: s.look })));
    tap();
    router.back();
  };

  const rename = (s: Suggestion) => {
    if (Platform.OS !== 'ios') return;
    Alert.prompt(
      'Rename',
      'Snap will use your name for this next time.',
      (text) => {
        const name = text?.trim();
        if (!name) return;
        tap();
        setSuggestions((prev) => prev!.map((x) => (x.key === s.key ? { ...x, name, renamed: name.toLowerCase() !== x.key, on: true } : x)));
      },
      'plain-text',
      s.name,
    );
  };

  const resetLearning = () =>
    Alert.alert('Reset what Snap learned?', 'Snap forgets the names you gave things, what you usually skip, and what your things look like.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          await forgetSnapMemory();
          await forgetLooks();
          setMemory(await loadSnapMemory());
        },
      },
    ]);

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
        {pro.freeSnapsLeft !== null ? (
          <Pressable onPress={() => router.push('/pro')} style={{ alignSelf: 'center', marginTop: 10 }}>
            <Text style={{ color: t.textMuted, fontSize: 13 }}>
              {pro.freeSnapsLeft} free snap{pro.freeSnapsLeft === 1 ? '' : 's'} left · <Text style={{ color: t.primary, fontWeight: '700' }}>Get Pro</Text>
            </Text>
          </Pressable>
        ) : null}

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

        {suggestions && suggestions.length > 0 && visible.length === 0 ? (
          <Text style={{ color: t.textMuted, textAlign: 'center', marginTop: 20, lineHeight: 21 }}>
            Snap only found things you usually skip.
          </Text>
        ) : null}

        {suggestions && suggestions.length > 0 ? (
          <>
            {(['photo', 'text'] as const).map((kind) =>
              visible.some((x) => section(x) === kind) ? (
                <View key={kind}>
                  <SectionTitle>{kind === 'photo' ? 'Things spotted in the photo' : 'Words on labels and packaging'}</SectionTitle>
                  <View style={styles.wrap}>
                    {visible.map((s) =>
                      section(s) !== kind ? null : (
                        <Pressable
                          key={s.key}
                          onPress={() => {
                            tap();
                            setSuggestions((prev) => prev!.map((x) => (x.key === s.key ? { ...x, on: !x.on } : x)));
                          }}
                          onLongPress={() => rename(s)}
                          accessibilityHint="Press and hold to rename"
                          style={[styles.chip, { backgroundColor: s.on ? t.primary : t.card, borderColor: s.on ? t.primary : t.border }]}
                        >
                          <Ionicons name={s.on ? 'checkmark' : s.from === 'object' ? 'scan-outline' : s.from === 'fallback' ? 'cube-outline' : 'add'} size={15} color={s.on ? t.onPrimary : t.textMuted} />
                          <Text style={{ color: s.on ? t.onPrimary : t.text, fontWeight: '600', fontSize: 15 }}>{s.name}</Text>
                          {s.renamed ? <Ionicons name="sparkles" size={12} color={s.on ? t.onPrimary : t.primary} accessibilityLabel="Your name" /> : null}
                          {s.qty > 1 ? <Text style={{ color: s.on ? t.onPrimary : t.textMuted, fontSize: 13, fontWeight: '600' }}>×{s.qty}</Text> : null}
                        </Pressable>
                      ),
                    )}
                  </View>
                </View>
              ) : null,
            )}
            {hiddenCount > 0 ? (
              <Pressable onPress={() => setShowSkipped(true)} hitSlop={8} style={{ marginTop: 12, alignSelf: 'flex-start' }}>
                <Text style={{ color: t.primary, fontWeight: '600' }}>
                  Show {hiddenCount} you usually skip
                </Text>
              </Pressable>
            ) : null}
            <Text style={{ color: t.textMuted, fontSize: 13, marginTop: 12, lineHeight: 18 }}>
              Tap the ones you want, or press and hold one to rename it. Snap learns from what you add, skip and rename, so it gets better the more
              you use it. Everything is worked out on your iPhone, so the photo never leaves your phone, and a closer photo of one or two things at a
              time works best.
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

        {learned > 0 && !busy ? (
          <Pressable onPress={resetLearning} hitSlop={8} style={{ alignSelf: 'center', marginTop: 24, padding: 6 }}>
            <Text style={{ color: t.textMuted, fontSize: 13 }}>
              Snap has learned {learned} thing{learned === 1 ? '' : 's'} from you on this phone. <Text style={{ color: t.primary, fontWeight: '600' }}>Reset</Text>
            </Text>
          </Pressable>
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
