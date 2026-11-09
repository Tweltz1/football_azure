import { Ionicons } from '@expo/vector-icons';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import { parseScan, presetQuery } from '../lib/qr';
import { useTotes } from '../lib/store';
import { ToteNative } from '../../modules/tote-native';

const FRAME = 260;

export default function Scan() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const handled = useRef(false);
  const lastBad = useRef<string>('');
  const { getTote, totes, updateTote } = useTotes();
  // find: the tote to look for (Scan to find it). mode=unload: moving day, mark each scanned tote as unloaded.
  const { find, item, mode } = useLocalSearchParams<{ find?: string; item?: string; mode?: string }>();
  const target = find ? getTote(find) : undefined;
  const unloading = mode === 'unload';
  const [result, setResult] = useState<{ ok: boolean; title: string; body?: string } | null>(null);
  const resultTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastHit = useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const moving = totes.filter((x) => x.moveTo);
  const unloadedCount = moving.filter((x) => x.unloadedAt).length;

  const show = (r: { ok: boolean; title: string; body?: string }) => {
    setResult(r);
    clearTimeout(resultTimer.current);
    resultTimer.current = setTimeout(() => setResult(null), 2600);
  };

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  const onScanned = ({ data }: BarcodeScanningResult) => {
    if (handled.current) return;
    const scanned = parseScan(data);
    if (!scanned) {
      if (lastBad.current !== data) {
        lastBad.current = data;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        setMessage("That QR code isn't a tote label");
        setTimeout(() => setMessage(null), 2200);
      }
      return;
    }
    const { id, preset } = scanned;
    if (find || unloading) {
      // Keep the camera running; ignore the same label for a moment so one look doesn't fire repeatedly.
      const now = Date.now();
      if (lastHit.current.id === id && now - lastHit.current.at < 2500) return;
      lastHit.current = { id, at: now };
      const tote = getTote(id);
      if (find) {
        if (id === find) {
          handled.current = true;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          show({ ok: true, title: 'Found it!', body: item ? `“${item}” is in this tote.` : undefined });
          setTimeout(() => router.replace(`/tote/${id}`), 1200);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          show({ ok: false, title: 'Not this one', body: tote ? `This is “${tote.name}”. Keep looking.` : 'Keep looking.' });
        }
        return;
      }
      if (!tote) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        show({ ok: false, title: 'Unknown label', body: "This label isn't linked to a tote." });
        return;
      }
      if (!tote.unloadedAt) updateTote(id, { unloadedAt: Date.now() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      show({ ok: true, title: tote.name || 'Tote', body: tote.moveTo ? `Goes to: ${tote.moveTo}` : 'No room set for this tote.' });
      return;
    }
    handled.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // Known tote: open it. Unknown (a blank pre-printed label): go straight to setup.
    router.replace(getTote(id) ? `/tote/${id}` : `/tote/edit?claim=${id}${presetQuery(preset)}`);
  };

  const readNfc = async () => {
    try {
      const url = await ToteNative?.readNfc();
      if (!url) return;
      onScanned({ data: url } as BarcodeScanningResult);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      setTimeout(() => setMessage(null), 2600);
    }
  };

  if (!permission) return <View style={styles.black} />;

  if (!permission.granted) {
    return (
      <View style={[styles.black, styles.center, { padding: 32, gap: 14 }]}>
        <Ionicons name="camera-outline" size={56} color="#fff" />
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permBody}>ToteTrack uses the camera only to scan the QR labels on your totes.</Text>
        <Button
          title={permission.canAskAgain ? 'Allow camera' : 'Open Settings'}
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
          style={{ alignSelf: 'stretch' }}
        />
        <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={styles.black}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScanned}
      />
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <View style={styles.frame}>
          <View style={[styles.corner, { top: 0, left: 0, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 24 }]} />
          <View style={[styles.corner, { top: 0, right: 0, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 24 }]} />
          <View style={[styles.corner, { bottom: 0, left: 0, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 24 }]} />
          <View style={[styles.corner, { bottom: 0, right: 0, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 24 }]} />
        </View>
        {target ? (
          <View style={styles.findBox}>
            <Text style={styles.findSmall}>{item ? `Looking for “${item}” in` : 'Looking for'}</Text>
            <Text style={styles.findBig}>{target.name || 'Untitled tote'}</Text>
            {target.location ? <Text style={styles.findSmall}>{target.location}</Text> : null}
          </View>
        ) : unloading ? (
          <View style={styles.findBox}>
            <Text style={styles.findSmall}>Moving day</Text>
            <Text style={styles.findBig}>
              {unloadedCount} of {moving.length} unloaded
            </Text>
          </View>
        ) : null}
        <Text style={styles.hint}>{target ? 'Sweep the camera across your tote labels' : unloading ? 'Scan each tote as it comes off the truck' : 'Point at a tote’s QR label'}</Text>
        {result && (
          <View style={[styles.result, { backgroundColor: result.ok ? 'rgba(48,164,108,0.95)' : 'rgba(229,72,77,0.95)' }]}>
            <Ionicons name={result.ok ? 'checkmark-circle' : 'close-circle'} size={34} color="#fff" />
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.resultTitle}>{result.title}</Text>
              {result.body ? <Text style={styles.resultBody}>{result.body}</Text> : null}
            </View>
          </View>
        )}
        {message && (
          <View style={styles.toast}>
            <Ionicons name="alert-circle" size={18} color="#fff" />
            <Text style={styles.toastText}>{message}</Text>
          </View>
        )}
      </View>
      <View style={[styles.topBar, { top: insets.top + 8 }]}>
        <RoundButton icon="close" label="Close" onPress={() => router.back()} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {ToteNative?.nfcAvailable() && !find && !unloading ? <RoundButton icon="radio-outline" label="Tap an NFC sticker" onPress={readNfc} /> : null}
          <RoundButton icon={torch ? 'flashlight' : 'flashlight-outline'} label="Flashlight" onPress={() => setTorch((v) => !v)} />
        </View>
      </View>
    </View>
  );
}

function RoundButton({ icon, label, onPress }: { icon: 'close' | 'flashlight' | 'flashlight-outline' | 'radio-outline'; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.round, { opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name={icon} size={24} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  frame: { width: FRAME, height: FRAME },
  corner: { position: 'absolute', width: 56, height: 56, borderColor: '#fff' },
  hint: { color: '#fff', fontSize: 17, fontWeight: '600', marginTop: 28, textShadowColor: '#000', textShadowRadius: 6 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    backgroundColor: 'rgba(229,72,77,0.92)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  findBox: { position: 'absolute', top: 120, left: 24, right: 24, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 18, padding: 14 },
  findSmall: { color: '#ddd', fontSize: 14 },
  findBig: { color: '#fff', fontSize: 22, fontWeight: '800', marginVertical: 2, textAlign: 'center' },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, marginHorizontal: 24, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 18 },
  resultTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  resultBody: { color: '#fff', fontSize: 15, marginTop: 2 },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  permTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  permBody: { color: '#bbb', fontSize: 16, textAlign: 'center', lineHeight: 22, marginBottom: 8 },
});
