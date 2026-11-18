// Small helpers for drawing in the ink-outline cartoon style (monsters, holiday critters).
import { INK } from './cartoon.js';

export const st = (fill, w = 5) => `fill="${fill}" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
export const ell = (cx, cy, rx, ry, fill, w = 5) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${st(fill, w)}/>`;
export const dot = (cx, cy, r, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
export const path = (d, fill, w = 5) => `<path d="${d}" ${st(fill, w)}/>`;
export const line = (d, color, w) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
export const eyes = (y, dx = 14, r = 7, fill = INK) => `<g class="lc-eyes">${dot(-dx, y, r, fill)}${dot(dx, y, r, fill)}${dot(-dx + 2, y - 2, r * 0.35, '#fff')}${dot(dx + 2, y - 2, r * 0.35, '#fff')}</g>`;
export const shadow = (rx = 46) => `<ellipse cx="0" cy="0" rx="${rx}" ry="10" fill="#000" fill-opacity=".3"/>`;
