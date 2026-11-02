// Isometric drawing for the TV board: blocks for ground and walls, little 3D props, as SVG strings.
// One square is a 2:1 diamond. Ground level raises a square by LEVEL px; walls stand WALL px tall.

import { PROPS } from './settings';
import { PROP_DRAW } from './props';

export const TW = 88;
export const TH = 44;
export const LEVEL = 20;
export const WALL = 58;
export const BASE = 12;

/** Screen point for the center of square (x, y) at ground level e. */
export const iso = (x, y, e = 0) => ({ sx: (x - y) * (TW / 2), sy: (x + y) * (TH / 2) - e * LEVEL });

const r1 = (v) => Math.round(v * 10) / 10;
const pts = (list) => list.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ');
const poly = (list, fill, extra = '') => `<polygon points="${pts(list)}" fill="${fill}"${extra}/>`;

/** Lighten or darken a #rrggbb color by k (-1..1). */
export const shade = (hex, k) => {
  const n = parseInt(String(hex).slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k)));
  return `#${ch.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('')}`;
};

/**
 * An isometric box centered on (cx, cy) (the middle of its bottom face), footprint fraction f of a square,
 * height h px, with top/left/right colors.
 */
export const box = (cx, cy, f, h, top, left, right, stroke = 'rgba(0,0,0,0.25)') => {
  const hw = (TW / 2) * f;
  const hh = (TH / 2) * f;
  const n = [cx, cy - hh];
  const e = [cx + hw, cy];
  const s = [cx, cy + hh];
  const w = [cx - hw, cy];
  const up = (p) => [p[0], p[1] - h];
  const sw = ` stroke="${stroke}" stroke-width="1"`;
  return poly([w, s, up(s), up(w)], left, sw) + poly([s, e, up(e), up(s)], right, sw) + poly([up(n), up(e), up(s), up(w)], top, sw);
};

/** A steady 0..1 number for a square, so decorations stay put between redraws. */
const hash = (x, y, salt = 0) => {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + salt * 7919, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const tuft = (x, y, c) => `<path d="M${x - 4} ${y} l-2 -7 M${x} ${y} l0 -9 M${x + 4} ${y} l2 -7" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`;
const pebble = (x, y, c, r = 3) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.6}" fill="${c}"/>`;
const flower = (x, y, c) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${c}"/><circle cx="${x}" cy="${y}" r="1" fill="#ffe066"/>`;
const crack = (x, y) => `<path d="M${x - 12} ${y - 2} l6 3 l4 -4 l7 5 l5 -2" stroke="rgba(0,0,0,0.3)" stroke-width="1.5" fill="none"/>`;

/** Small details on top of a floor square, picked per setting: grass, stones, cracks, snow... */
const groundDeco = (tile, x, y, sx, sy, sid) => {
  if (tile.p || tile.t === 'wall' || tile.t === 'door') return '';
  if (tile.t === 'water') {
    return sid === 'swamp' && hash(x, y, 3) < 0.25 ? `<ellipse cx="${sx + 6}" cy="${sy + 2}" rx="9" ry="4.5" fill="#4f7f36"/><path d="M${sx + 6} ${sy + 2} l8 -3" stroke="#2e3f2f" stroke-width="1.5"/>` : '';
  }
  const a = hash(x, y, 1);
  const b = hash(x, y, 2);
  const ox = (b - 0.5) * 30;
  const oy = (a - 0.5) * 12;
  let out = '';
  switch (sid) {
    case 'tavern':
      // Floorboards on every square, the odd knot or spill.
      out += `<path d="M${sx - 22} ${sy - 11} L${sx + 22} ${sy + 11} M${sx - 33} ${sy - 5} L${sx + 11} ${sy + 17} M${sx - 11} ${sy - 17} L${sx + 33} ${sy + 5}" stroke="rgba(0,0,0,0.13)" stroke-width="1.2"/>`;
      if (a < 0.08) out += `<ellipse cx="${sx + ox}" cy="${sy + oy}" rx="9" ry="4" fill="rgba(220,170,60,0.35)"/>`;
      else if (a < 0.16) out += `<path d="M${sx + ox - 6} ${sy + oy} l12 -2 M${sx + ox - 4} ${sy + oy + 3} l9 1" stroke="#d8b26a" stroke-width="1.5"/>`;
      break;
    case 'forest':
      if (tile.t === 'road') { if (a < 0.3) out += pebble(sx + ox, sy + oy, 'rgba(90,70,40,0.45)') + pebble(sx + ox + 7, sy + oy + 3, 'rgba(90,70,40,0.35)', 2); break; }
      if (a < 0.45) out += tuft(sx + ox, sy + oy, '#4a7a2e');
      if (b < 0.18) out += flower(sx - ox * 0.6, sy - oy, ['#ff8bd0', '#fff', '#ffe066', '#b9a7f5'][Math.floor(a * 4)]);
      else if (b > 0.88) out += `<ellipse cx="${sx - ox * 0.5}" cy="${sy + 4}" rx="5" ry="2.5" fill="#c97a2a" transform="rotate(${Math.round(a * 90)} ${sx - ox * 0.5} ${sy + 4})"/>`;
      break;
    case 'swamp':
      if (a < 0.3) out += `<ellipse cx="${sx + ox}" cy="${sy + oy}" rx="12" ry="5" fill="rgba(30,45,30,0.45)"/>`;
      else if (a < 0.6) out += tuft(sx + ox, sy + oy, '#7a8a3a');
      break;
    case 'dungeon':
    case 'castle':
      out += `<path d="M${sx} ${sy - 22} L${sx} ${sy + 22} M${sx - 44} ${sy} L${sx + 44} ${sy}" stroke="rgba(0,0,0,0.08)" stroke-width="1" transform="scale(1 1)"/>`;
      if (sid === 'dungeon' && a < 0.18) out += crack(sx + ox * 0.5, sy + oy);
      else if (sid === 'dungeon' && a < 0.26) out += pebble(sx + ox, sy + oy, 'rgba(0,0,0,0.25)') + pebble(sx + ox + 6, sy + oy - 3, 'rgba(0,0,0,0.2)', 2);
      else if (sid === 'dungeon' && a < 0.3) out += `<ellipse cx="${sx + ox}" cy="${sy + oy}" rx="10" ry="4" fill="rgba(80,110,140,0.35)"/>`;
      if (sid === 'castle' && tile.carpet) out += `<path d="M${sx - 30} ${sy} L${sx} ${sy - 15} L${sx + 30} ${sy} L${sx} ${sy + 15} Z" fill="none" stroke="rgba(231,185,74,0.45)" stroke-width="1.5"/>`;
      break;
    case 'cave':
      if (a < 0.25) out += pebble(sx + ox, sy + oy, 'rgba(0,0,0,0.3)') + pebble(sx + ox - 7, sy + oy + 2, 'rgba(0,0,0,0.22)', 2);
      else if (a < 0.37) out += `<circle cx="${sx + ox}" cy="${sy + oy}" r="2" fill="#7ad7ff" class="dq-glow"/><circle cx="${sx + ox + 6}" cy="${sy + oy + 2}" r="1.5" fill="#b9a7f5" class="dq-glow"/>`;
      break;
    case 'crypt':
      if (a < 0.4) out += tuft(sx + ox, sy + oy, '#3a4a32');
      else if (a < 0.48) out += crack(sx + ox * 0.5, sy + oy);
      else if (a < 0.52) out += `<circle cx="${sx + ox}" cy="${sy + oy - 3}" r="4" fill="#e8e2cf"/><circle cx="${sx + ox - 1.5}" cy="${sy + oy - 3.5}" r="1" fill="#16122b"/><circle cx="${sx + ox + 1.5}" cy="${sy + oy - 3.5}" r="1" fill="#16122b"/>`;
      break;
    case 'mountain':
      if (a < 0.3) out += `<ellipse cx="${sx + ox}" cy="${sy + oy}" rx="${10 + b * 8}" ry="${4 + b * 3}" fill="rgba(255,255,255,0.75)"/>`;
      else if (a < 0.5) out += pebble(sx + ox, sy + oy, '#7f838a') + pebble(sx + ox + 6, sy + oy + 2, '#6c727a', 2);
      break;
    default:
  }
  return out;
};

/** The ground block for one square. */
export const groundTile = (tile, x, y, pal, sid = '') => {
  const { sx, sy } = iso(x, y, tile.e);
  const depth = BASE + (tile.e || 0) * LEVEL;
  let top = pal.top;
  if (tile.t === 'diff') top = pal.diff || shade(pal.top, -0.15);
  if (tile.t === 'road') top = pal.road || shade(pal.top, 0.2);
  if (tile.t === 'door') top = shade(pal.top, 0.12);
  if (tile.carpet) top = pal.carpet || '#8e1d2c';
  if (tile.outside) top = pal.outside || shade(pal.top, -0.2);
  if (tile.t === 'water') top = pal.water || '#2f5b8a';
  // A little checker so squares can be counted.
  const tint = (x + y) % 2 === 0 ? shade(top, 0.05) : top;
  const hw = TW / 2;
  const hh = TH / 2;
  const n = [sx, sy - hh];
  const e = [sx + hw, sy];
  const s = [sx, sy + hh];
  const w = [sx - hw, sy];
  const down = (p) => [p[0], p[1] + depth];
  let out = poly([w, s, down(s), down(w)], shade(pal.left, -(tile.e || 0) * 0.05)) + poly([s, e, down(e), down(s)], pal.right);
  out += poly([n, e, s, w], tint, ' stroke="rgba(0,0,0,0.18)" stroke-width="1"');
  if (tile.t === 'water') {
    out += `<path d="M${sx - 18} ${sy - 2} q6 -5 12 0 t12 0 M${sx - 6} ${sy + 8} q6 -5 12 0 t12 0" stroke="rgba(255,255,255,0.35)" stroke-width="2" fill="none" class="dq-wave"/>`;
  }
  if (tile.t === 'diff' && !tile.p) {
    // Rubble, roots or mud: a few dots so slow ground reads on the TV.
    out += `<circle cx="${sx - 12}" cy="${sy}" r="3" fill="rgba(0,0,0,0.25)"/><circle cx="${sx + 9}" cy="${sy - 5}" r="2.5" fill="rgba(0,0,0,0.25)"/><circle cx="${sx + 4}" cy="${sy + 7}" r="2" fill="rgba(0,0,0,0.2)"/>`;
  }
  out += groundDeco(tile, x, y, sx, sy, sid);
  if (tile.t === 'door') {
    out += `<rect x="${sx - 10}" y="${sy - 26}" width="20" height="26" rx="9" fill="#6b4a2a" stroke="#2a1a10" stroke-width="2"/><circle cx="${sx + 5}" cy="${sy - 12}" r="2" fill="#e7b94a"/>`;
  }
  return out;
};

/** A wall square: a tall block standing on the same base as the ground. */
export const wallTile = (tile, x, y, pal, sid = '', low = false) => {
  const { sx, sy } = iso(x, y, tile.e);
  // Walls on the near side of a room are cut down, so they never hide the people inside.
  if (low) return box(sx, sy + BASE, 1, 16 + BASE, shade(pal.wallTop, -0.08), pal.wallLeft, pal.wallRight);
  let out = box(sx, sy + BASE, 1, WALL + BASE, pal.wallTop, pal.wallLeft, pal.wallRight);
  const y0 = sy + BASE;
  const hw = TW / 2;
  const hh = TH / 2;
  const built = ['tavern', 'dungeon', 'castle', 'crypt'].includes(sid);
  if (built) {
    // Stone or timber courses on the two faces you can see.
    const rows = sid === 'tavern' ? 3 : 5;
    let lines = '';
    for (let i = 1; i < rows; i += 1) {
      const dy = ((WALL + BASE) * i) / rows;
      lines += `M${sx - hw} ${y0 - dy} L${sx} ${y0 + hh - dy} L${sx + hw} ${y0 - dy} `;
    }
    out += `<path d="${lines}" stroke="rgba(0,0,0,0.18)" stroke-width="1.2" fill="none"/>`;
    const a = hash(x, y, 9);
    const mid = y0 - (WALL + BASE) * 0.55;
    if ((sid === 'dungeon' || sid === 'castle') && a < 0.12) {
      // A wall torch.
      out += `<rect x="${sx + hw / 2 - 2}" y="${mid + hh / 2}" width="4" height="12" fill="#3a2a1a"/><path d="M${sx + hw / 2 - 6} ${mid + hh / 2} q6 -16 12 0 z" fill="#ff8a2a" class="dq-flame"/>`;
    } else if (sid === 'tavern' && a < 0.18) {
      // A lit window.
      out += `<polygon points="${sx - hw / 2 - 7},${mid + hh / 2 - 12} ${sx - hw / 2 + 7},${mid + hh / 2 - 5} ${sx - hw / 2 + 7},${mid + hh / 2 + 11} ${sx - hw / 2 - 7},${mid + hh / 2 + 4}" fill="#ffd27a" stroke="#4a2e1a" stroke-width="2" class="dq-glow"/>`;
    } else if (sid === 'castle' && a < 0.22) {
      out += `<path d="M${sx - hw / 2 - 6} ${mid - 6} v26 l6 -4 l6 4 v-26 z" fill="#8e1d2c" stroke="#e7b94a" stroke-width="1.5"/>`;
    } else if (sid === 'crypt' && a < 0.2) {
      out += `<path d="M${sx - hw / 2} ${mid - 10} q-6 14 2 26" stroke="#3f6b2e" stroke-width="3" fill="none"/>`;
    }
  } else if (sid === 'mountain' || sid === 'forest' || sid === 'swamp') {
    // Rock strata on cliffs.
    out += `<path d="M${sx - hw} ${y0 - 22} l${hw * 0.5} ${hh * 0.4} l${hw * 0.5} -6 M${sx + 6} ${y0 - 40} l${hw * 0.5} -4 l${hw * 0.4} -6" stroke="rgba(0,0,0,0.2)" stroke-width="1.5" fill="none"/>`;
  } else if (sid === 'cave' && hash(x, y, 4) < 0.15) {
    out += `<polygon points="${sx - 6},${y0 - WALL - BASE + 4} ${sx},${y0 - WALL - BASE - 18} ${sx + 6},${y0 - WALL - BASE + 4}" fill="#7ad7ff" class="dq-glow"/>`;
  }
  return out;
};

// ---- Props ---------------------------------------------------------------------------------------------------

const PROP_ART = {
  table: (x, y) => box(x, y, 0.62, 18, '#9a6a3a', '#6e4a28', '#5a3c20'),
  stool: (x, y) => box(x, y, 0.3, 10, '#8a6034', '#5e4024', '#4e351e'),
  barrel: (x, y) => `<ellipse cx="${x}" cy="${y}" rx="15" ry="8" fill="#4e351e"/><rect x="${x - 15}" y="${y - 28}" width="30" height="28" fill="#7a5230"/><rect x="${x - 15}" y="${y - 20}" width="30" height="3" fill="#3a2a1a"/><rect x="${x - 15}" y="${y - 9}" width="30" height="3" fill="#3a2a1a"/><ellipse cx="${x}" cy="${y - 28}" rx="15" ry="8" fill="#9a6a3a" stroke="#3a2a1a" stroke-width="2"/>`,
  crate: (x, y) => box(x, y, 0.5, 24, '#b08850', '#80602f', '#6b5028') + `<path d="M${x - 22} ${y - 12} L${x} ${y - 1} M${x} ${y - 1} L${x + 22} ${y - 12}" stroke="#5a3c20" stroke-width="2"/>`,
  bar: (x, y) => box(x, y, 0.9, 30, '#7a4a2a', '#5a3820', '#4a2e1a'),
  hearth: (x, y) => box(x, y, 0.85, 42, '#6c6a70', '#4a474d', '#3d3a40') + `<path d="M${x - 10} ${y - 4} q10 -26 20 0 z" fill="#ff8a2a" class="dq-flame"/><path d="M${x - 5} ${y - 4} q5 -14 10 0 z" fill="#ffe066" class="dq-flame"/>`,
  tree: (x, y) => `<rect x="${x - 5}" y="${y - 34}" width="10" height="34" fill="#5a3c20"/><circle cx="${x}" cy="${y - 52}" r="26" fill="#3f6b2e"/><circle cx="${x - 14}" cy="${y - 40}" r="16" fill="#4f7f36"/><circle cx="${x + 13}" cy="${y - 44}" r="16" fill="#355f26"/><circle cx="${x + 4}" cy="${y - 66}" r="14" fill="#5f8f3a"/>`,
  pine: (x, y) => `<rect x="${x - 4}" y="${y - 16}" width="8" height="16" fill="#5a3c20"/><polygon points="${x},${y - 72} ${x - 22},${y - 14} ${x + 22},${y - 14}" fill="#2f5a3a"/><polygon points="${x},${y - 80} ${x - 15},${y - 42} ${x + 15},${y - 42}" fill="#3a6b45"/><polygon points="${x},${y - 82} ${x - 8},${y - 64} ${x + 8},${y - 64}" fill="#f2f6fa"/>`,
  deadtree: (x, y) => `<path d="M${x} ${y} L${x - 2} ${y - 50} M${x - 1} ${y - 30} L${x - 18} ${y - 46} M${x - 1} ${y - 40} L${x + 16} ${y - 58} M${x - 2} ${y - 50} L${x - 8} ${y - 66}" stroke="#3e3326" stroke-width="6" stroke-linecap="round" fill="none"/>`,
  bush: (x, y) => `<circle cx="${x - 9}" cy="${y - 8}" r="11" fill="#3f6b2e"/><circle cx="${x + 8}" cy="${y - 9}" r="12" fill="#4f7f36"/><circle cx="${x}" cy="${y - 16}" r="10" fill="#5f8f3a"/>`,
  rock: (x, y) => `<polygon points="${x - 22},${y} ${x - 16},${y - 18} ${x - 2},${y - 26} ${x + 16},${y - 20} ${x + 22},${y - 2} ${x + 4},${y + 8}" fill="#7f838a" stroke="#4a4d52" stroke-width="2"/><polygon points="${x - 2},${y - 26} ${x + 16},${y - 20} ${x + 4},${y - 10} ${x - 10},${y - 14}" fill="#a3a7ad"/>`,
  stump: (x, y) => `<rect x="${x - 11}" y="${y - 12}" width="22" height="12" fill="#6b4a2a"/><ellipse cx="${x}" cy="${y - 12}" rx="11" ry="5" fill="#c9a26a" stroke="#6b4a2a" stroke-width="2"/>`,
  pillar: (x, y) => box(x, y, 0.42, 82, '#b4ab9a', '#7f7768', '#6c6458'),
  bones: (x, y) => `<path d="M${x - 12} ${y - 2} L${x + 10} ${y + 4} M${x - 6} ${y + 6} L${x + 8} ${y - 5}" stroke="#e8e2cf" stroke-width="4" stroke-linecap="round"/><circle cx="${x - 2}" cy="${y - 6}" r="5" fill="#e8e2cf"/>`,
  torch: (x, y) => `<rect x="${x - 2}" y="${y - 22}" width="4" height="22" fill="#5a3c20"/><path d="M${x - 6} ${y - 22} q6 -18 12 0 z" fill="#ff8a2a" class="dq-flame"/>`,
  candle: (x, y) => `<rect x="${x - 8}" y="${y - 10}" width="5" height="10" fill="#d9e8b0"/><rect x="${x + 3}" y="${y - 14}" width="5" height="14" fill="#d9e8b0"/><circle cx="${x - 5.5}" cy="${y - 13}" r="3" fill="#9be15d" class="dq-flame"/><circle cx="${x + 5.5}" cy="${y - 17}" r="3" fill="#9be15d" class="dq-flame"/>`,
  statue: (x, y) => box(x, y, 0.45, 16, '#a9adb3', '#7d8187', '#6a6e74') + `<rect x="${x - 7}" y="${y - 58}" width="14" height="40" rx="6" fill="#bfc3c9"/><circle cx="${x}" cy="${y - 64}" r="8" fill="#bfc3c9"/>`,
  crystal: (x, y) => `<polygon points="${x - 8},${y} ${x - 12},${y - 34} ${x - 2},${y - 52} ${x + 4},${y - 30} ${x},${y}" fill="#7ad7ff" class="dq-glow"/><polygon points="${x + 2},${y} ${x + 6},${y - 26} ${x + 16},${y - 38} ${x + 14},${y}" fill="#b9a7f5" class="dq-glow"/>`,
  mushroom: (x, y) => `<rect x="${x - 3}" y="${y - 12}" width="6" height="12" fill="#efe3c8"/><ellipse cx="${x}" cy="${y - 12}" rx="11" ry="6" fill="#b8432f"/><rect x="${x + 9}" y="${y - 6}" width="4" height="6" fill="#efe3c8"/><ellipse cx="${x + 11}" cy="${y - 6}" rx="6" ry="3.5" fill="#d1237a"/>`,
  stalagmite: (x, y) => `<polygon points="${x - 14},${y} ${x},${y - 60} ${x + 14},${y}" fill="#5a5070" stroke="#2a2740" stroke-width="2"/>`,
  web: (x, y) => `<path d="M${x - 22} ${y} L${x + 22} ${y} M${x} ${y - 14} L${x} ${y + 12} M${x - 16} ${y - 10} L${x + 16} ${y + 10} M${x + 16} ${y - 10} L${x - 16} ${y + 10}" stroke="rgba(240,240,255,0.6)" stroke-width="1.5"/><ellipse cx="${x}" cy="${y}" rx="12" ry="7" fill="none" stroke="rgba(240,240,255,0.5)"/>`,
  grave: (x, y) => `<path d="M${x - 11} ${y + 2} L${x - 11} ${y - 22} Q${x} ${y - 36} ${x + 11} ${y - 22} L${x + 11} ${y + 2} Z" fill="#8f9298" stroke="#4c4f55" stroke-width="2"/><path d="M${x - 4} ${y - 18} h8 M${x} ${y - 23} v12" stroke="#4c4f55" stroke-width="2"/>`,
  coffin: (x, y) => box(x, y, 0.55, 12, '#6b4a2a', '#4a321c', '#3a2716') + `<path d="M${x - 8} ${y - 12} L${x + 8} ${y - 12} M${x} ${y - 18} L${x} ${y - 6}" stroke="#c9a24a" stroke-width="2"/>`,
  banner: (x, y) => `<rect x="${x - 2}" y="${y - 74}" width="4" height="74" fill="#3a2a1a"/><path d="M${x + 2} ${y - 72} h22 v34 l-11 -7 l-11 7 z" fill="#8e1d2c" stroke="#e7b94a" stroke-width="2"/>`,
  armorstand: (x, y) => `<rect x="${x - 2}" y="${y - 20}" width="4" height="20" fill="#3a2a1a"/><rect x="${x - 12}" y="${y - 50}" width="24" height="30" rx="6" fill="#a9abb2" stroke="#55575d" stroke-width="2"/><circle cx="${x}" cy="${y - 58}" r="9" fill="#a9abb2" stroke="#55575d" stroke-width="2"/>`,
  throne: (x, y) => box(x, y, 0.5, 16, '#8e1d2c', '#6b1520', '#5a111a') + `<rect x="${x - 13}" y="${y - 56}" width="26" height="42" rx="4" fill="#d4af37" stroke="#7a5f1a" stroke-width="2"/>`,
  reeds: (x, y) => `<path d="M${x - 10} ${y} q-2 -20 -6 -30 M${x - 3} ${y} q0 -24 2 -36 M${x + 5} ${y} q2 -18 8 -28 M${x + 12} ${y} q0 -14 -2 -22" stroke="#7a8a3a" stroke-width="3" fill="none"/><rect x="${x - 2}" y="${y - 40}" width="5" height="10" rx="2" fill="#6b4a2a"/>`,
  hut: (x, y) => box(x, y, 0.8, 34, '#6b5a3a', '#5a4a2e', '#4a3c24') + `<polygon points="${x},${y - 80} ${x - 40},${y - 34} ${x + 40},${y - 34}" fill="#7a6a3a" stroke="#3e3326" stroke-width="2"/><rect x="${x - 6}" y="${y - 22}" width="12" height="16" fill="#ffe066" class="dq-glow"/>`,
  cairn: (x, y) => `<ellipse cx="${x}" cy="${y - 6}" rx="16" ry="8" fill="#7f838a"/><ellipse cx="${x}" cy="${y - 16}" rx="12" ry="6" fill="#9a9ea5"/><ellipse cx="${x}" cy="${y - 25}" rx="8" ry="5" fill="#b0b4ba"/>`,
  snowbank: (x, y) => `<ellipse cx="${x - 6}" cy="${y - 4}" rx="18" ry="8" fill="#f2f6fa"/><ellipse cx="${x + 10}" cy="${y - 6}" rx="12" ry="7" fill="#e3ebf3"/>`,
  chest: (x, y) => box(x, y, 0.46, 18, '#b07a3a', '#7a5228', '#6a4520') + `<rect x="${x - 4}" y="${y - 16}" width="8" height="8" fill="#ffe066" stroke="#7a5f1a" stroke-width="1.5"/><circle cx="${x}" cy="${y - 30}" r="5" fill="#ffe066" class="dq-glow"/>`,
  exit: (x, y) => `<ellipse cx="${x}" cy="${y}" rx="30" ry="15" fill="#7ad7ff" opacity="0.35" class="dq-glow"/><ellipse cx="${x}" cy="${y}" rx="18" ry="9" fill="#e3f6ff" opacity="0.7" class="dq-glow"/><path d="M${x} ${y - 48} l10 14 h-6 v14 h-8 v-14 h-6 z" fill="#ffe066" stroke="#16122b" stroke-width="2" class="dq-hop"/>`,
};

export const propArt = (p, x, y) => {
  const draw = PROP_DRAW[p] || PROP_ART[p];
  return draw ? draw(x, y) : '';
};
export const propHeight = (p) => (PROPS[p]?.tall || 0) * 50;
