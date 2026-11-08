import QRCode from 'qrcode';
import * as Linking from 'expo-linking';

export const QR_SCHEME = 'totetrack';

/** The text encoded in a tote's QR label. Scanning it with the iPhone camera opens the app. */
export function qrPayload(toteId: string): string {
  return `${QR_SCHEME}://tote/${toteId}`;
}

/** Short human-readable code printed under the QR, e.g. "A3F9-C2". */
export function shortCode(toteId: string): string {
  const s = toteId.replace(/-/g, '').slice(0, 6).toUpperCase();
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Pulls the tote id out of a scanned QR string, or returns null if it isn't one of ours. */
export function parseScan(data: string): string | null {
  const trimmed = data.trim();
  const direct = trimmed.match(/^totetrack:\/\/+tote\/([A-Za-z0-9-]{8,})/i);
  if (direct) return direct[1];
  try {
    const parsed = Linking.parse(trimmed);
    const path = parsed.path ?? '';
    const m = path.match(/tote\/([A-Za-z0-9-]{8,})/);
    if (m) return m[1];
  } catch {
    // not a URL
  }
  return null;
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
