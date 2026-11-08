import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as Print from 'expo-print';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, IconButton, SectionTitle, tap, ToteBadge } from '../components/ui';
import { buildLabelHtml, LabelLayoutId, LabelSpec, LAYOUTS } from '../lib/labels';
import { useTotes } from '../lib/store';
import { radius, useTheme } from '../lib/theme';

export default function PrintLabels() {
  const params = useLocalSearchParams<{ ids?: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { totes } = useTotes();

  const initial = params.ids ? params.ids.split(',') : [];
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const [layoutId, setLayoutId] = useState<LabelLayoutId>(initial.length === 1 ? 'large' : 'avery5163');
  const [blanks, setBlanks] = useState(totes.length === 0 ? 10 : 0);
  const [skip, setSkip] = useState(0);
  const [includeContents, setIncludeContents] = useState(true);
  const [outlines, setOutlines] = useState(false);
  const [busy, setBusy] = useState(false);

  const layout = LAYOUTS.find((l) => l.id === layoutId)!;
  const perSheet = layout.cols * layout.rows;
  const chosen = totes.filter((x) => selected.has(x.id));
  const labelCount = chosen.length + blanks;
  const sheets = Math.ceil((labelCount + skip) / perSheet) || 0;

  // Blank label ids are stable while this screen is open so a preview and the print match.
  const blankIds = useMemo(() => Array.from({ length: 200 }, () => Crypto.randomUUID()), []);

  const build = () => {
    const specs: (LabelSpec | null)[] = [
      ...Array.from({ length: skip }, () => null),
      ...chosen.map((tote) => ({ id: tote.id, tote })),
      ...blankIds.slice(0, blanks).map((id) => ({ id })),
    ];
    return buildLabelHtml(specs, layout, { includeContents, outlines });
  };

  const toggle = (id: string) => {
    tap();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const doPrint = async () => {
    setBusy(true);
    try {
      await Print.printAsync({ html: build(), margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    } catch (e) {
      Alert.alert('Printing failed', String(e));
    } finally {
      setBusy(false);
    }
  };

  const doShare = async () => {
    setBusy(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: build(), width: 612, height: 792, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Tote labels' });
    } catch (e) {
      Alert.alert("Couldn't create PDF", String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerLeft: () => <IconButton icon="close" label="Close" onPress={() => router.back()} color={t.textMuted} /> }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 160 + insets.bottom }}>
        <SectionTitle>Label type</SectionTitle>
        <View style={{ gap: 10 }}>
          {LAYOUTS.map((l) => {
            const on = l.id === layoutId;
            return (
              <Pressable
                key={l.id}
                onPress={() => {
                  tap();
                  setLayoutId(l.id);
                  setSkip(0);
                }}
                style={[styles.layout, { backgroundColor: t.card, borderColor: on ? t.primary : t.border }]}
              >
                <SheetPreview cols={l.cols} rows={l.rows} active={on} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.layoutTitle, { color: t.text }]}>{l.title}</Text>
                  <Text style={{ color: t.textMuted, fontSize: 13, marginTop: 2 }}>{l.subtitle}</Text>
                </View>
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? t.primary : t.textMuted} />
              </Pressable>
            );
          })}
        </View>

        {totes.length > 0 && (
          <>
            <SectionTitle
              right={
                <Pressable onPress={() => setSelected(selected.size === totes.length ? new Set() : new Set(totes.map((x) => x.id)))}>
                  <Text style={{ color: t.primary, fontWeight: '600' }}>{selected.size === totes.length ? 'Select none' : 'Select all'}</Text>
                </Pressable>
              }
            >
              Totes
            </SectionTitle>
            <Card style={{ padding: 0 }}>
              {totes.map((tote, i) => {
                const on = selected.has(tote.id);
                return (
                  <Pressable
                    key={tote.id}
                    onPress={() => toggle(tote.id)}
                    style={[styles.toteRow, { borderTopColor: t.border, borderTopWidth: i ? StyleSheet.hairlineWidth : 0 }]}
                  >
                    <ToteBadge color={tote.color} icon={tote.icon} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
                        {tote.name || 'Untitled tote'}
                      </Text>
                      {tote.location ? (
                        <Text style={{ color: t.textMuted, fontSize: 13 }} numberOfLines={1}>
                          {tote.location}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? t.primary : t.textMuted} />
                  </Pressable>
                );
              })}
            </Card>
          </>
        )}

        <SectionTitle>Options</SectionTitle>
        <Card style={{ padding: 0 }}>
          <Stepper
            label="Blank labels"
            hint="Stick them on now, scan later to set up the tote"
            value={blanks}
            onChange={setBlanks}
            max={200}
            step={layout.id === 'large' ? 1 : layout.cols}
          />
          {perSheet > 1 && (
            <Stepper label="Skip used labels" hint="For a partly used sheet, start further down" value={skip} onChange={setSkip} max={perSheet - 1} border />
          )}
          {layout.id === 'large' && <Toggle label="List contents on sign" value={includeContents} onChange={setIncludeContents} />}
          <Toggle label="Print cut guides" hint="Turn on when printing on plain paper" value={outlines} onChange={setOutlines} />
        </Card>
        <Text style={[styles.tip, { color: t.textMuted }]}>
          Tip: do a test print on plain paper first and hold it up to the label sheet. In the print dialog, keep scaling at 100%.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: t.bg, borderTopColor: t.border }]}>
        <Text style={{ color: t.textMuted, textAlign: 'center', marginBottom: 10 }}>
          {labelCount === 0 ? 'Pick totes or add blank labels' : `${labelCount} label${labelCount === 1 ? '' : 's'} · ${sheets} page${sheets === 1 ? '' : 's'}`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="PDF" icon="share-outline" variant="secondary" onPress={doShare} disabled={!labelCount} loading={busy} style={{ flex: 1 }} />
          <Button title="Print" icon="print" onPress={doPrint} disabled={!labelCount} loading={busy} style={{ flex: 2 }} />
        </View>
      </View>
    </View>
  );
}

function SheetPreview({ cols, rows, active }: { cols: number; rows: number; active: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.sheet, { borderColor: t.border, backgroundColor: '#fff' }]}>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={{ flex: 1, flexDirection: 'row', gap: 1.5 }}>
          {Array.from({ length: cols }).map((_, c) => (
            <View key={c} style={{ flex: 1, borderRadius: 1.5, backgroundColor: active ? t.primary + 'AA' : '#CBD0DC' }} />
          ))}
        </View>
      ))}
    </View>
  );
}

function Stepper({ label, hint, value, onChange, max, step = 1, border }: { label: string; hint?: string; value: number; onChange: (n: number) => void; max: number; step?: number; border?: boolean }) {
  const t = useTheme();
  const btn = (icon: 'remove' | 'add', next: number) => (
    <Pressable
      onPress={() => {
        tap();
        onChange(Math.min(max, Math.max(0, next)));
      }}
      style={[styles.stepBtn, { backgroundColor: t.cardAlt }]}
    >
      <Ionicons name={icon} size={18} color={t.text} />
    </Pressable>
  );
  return (
    <View style={[styles.optRow, border && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '500' }}>{label}</Text>
        {hint ? <Text style={{ color: t.textMuted, fontSize: 13, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      {btn('remove', value - step)}
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', minWidth: 34, textAlign: 'center' }}>{value}</Text>
      {btn('add', value + step)}
    </View>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <View style={[styles.optRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '500' }}>{label}</Text>
        {hint ? <Text style={{ color: t.textMuted, fontSize: 13, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.primary }} />
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.md, borderWidth: 2 },
  layoutTitle: { fontSize: 16, fontWeight: '700' },
  sheet: { width: 34, height: 44, borderRadius: 3, borderWidth: 1, padding: 3, gap: 1.5 },
  toteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  stepBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tip: { fontSize: 13, lineHeight: 18, marginTop: 12, paddingHorizontal: 4 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
