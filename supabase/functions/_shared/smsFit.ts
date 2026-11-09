// Keep customer texts cheap: carriers bill per segment. A plain (GSM-7) text fits 160 characters in one
// segment, but a single curly quote, bullet or emoji switches the whole text to Unicode, where a segment
// holds only 70. gsmText() swaps those characters for plain ones so a text never pays the Unicode price.

const GSM_BASIC = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTENDED = '^{}\\[~]|€'; // allowed, but each one counts as 2 characters
const GSM = new Set([...GSM_BASIC, ...GSM_EXTENDED]);

const SWAP: Record<string, string> = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'", '′': "'", '`': "'", '´': "'",
  '“': '"', '”': '"', '„': '"', '″': '"', '«': '"', '»': '"',
  '–': '-', '—': '-', '―': '-', '‐': '-', '‑': '-', '−': '-', '•': '-', '·': '-', '●': '-', '▪': '-',
  '…': '...', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', '\t': ' ',
  '©': '(c)', '®': '(R)', '™': '(TM)', '×': 'x', '÷': '/', '°': ' deg',
};

/** The text with every character a carrier would bill as Unicode replaced by a plain one (or dropped, e.g. emoji). */
export function gsmText(text: string): string {
  let out = '';
  for (const ch of text) {
    if (GSM.has(ch)) { out += ch; continue; }
    if (SWAP[ch] !== undefined) { out += SWAP[ch]; continue; }
    // Accented letters outside the GSM set (á, í, ó, ú, ç, ê ...) keep their base letter.
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (base && [...base].every((c) => GSM.has(c))) out += base;
    // Anything else (emoji, symbols, zero-width characters) is left out.
  }
  return out.replace(/ {2,}/g, ' ').replace(/ +([,.!?])/g, '$1').trim();
}

/** How many billed segments a text takes. */
export function smsSegments(text: string): number {
  const chars = [...text];
  if (chars.every((c) => GSM.has(c))) {
    const len = chars.reduce((n, c) => n + (GSM_EXTENDED.includes(c) ? 2 : 1), 0);
    return len <= 160 ? 1 : Math.ceil(len / 153);
  }
  return chars.length <= 70 ? 1 : Math.ceil(chars.length / 67);
}

/** Characters a plain text can hold in one segment. */
export const ONE_SEGMENT = 160;

/**
 * Pick the first wording that fits one segment, after making it plain. `options` go from most to least detailed;
 * when none fits, the shortest one is used (it then costs 2 segments rather than failing).
 */
export function fitOne(options: string[]): string {
  const plain = options.map(gsmText);
  return plain.find((t) => smsSegments(t) === 1) ?? plain.reduce((a, b) => (b.length < a.length ? b : a));
}
