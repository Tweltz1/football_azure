export type ChargeKind = 'labor' | 'fee' | 'part' | 'percent';
/** A saved item. Labor items may carry book `hours`, used as the quantity when the item is picked. */
export interface Rate { name: string; kind: ChargeKind; rate: number; hours?: number }
export interface Charge extends Rate { qty: number }
export interface Bill {
  mode: 'generated' | 'upload'; total: number; issuedAt: string; shopName: string; phone: string;
  lines?: Charge[]; filename?: string;
}
export function amount(v: unknown, max: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max &&
    Math.abs(v * 100 - Math.round(v * 100)) < 0.000001;
}
export function validRate(v: unknown): v is Rate {
  if (!v || typeof v !== 'object') return false;
  const r = v as Rate;
  return typeof r.name === 'string' && !!r.name.trim() && r.name.length <= 120 &&
    ['labor', 'fee', 'part', 'percent'].includes(r.kind) && amount(r.rate, r.kind === 'percent' ? 100 : 1_000_000) &&
    (r.hours === undefined || r.hours === null || (amount(r.hours, 1000) && r.hours > 0));
}
export function validCharge(v: unknown): v is Charge {
  return validRate(v) && amount((v as Charge).qty, v.kind === 'percent' ? 1_000_000 : 10000) && (v as Charge).qty > 0;
}
export const lineCents = (r: Charge) => Math.round(Math.round(r.rate * 100) * Math.round(r.qty * 100) / (r.kind === 'percent' ? 10000 : 100));
export const copyRate = (r: Rate): Rate => ({ name: r.name.trim(), rate: r.rate, kind: r.kind, ...(r.kind === 'labor' && typeof r.hours === 'number' && r.hours > 0 ? { hours: r.hours } : {}) });
