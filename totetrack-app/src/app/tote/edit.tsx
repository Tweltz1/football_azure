import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, IconButton, IconName, SectionTitle, tap, ToteBadge } from '../../components/ui';
import { deletePhoto, photoUri, savePhoto } from '../../lib/photos';
import { shortCode } from '../../lib/qr';
import { useTotes } from '../../lib/store';
import { radius, TOTE_COLORS, TOTE_ICONS, useTheme } from '../../lib/theme';
import { SEASONS } from '../../lib/extras';

export default function EditTote() {
  const { id, claim, name: presetName, loc, c } = useLocalSearchParams<{ id?: string; claim?: string; name?: string; loc?: string; c?: string }>();
  const t = useTheme();
  const store = useTotes();
  const existing = id ? store.getTote(id) : undefined;

  const [name, setName] = useState(existing?.name ?? presetName ?? '');
  const [location, setLocation] = useState(existing?.location ?? loc ?? '');
  const [color, setColor] = useState(existing?.color ?? (c && /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : TOTE_COLORS[store.totes.length % TOTE_COLORS.length]));
  const [icon, setIcon] = useState<string>(existing?.icon ?? 'cube');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [season, setSeason] = useState<string | undefined>(existing?.season);
  const [photo, setPhoto] = useState<string | undefined>(existing?.photo);
  const [busy, setBusy] = useState(false);

  const recentLocations = useMemo(() => {
    const seen = new Set<string>();
    for (const x of [...store.totes].sort((a, b) => b.updatedAt - a.updatedAt)) {
      const l = x.location.trim();
      if (l) seen.add(l);
    }
    return [...seen].slice(0, 8);
  }, [store.totes]);

  const pickPhoto = async (camera: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [4, 3] };
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert('Camera access needed', 'Allow camera access in Settings to take tote photos.');
    }
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    setBusy(true);
    try {
      const saved = await savePhoto(res.assets[0].uri);
      if (photo && photo !== existing?.photo) deletePhoto(photo);
      setPhoto(saved);
    } catch {
      Alert.alert("Couldn't save that photo");
    } finally {
      setBusy(false);
    }
  };

  const photoMenu = () =>
    Alert.alert('Tote photo', 'A photo helps you spot the right tote.', [
      { text: 'Take photo', onPress: () => pickPhoto(true) },
      { text: 'Choose from library', onPress: () => pickPhoto(false) },
      ...(photo ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: () => setPhoto(undefined) }] : []),
      { text: 'Cancel', style: 'cancel' },
    ]);

  const save = () => {
    const input = { name: name.trim(), location: location.trim(), color, icon, notes: notes.trim(), photo, season };
    if (!input.name) return Alert.alert('Give your tote a name', 'Something like “Christmas lights” or “Camping gear”.');
    if (existing) {
      if (existing.photo && existing.photo !== photo) deletePhoto(existing.photo);
      store.updateTote(existing.id, input);
      router.back();
    } else {
      const created = store.createTote(input, claim);
      router.dismiss();
      router.push(`/tote/${created.id}`);
    }
  };

  const uri = photoUri(photo);

  return (
    <>
      <Stack.Screen
        options={{
          title: existing ? 'Edit tote' : 'New tote',
          headerLeft: () => <IconButton icon="close" label="Cancel" onPress={() => router.back()} color={t.textMuted} />,
          headerRight: () => (
            <Pressable onPress={save} hitSlop={10}>
              <Text style={{ color: t.primary, fontSize: 17, fontWeight: '700' }}>Save</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {claim && !existing ? (
          <View style={[styles.banner, { backgroundColor: t.primarySoft }]}>
            <Ionicons name="qr-code" size={20} color={t.primary} />
            <Text style={{ color: t.text, flex: 1, fontSize: 14 }}>
              Linking label <Text style={{ fontWeight: '800' }}>{shortCode(claim)}</Text> to this new tote.
            </Text>
          </View>
        ) : null}

        <View style={styles.previewRow}>
          <Pressable onPress={photoMenu} style={[styles.photoBox, { backgroundColor: t.card, borderColor: t.border }]}>
            {uri ? (
              <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <>
                <Ionicons name="camera-outline" size={26} color={t.textMuted} />
                <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 4 }}>{busy ? 'Saving…' : 'Add photo'}</Text>
              </>
            )}
          </Pressable>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <ToteBadge color={color} icon={icon} size={72} />
          </View>
        </View>

        <Field label="Name">
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Christmas lights"
            placeholderTextColor={t.textMuted}
            autoFocus={!existing}
            autoCapitalize="words"
            returnKeyType="next"
            style={[styles.input, { backgroundColor: t.card, color: t.text, borderColor: t.border }]}
          />
        </Field>

        <Field label="Where it's stored">
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Garage, top shelf"
            placeholderTextColor={t.textMuted}
            autoCapitalize="sentences"
            style={[styles.input, { backgroundColor: t.card, color: t.text, borderColor: t.border }]}
          />
          {recentLocations.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
              {recentLocations.map((l) => (
                <Pressable
                  key={l}
                  onPress={() => {
                    tap();
                    setLocation(l);
                  }}
                  style={[styles.chip, { backgroundColor: l === location ? t.primary : t.cardAlt }]}
                >
                  <Text style={{ color: l === location ? t.onPrimary : t.text, fontWeight: '600', fontSize: 14 }}>{l}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Field>

        <SectionTitle>Color</SectionTitle>
        <View style={styles.wrap}>
          {TOTE_COLORS.map((c) => (
            <Pressable
              key={c}
              accessibilityLabel={`Color ${c}`}
              onPress={() => {
                tap();
                setColor(c);
              }}
              style={[styles.swatch, { backgroundColor: c, borderColor: c === color ? t.text : 'transparent' }]}
            >
              {c === color && <Ionicons name="checkmark" size={20} color="#fff" />}
            </Pressable>
          ))}
        </View>

        <SectionTitle>Icon</SectionTitle>
        <View style={styles.wrap}>
          {TOTE_ICONS.map((i) => {
            const on = i === icon;
            return (
              <Pressable
                key={i}
                accessibilityLabel={`Icon ${i}`}
                onPress={() => {
                  tap();
                  setIcon(i);
                }}
                style={[styles.iconCell, { backgroundColor: on ? color + '26' : t.card, borderColor: on ? color : t.border }]}
              >
                <Ionicons name={i as IconName} size={22} color={on ? color : t.textMuted} />
              </Pressable>
            );
          })}
        </View>

        <SectionTitle>Season or holiday</SectionTitle>
        <Text style={{ color: t.textMuted, fontSize: 14, marginTop: -4, marginBottom: 10 }}>
          ToteTrack reminds you a few weeks before it comes up.
        </Text>
        <View style={styles.wrap}>
          {[{ name: 'None', icon: 'close' }, ...SEASONS].map((s) => {
            const on = s.name === 'None' ? !season : s.name === season;
            return (
              <Pressable
                key={s.name}
                onPress={() => {
                  tap();
                  setSeason(s.name === 'None' ? undefined : s.name);
                }}
                style={[styles.chip, { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? t.primary : t.cardAlt }]}
              >
                <Ionicons name={s.icon as IconName} size={15} color={on ? t.onPrimary : t.textMuted} />
                <Text style={{ color: on ? t.onPrimary : t.text, fontWeight: '600', fontSize: 14 }}>{s.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <Field label="Notes">
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything else worth remembering"
            placeholderTextColor={t.textMuted}
            multiline
            style={[styles.input, styles.multiline, { backgroundColor: t.card, color: t.text, borderColor: t.border }]}
          />
        </Field>

        <Button title={existing ? 'Save changes' : 'Create tote'} icon="checkmark" onPress={save} style={{ marginTop: 28 }} />
      </ScrollView>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <SectionTitle>{label}</SectionTitle>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, marginBottom: 8 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 8 },
  photoBox: {
    width: 120,
    height: 90,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  input: { fontSize: 17, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, height: 52 },
  multiline: { height: 110, paddingTop: 14, textAlignVertical: 'top' },
  chip: { paddingHorizontal: 14, height: 34, borderRadius: 17, justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  iconCell: { width: 52, height: 52, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
