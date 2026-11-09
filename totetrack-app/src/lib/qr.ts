import QRCode from 'qrcode';
import * as Linking from 'expo-linking';

export const QR_SCHEME = 'totetrack';

/** Details printed on a blank label, carried in its QR so scanning it pre-fills the new tote. */
export type LabelPreset = { name?: string; location?: string; color?: string };

/** The text encoded in a tote's QR label. Scanning it with the iPhone camera opens the app. */
export function qrPayload(toteId: string, preset?: LabelPreset): string {
  const base = `${QR_SCHEME}://tote/${toteId}`;
  if (!preset) return base;
  const q: string[] = [];
  if (preset.name) q.push(`name=${encodeURIComponent(preset.name)}`);
  if (preset.location) q.push(`loc=${encodeURIComponent(preset.location)}`);
  if (preset.color) q.push(`c=${preset.color.replace('#', '')}`);
  return q.length ? `${base}?${q.join('&')}` : base;
}

/** Query string for the new-tote screen from a scanned label's preset. */
export function presetQuery(p: LabelPreset): string {
  return [
    p.name ? `name=${encodeURIComponent(p.name)}` : '',
    p.location ? `loc=${encodeURIComponent(p.location)}` : '',
    p.color ? `c=${p.color.replace('#', '')}` : '',
  ]
    .filter(Boolean)
    .map((x) => `&${x}`)
    .join('');
}

/** Short human-readable code printed under the QR, e.g. "A3F9-C2". */
export function shortCode(toteId: string): string {
  const s = toteId.replace(/-/g, '').slice(0, 6).toUpperCase();
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Pulls the tote id (and any blank-label preset) out of a scanned QR string, or null if it isn't ours. */
export function parseScan(data: string): { id: string; preset: LabelPreset } | null {
  const trimmed = data.trim();
  try {
    const parsed = Linking.parse(trimmed);
    const m = (parsed.path ?? '').match(/tote\/([A-Za-z0-9-]{8,})/);
    if (!m && !/^totetrack:/i.test(trimmed)) return null;
    const id = m?.[1] ?? trimmed.match(/tote\/([A-Za-z0-9-]{8,})/i)?.[1];
    if (!id) return null;
    const qp = parsed.queryParams ?? {};
    const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
    const c = str(qp.c);
    return { id, preset: { name: str(qp.name), location: str(qp.loc), color: c && /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : undefined } };
  } catch {
    const id = trimmed.match(/^totetrack:\/\/+tote\/([A-Za-z0-9-]{8,})/i)?.[1];
    return id ? { id, preset: {} } : null;
  }
}

export type QRMatrix = { size: number; path: string };

/**
 * Builds the QR as a single SVG path (one 1x1 square per dark module), so the same
 * output can be drawn by react-native-svg on screen and inlined in printable HTML.
 */
export function qrMatrix(text: string): QRMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const { size, data } = qr.modules;
  let path = '';
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (data[y * size + x]) {
        let run = 1;
        while (x + run < size && data[y * size + x + run]) run++;
        path += `M${x} ${y}h${run}v1h-${run}z`;
        x += run;
      } else {
        x++;
      }
    }
  }
  return { size, path };
}

/** Inline SVG markup for print/PDF. `quiet` is the white border in modules. */
export function qrSvg(text: string, quiet = 2): string {
  const { size, path } = qrMatrix(text);
  const full = size + quiet * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-${quiet} -${quiet} ${full} ${full}" shape-rendering="crispEdges"><rect x="-${quiet}" y="-${quiet}" width="${full}" height="${full}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
