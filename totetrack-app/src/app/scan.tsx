import { Ionicons } from '@expo/vector-icons';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import { parseScan, presetQuery } from '../lib/qr';
import { useTotes } from '../lib/store';

const FRAME = 260;

export default function Scan() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const handled = useRef(false);
  const lastBad = useRef<string>('');
  const { getTote } = useTotes();

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
    handled.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // Known tote: open it. Unknown (a blank pre-printed label): go straight to setup.
    const { id, preset } = scanned;
    router.replace(getTote(id) ? `/tote/${id}` : `/tote/edit?claim=${id}${presetQuery(preset)}`);
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
        <Text style={styles.hint}>Point at a tote’s QR label</Text>
        {message && (
          <View style={styles.toast}>
            <Ionicons name="alert-circle" size={18} color="#fff" />
            <Text style={styles.toastText}>{message}</Text>
          </View>
        )}
      </View>
      <View style={[styles.topBar, { top: insets.top + 8 }]}>
        <RoundButton icon="close" label="Close" onPress={() => router.back()} />
        <RoundButton icon={torch ? 'flashlight' : 'flashlight-outline'} label="Flashlight" onPress={() => setTorch((v) => !v)} />
      </View>
    </View>
  );
}

function RoundButton({ icon, label, onPress }: { icon: 'close' | 'flashlight' | 'flashlight-outline'; label: string; onPress: () => void }) {
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
  toastText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  permTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  permBody: { color: '#bbb', fontSize: 16, textAlign: 'center', lineHeight: 22, marginBottom: 8 },
});
