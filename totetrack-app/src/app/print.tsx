import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as Print from 'expo-print';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, IconButton, SectionTitle, tap, ToteBadge } from '../components/ui';
import { QRCodeView } from '../components/QRCodeView';
import { buildLabelHtml, LabelLayout, LabelLayoutId, LabelOptions, LabelSpec, contentsLine, labelText, LAYOUTS } from '../lib/labels';
import { useTotes } from '../lib/store';
import { radius, TOTE_COLORS, useTheme } from '../lib/theme';

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
  // Blank label text and look
  const [blankName, setBlankName] = useState('');
  const [blankLoc, setBlankLoc] = useState('');
  const [blankColor, setBlankColor] = useState<string | undefined>(undefined);
  const [numbered, setNumbered] = useState(false);
  const [startNum, setStartNum] = useState(1);
  // What every label shows
  const [showLocation, setShowLocation] = useState(true);
  const [showCode, setShowCode] = useState(true);
  const [size, setSize] = useState<'S' | 'M' | 'L'>('M');

  const layout = LAYOUTS.find((l) => l.id === layoutId)!;
  const perSheet = layout.cols * layout.rows;
  const chosen = totes.filter((x) => selected.has(x.id));
  const labelCount = chosen.length + blanks;
  const sheets = Math.ceil((labelCount + skip) / perSheet) || 0;

  // Blank label ids are stable while this screen is open so a preview and the print match.
  const blankIds = useMemo(() => Array.from({ length: 200 }, () => Crypto.randomUUID()), []);

  const options: LabelOptions = { includeContents, outlines, showLocation, showCode, textScale: { S: 0.8, M: 1, L: 1.25 }[size] };

  const blankSpecs = (): LabelSpec[] =>
    blankIds.slice(0, blanks).map((id, i) => {
      const base = blankName.trim() || (numbered ? 'Tote' : '');
      return {
        id,
        preset: {
          name: numbered ? `${base} ${startNum + i}` : base || undefined,
          location: blankLoc.trim() || undefined,
          color: blankColor,
        },
      };
    });

  const allSpecs = (): LabelSpec[] => [...chosen.map((tote) => ({ id: tote.id, tote })), ...blankSpecs()];

  const build = () => {
    const specs: (LabelSpec | null)[] = [...Array.from({ length: skip }, () => null), ...allSpecs()];
    return buildLabelHtml(specs, layout, options);
  };

  const previewSpec: LabelSpec = allSpecs()[0] ?? { id: blankIds[0], preset: { name: blankName.trim() || undefined, location: blankLoc.trim() || undefined, color: blankColor } };

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

        <SectionTitle>Preview</SectionTitle>
        <LabelPreview spec={previewSpec} layout={layout} options={options} />

        <SectionTitle>Blank labels</SectionTitle>
        <Card style={{ padding: 0 }}>
          <Stepper
            label="How many"
            hint="Stick them on now, scan later to set up the tote"
            value={blanks}
            onChange={setBlanks}
            max={200}
            step={layout.id === 'large' ? 1 : layout.cols}
          />
          {blanks > 0 && (
            <View style={[styles.custom, { borderTopColor: t.border }]}>
              <Text style={[styles.fieldLabel, { color: t.textMuted }]}>Label title</Text>
              <TextInput
                value={blankName}
                onChangeText={setBlankName}
                placeholder={numbered ? 'Tote' : 'New tote'}
                placeholderTextColor={t.textMuted}
                autoCapitalize="words"
                style={[styles.field, { backgroundColor: t.cardAlt, color: t.text }]}
              />
              <Text style={[styles.fieldLabel, { color: t.textMuted }]}>Second line</Text>
              <TextInput
                value={blankLoc}
                onChangeText={setBlankLoc}
                placeholder="e.g. Garage, top shelf"
                placeholderTextColor={t.textMuted}
                style={[styles.field, { backgroundColor: t.cardAlt, color: t.text }]}
              />
              <Text style={[styles.fieldLabel, { color: t.textMuted }]}>Color</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
                {[undefined, ...TOTE_COLORS].map((c) => {
                  const on = c === blankColor;
                  return (
                    <Pressable
                      key={c ?? 'none'}
                      accessibilityLabel={c ? `Color ${c}` : 'Gray'}
                      onPress={() => {
                        tap();
                        setBlankColor(c);
                      }}
                      style={[styles.swatch, { backgroundColor: c ?? '#94A3B8', borderColor: on ? t.text : 'transparent' }]}
                    >
                      {on && <Ionicons name="checkmark" size={16} color="#fff" />}
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={[styles.hintSmall, { color: t.textMuted }]}>
                Scanning one of these sets up a tote with this title, second line and color already filled in.
              </Text>
            </View>
          )}
          {blanks > 0 && <Toggle label="Number them" hint={numbered ? undefined : 'Tote 1, Tote 2, Tote 3…'} value={numbered} onChange={setNumbered} />}
          {blanks > 0 && numbered && <Stepper label="Start at" value={startNum} onChange={(n) => setStartNum(Math.max(1, n))} max={999} border />}
        </Card>

        <SectionTitle>Label style</SectionTitle>
        <Card style={{ padding: 0 }}>
          <View style={styles.optRow}>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '500', flex: 1 }}>Text size</Text>
            <View style={[styles.segment, { backgroundColor: t.cardAlt }]}>
              {(['S', 'M', 'L'] as const).map((k) => (
                <Pressable
                  key={k}
                  onPress={() => {
                    tap();
                    setSize(k);
                  }}
                  style={[styles.segBtn, size === k && { backgroundColor: t.card }]}
                >
                  <Text style={{ color: size === k ? t.text : t.textMuted, fontWeight: '700' }}>{k}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Toggle label="Show location" value={showLocation} onChange={setShowLocation} />
          <Toggle label="Show label code" hint="The short code under the QR, for typing in by hand" value={showCode} onChange={setShowCode} />
          {layout.id === 'large' && <Toggle label="List contents on sign" value={includeContents} onChange={setIncludeContents} />}
        </Card>

        <SectionTitle>Printing</SectionTitle>
        <Card style={{ padding: 0 }}>
          {perSheet > 1 && (
            <Stepper label="Skip used labels" hint="For a partly used sheet, start further down" value={skip} onChange={setSkip} max={perSheet - 1} />
          )}
          <Toggle label="Print cut guides" hint="Turn on when printing on plain paper" value={outlines} onChange={setOutlines} first={perSheet === 1} />
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

/** On-screen approximation of one printed label, drawn at the label's real proportions. */
function LabelPreview({ spec, layout, options }: { spec: LabelSpec; layout: LabelLayout; options: LabelOptions }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const info = labelText(spec, options);
  const big = layout.id === 'large';
  const square = layout.id === 'avery22806';
  const maxW = width - 32 - 32;
  const w = big ? Math.min(maxW, 240) : square ? Math.min(maxW, 180) : maxW;
  const h = (w * layout.h) / layout.w;
  const ppi = w / layout.w; // screen points per inch
  const pt = (n: number) => (n / 72) * ppi * (options.textScale ?? 1);
  const contents = big && options.includeContents && spec.tote ? contentsLine(spec.tote, 14) : '';

  let body;
  if (big) {
    body = (
      <View style={[styles.pvBig, { borderColor: info.color, borderWidth: Math.max(2, pt(6)) }]}>
        <Text style={{ fontSize: pt(48), fontWeight: '900', textAlign: 'center', color: '#111' }} numberOfLines={2}>
          {info.name}
        </Text>
        {info.location ? <Text style={{ fontSize: pt(20), color: '#444', textAlign: 'center' }}>{info.location}</Text> : null}
        <View style={{ marginTop: 6 }}>
          <QRCodeView value={info.qr} size={w * 0.56} quiet={1} />
        </View>
        {info.code ? <Text style={[styles.pvCode, { fontSize: pt(16) }]}>{info.code}</Text> : null}
        {contents ? (
          <Text style={{ fontSize: pt(13), color: '#333', textAlign: 'center', marginTop: 4 }} numberOfLines={3}>
            {contents}
          </Text>
        ) : null}
      </View>
    );
  } else if (square) {
    body = (
      <View style={{ alignItems: 'center', padding: ppi * 0.1, flex: 1 }}>
        <QRCodeView value={info.qr} size={ppi * 1.3} quiet={1} />
        <Text style={{ fontSize: pt(10), fontWeight: '800', color: '#111', borderBottomWidth: 2.5, borderColor: info.color }} numberOfLines={1}>
          {info.name}
        </Text>
        {info.code ? <Text style={[styles.pvCode, { fontSize: pt(6.5) }]}>{info.code}</Text> : null}
      </View>
    );
  } else {
    const small = layout.id === 'avery5160';
    body = (
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, padding: ppi * (small ? 0.06 : 0.12), gap: ppi * (small ? 0.06 : 0.12) }}>
        <QRCodeView value={info.qr} size={h - ppi * (small ? 0.12 : 0.24)} quiet={1} />
        <View style={{ flex: 1, borderLeftWidth: small ? 3 : 4, borderColor: info.color, paddingLeft: ppi * 0.08 }}>
          <Text style={{ fontSize: pt(small ? 9.5 : 17), fontWeight: '800', color: '#111' }} numberOfLines={2}>
            {info.name}
          </Text>
          {info.location ? (
            <Text style={{ fontSize: pt(small ? 7 : 10), color: '#444' }} numberOfLines={1}>
              {info.location}
            </Text>
          ) : null}
          {info.code ? <Text style={[styles.pvCode, { fontSize: pt(small ? 6 : 8) }]}>{info.code}</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.pvWrap, { backgroundColor: t.cardAlt }]}>
      <View style={[styles.pvLabel, { width: w, height: h }]}>{body}</View>
      <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 8 }}>
        {spec.tote ? 'First label' : 'Blank label'} · {layout.title}
      </Text>
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

function Toggle({ label, hint, value, onChange, first }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; first?: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.optRow, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}>
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
  custom: { padding: 14, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  field: { height: 44, borderRadius: 10, paddingHorizontal: 12, fontSize: 16 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  hintSmall: { fontSize: 12, lineHeight: 17, marginTop: 10 },
  segment: { flexDirection: 'row', borderRadius: 10, padding: 3 },
  segBtn: { width: 40, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pvWrap: { borderRadius: radius.md, padding: 16, alignItems: 'center' },
  pvLabel: { backgroundColor: '#fff', borderRadius: 6, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  pvBig: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 10, gap: 2 },
  pvCode: { fontFamily: 'Menlo', color: '#555', fontWeight: '600', letterSpacing: 1 },
  tip: { fontSize: 13, lineHeight: 18, marginTop: 12, paddingHorizontal: 4 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
