import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatDate, money, toISODate, toteValue } from './extras';
import { photoUri } from './photos';
import { Tote } from './types';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

async function thumb(name?: string): Promise<string | null> {
  const uri = photoUri(name);
  if (!uri || !new File(uri).exists) return null;
  try {
    const ref = await ImageManipulator.manipulate(uri).resize({ width: 600 }).renderAsync();
    const out = await ref.saveAsync({ base64: true, compress: 0.6, format: SaveFormat.JPEG });
    return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
  } catch {
    return null;
  }
}

/** Builds the home inventory report (every tote, its photo, items and values) as HTML for a PDF. */
export async function inventoryHtml(totes: Tote[]): Promise<string> {
  const sorted = [...totes].sort((a, b) => (a.location || '~').localeCompare(b.location || '~') || a.name.localeCompare(b.name));
  const total = sorted.reduce((s, t) => s + toteValue(t), 0);
  const itemTotal = sorted.reduce((s, t) => s + t.items.reduce((n, i) => n + i.qty, 0), 0);
  const sections: string[] = [];
  for (const t of sorted) {
    const img = await thumb(t.photo);
    const rows = t.items
      .map(
        (i) => `<tr><td>${esc(i.name)}${i.out ? ` <span class="out">(out: ${esc(i.out.to)})</span>` : ''}</td>
          <td class="n">${i.qty}</td><td class="n">${i.value ? money(i.value) : ''}</td>
          <td class="n">${i.value ? money(i.value * i.qty) : ''}</td></tr>`,
      )
      .join('');
    sections.push(`<section>
      <div class="head">${img ? `<img src="${img}"/>` : ''}<div>
        <h2>${esc(t.name || 'Untitled tote')}</h2>
        <p class="muted">${t.location ? esc(t.location) + ' · ' : ''}${t.items.length} item types${toteValue(t) ? ' · ' + money(toteValue(t)) : ''}</p>
        ${t.notes ? `<p>${esc(t.notes)}</p>` : ''}
      </div></div>
      ${t.items.length ? `<table><tr><th>Item</th><th class="n">Qty</th><th class="n">Each</th><th class="n">Total</th></tr>${rows}</table>` : '<p class="muted">Empty</p>'}
    </section>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #11131A; margin: 36px; font-size: 12px; }
    h1 { font-size: 24px; margin: 0; } h2 { font-size: 16px; margin: 0 0 2px; }
    .muted { color: #6B7083; margin: 2px 0; }
    .summary { display: flex; gap: 24px; margin: 14px 0 24px; padding: 12px 16px; background: #F4F5F9; border-radius: 10px; }
    .summary b { display: block; font-size: 18px; }
    section { page-break-inside: avoid; margin-bottom: 22px; border-top: 1px solid #E2E4EC; padding-top: 14px; }
    .head { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 8px; }
    img { width: 120px; height: 90px; object-fit: cover; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; } th { text-align: left; color: #6B7083; font-weight: 600; }
    td, th { padding: 4px 6px; border-bottom: 1px solid #EEF0F6; } .n { text-align: right; white-space: nowrap; }
    .out { color: #B45309; }
  </style></head><body>
    <h1>Home inventory</h1>
    <p class="muted">Made with ToteTrack on ${formatDate(toISODate(new Date()))}</p>
    <div class="summary"><div><b>${sorted.length}</b>totes</div><div><b>${itemTotal}</b>items</div><div><b>${money(total)}</b>listed value</div></div>
    ${sections.join('')}
  </body></html>`;
}

/** Makes the PDF and opens the share sheet (Mail, Files, AirDrop, Print). */
export async function shareInventoryReport(totes: Tote[]) {
  const html = await inventoryHtml(totes);
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Home inventory' });
}
