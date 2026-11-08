import { qrPayload, qrSvg, shortCode } from './qr';
import { Tote } from './types';

export type LabelLayoutId = 'large' | 'avery5163' | 'avery22806' | 'avery5160';

export type LabelLayout = {
  id: LabelLayoutId;
  title: string;
  subtitle: string;
  /** All sizes in inches, on US Letter (8.5 x 11). */
  cols: number;
  rows: number;
  w: number;
  h: number;
  top: number;
  left: number;
  gapX: number;
  gapY: number;
};

export const LAYOUTS: LabelLayout[] = [
  { id: 'large', title: 'Big tote sign', subtitle: '1 per page · tape it on', cols: 1, rows: 1, w: 7.5, h: 10, top: 0.5, left: 0.5, gapX: 0, gapY: 0 },
  { id: 'avery5163', title: '2" × 4" labels', subtitle: 'Avery 5163 / 8163 · 10 per sheet', cols: 2, rows: 5, w: 4, h: 2, top: 0.5, left: 0.15625, gapX: 0.1875, gapY: 0 },
  { id: 'avery22806', title: '2" square labels', subtitle: 'Avery 22806 · 12 per sheet', cols: 3, rows: 4, w: 2, h: 2, top: 0.625, left: 0.625, gapX: 0.625, gapY: 0.5833 },
  { id: 'avery5160', title: '1" × 2⅝" labels', subtitle: 'Avery 5160 / 8160 · 30 per sheet', cols: 3, rows: 10, w: 2.625, h: 1, top: 0.5, left: 0.1875, gapX: 0.125, gapY: 0 },
];

/** A label to print. Blank labels have an id but no tote yet; scanning one sets up a new tote. */
export type LabelSpec = { id: string; tote?: Tote };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function labelInner(spec: LabelSpec, layout: LabelLayout, includeContents: boolean): string {
  const t = spec.tote;
  const name = t ? esc(t.name || 'Untitled tote') : 'New tote';
  const loc = t?.location ? esc(t.location) : t ? '' : 'Scan to set up';
  const code = shortCode(spec.id);
  const color = t?.color ?? '#94A3B8';
  const qr = qrSvg(qrPayload(spec.id));

  if (layout.id === 'large') {
    const items =
      includeContents && t && t.items.length
        ? `<ul class="items">${t.items
            .slice(0, 18)
            .map((i) => `<li>${i.qty > 1 ? `<b>${i.qty}×</b> ` : ''}${esc(i.name)}</li>`)
            .join('')}${t.items.length > 18 ? `<li class="more">+ ${t.items.length - 18} more — scan for full list</li>` : ''}</ul>`
        : '';
    return `<div class="big" style="border-color:${color}">
      <div class="big-bar" style="background:${color}"></div>
      <div class="big-name">${name}</div>
      ${loc ? `<div class="big-loc">${loc}</div>` : ''}
      <div class="big-qr">${qr}</div>
      <div class="big-code">${code}</div>
      ${items}
      <div class="big-hint">Scan with your phone camera to see or update what's inside</div>
    </div>`;
  }

  if (layout.id === 'avery22806') {
    return `<div class="sq"><div class="sq-qr">${qr}</div><div class="sq-name" style="border-color:${color}">${name}</div><div class="code">${code}</div></div>`;
  }

  const small = layout.id === 'avery5160';
  return `<div class="row ${small ? 'small' : ''}">
    <div class="row-qr">${qr}</div>
    <div class="row-text" style="border-color:${color}">
      <div class="row-name">${name}</div>
      ${loc ? `<div class="row-loc">${loc}</div>` : ''}
      <div class="code">${code}</div>
    </div>
  </div>`;
}

export function buildLabelHtml(specs: (LabelSpec | null)[], layout: LabelLayout, opts: { includeContents?: boolean; outlines?: boolean } = {}): string {
  const perPage = layout.cols * layout.rows;
  const pages: string[] = [];
  for (let p = 0; p < Math.max(1, Math.ceil(specs.length / perPage)); p++) {
    const chunk = specs.slice(p * perPage, (p + 1) * perPage);
    const cells = chunk
      .map((spec, i) => {
        if (!spec) return '';
        const c = i % layout.cols;
        const r = Math.floor(i / layout.cols);
        const x = layout.left + c * (layout.w + layout.gapX);
        const y = layout.top + r * (layout.h + layout.gapY);
        return `<div class="cell${opts.outlines ? ' outline' : ''}" style="left:${x}in;top:${y}in;width:${layout.w}in;height:${layout.h}in">${labelInner(spec, layout, !!opts.includeContents)}</div>`;
      })
      .join('');
    pages.push(`<div class="page">${cells}</div>`);
  }

  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  @page { size: 8.5in 11in; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 8.5in; font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { position: relative; width: 8.5in; height: 11in; overflow: hidden; page-break-after: always; break-after: page; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .cell { position: absolute; overflow: hidden; }
  .cell.outline { outline: 0.5pt dashed #bbb; }
  svg { display: block; width: 100%; height: 100%; }
  .code { font: 600 8pt ui-monospace, Menlo, monospace; letter-spacing: 0.08em; color: #555; }

  .row { display: flex; align-items: center; height: 100%; padding: 0.12in 0.16in; gap: 0.12in; }
  .row-qr { height: 100%; aspect-ratio: 1; flex-shrink: 0; }
  .row-text { flex: 1; min-width: 0; border-left: 4pt solid; padding-left: 0.1in; }
  .row-name { font-size: 17pt; font-weight: 800; line-height: 1.1; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .row-loc { font-size: 10pt; color: #444; margin-top: 2pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row .code { margin-top: 4pt; }
  .row.small { padding: 0.06in 0.08in; gap: 0.06in; }
  .row.small .row-text { border-left-width: 3pt; padding-left: 0.05in; }
  .row.small .row-name { font-size: 9.5pt; -webkit-line-clamp: 2; }
  .row.small .row-loc { font-size: 7pt; margin-top: 0; }
  .row.small .code { font-size: 6pt; margin-top: 1pt; }

  .sq { display: flex; flex-direction: column; align-items: center; height: 100%; padding: 0.1in; }
  .sq-qr { width: 1.3in; height: 1.3in; }
  .sq-name { font-size: 10pt; font-weight: 800; text-align: center; margin-top: 2pt; border-bottom: 2.5pt solid; padding-bottom: 1pt; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sq .code { font-size: 6.5pt; margin-top: 2pt; }

  .big { height: 100%; border: 6pt solid; border-radius: 0.3in; display: flex; flex-direction: column; align-items: center; padding: 0.5in 0.5in 0.4in; position: relative; overflow: hidden; }
  .big-bar { position: absolute; top: 0; left: 0; right: 0; height: 0.25in; }
  .big-name { font-size: 48pt; font-weight: 900; text-align: center; line-height: 1.05; margin-top: 0.15in; }
  .big-loc { font-size: 20pt; color: #444; margin-top: 0.08in; text-align: center; }
  .big-qr { width: 4.2in; height: 4.2in; margin-top: 0.3in; }
  .big-code { font: 700 16pt ui-monospace, Menlo, monospace; letter-spacing: 0.12em; color: #555; margin-top: 0.08in; }
  .items { columns: 2; column-gap: 0.4in; list-style: none; font-size: 12pt; margin-top: 0.25in; width: 100%; }
  .items li { padding: 2pt 0; break-inside: avoid; border-bottom: 0.5pt solid #ddd; }
  .items li.more { color: #666; font-style: italic; }
  .big-hint { margin-top: auto; font-size: 10pt; color: #777; }
</style></head><body>${pages.join('')}</body></html>`;
}
