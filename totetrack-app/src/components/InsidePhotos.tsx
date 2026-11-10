import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPhotoVersion, photoUri, saveInsidePhoto, subscribePhotos } from '../lib/photos';
import { useTotes } from '../lib/store';
import { radius, useTheme } from '../lib/theme';
import { Tote } from '../lib/types';
import { Card, tap } from './ui';

const THUMB = 96;

/** Photos of what's inside a tote: a row of thumbnails with an Add tile, and a full-screen viewer. */
export function InsidePhotos({ tote }: { tote: Tote }) {
  const t = useTheme();
  const store = useTotes();
  const photos = tote.insidePhotos ?? [];
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  // Redraw when sync brings down a photo from another phone.
  const version = useSyncExternalStore(subscribePhotos, getPhotoVersion);

  const add = async (camera: boolean) => {
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert('Camera access needed', 'Allow camera access in Settings to take photos of what’s inside.');
    }
    const res = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: true, selectionLimit: 20, orderedSelection: true });
    if (res.canceled || !res.assets?.length) return;
    setBusy(true);
    try {
      const names: string[] = [];
      for (const a of res.assets) names.push(await saveInsidePhoto(a.uri, a.width));
      // Newest first, keeping the order they were picked in.
      store.addInsidePhotos(tote.id, names.reverse());
      tap();
    } catch {
      Alert.alert("Couldn't save that photo");
    } finally {
      setBusy(false);
    }
  };

  const addMenu = () =>
    Alert.alert('Photos of what’s inside', 'Snap the open tote so you can see what’s in it without digging.', [
      { text: 'Take photo', onPress: () => add(true) },
      { text: 'Choose from library', onPress: () => add(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const addTile = (
    <Pressable
      accessibilityLabel="Add a photo of what's inside"
      onPress={addMenu}
      disabled={busy}
      style={[styles.thumb, styles.addTile, { borderColor: t.primary + '66', backgroundColor: t.primarySoft }]}
    >
      {busy ? <ActivityIndicator color={t.primary} /> : <Ionicons name="camera" size={26} color={t.primary} />}
      <Text style={{ color: t.primary, fontWeight: '700', fontSize: 12, marginTop: 4 }}>{busy ? 'Saving…' : 'Add photo'}</Text>
    </Pressable>
  );

  return (
    <>
      {photos.length === 0 ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12 }}>
          {addTile}
          <Text style={{ flex: 1, color: t.textMuted, fontSize: 15, lineHeight: 21 }}>
            Take pictures of the inside so you can see what’s in this tote without opening it.
          </Text>
        </Card>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }} style={{ marginHorizontal: -16 }}>
          <View style={{ width: 6 }} />
          {addTile}
          {photos.map((name, i) => (
            <Pressable key={name + version} accessibilityLabel={`Inside photo ${i + 1} of ${photos.length}`} onPress={() => setViewing(i)}>
              <Image source={{ uri: photoUri(name) }} style={[styles.thumb, { backgroundColor: t.cardAlt }]} contentFit="cover" transition={120} />
            </Pressable>
          ))}
          <View style={{ width: 6 }} />
        </ScrollView>
      )}
      {viewing !== null && photos.length ? (
        <Viewer
          photos={photos}
          start={Math.min(viewing, photos.length - 1)}
          version={version}
          onClose={() => setViewing(null)}
          onDelete={(name) => {
            if (photos.length === 1) setViewing(null);
            store.removeInsidePhoto(tote.id, name);
          }}
        />
      ) : null}
    </>
  );
}

function Viewer({ photos, start, version, onClose, onDelete }: { photos: string[]; start: number; version: number; onClose: () => void; onDelete: (name: string) => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(start);
  const list = useRef<FlatList<string>>(null);
  const current = Math.min(index, photos.length - 1);

  const confirmDelete = () =>
    Alert.alert('Delete this photo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(photos[current]) },
    ]);

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <FlatList
          ref={list}
          data={photos}
          keyExtractor={(n) => n + version}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={start}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <ScrollView
              style={{ width, height }}
              contentContainerStyle={{ width, height, justifyContent: 'center' }}
              maximumZoomScale={4}
              minimumZoomScale={1}
              centerContent
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <Image source={{ uri: photoUri(item) }} style={{ width, height }} contentFit="contain" />
            </ScrollView>
          )}
        />
        <View style={[styles.bar, { top: insets.top + 8 }]}>
          <Pressable accessibilityLabel="Close" onPress={onClose} hitSlop={10} style={styles.round}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.counter}>
            {current + 1} of {photos.length}
          </Text>
          <Pressable accessibilityLabel="Delete this photo" onPress={confirmDelete} hitSlop={10} style={styles.round}>
            <Ionicons name="trash-outline" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.md },
  addTile: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed' },
  bar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  counter: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
