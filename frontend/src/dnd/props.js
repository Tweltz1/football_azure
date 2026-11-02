// Detailed prop art for the TV board, in the same outlined cartoon style as the heroes.
// Every prop is an SVG string drawn with its footprint centered on (x, y), the middle of its square.
// Shared gradients (wood, stone, fire glow...) live in <PropDefs/> in Board.js.

const TW = 88;
const INK = '#24170f';

const r1 = (v) => Math.round(v * 10) / 10;
const pts = (list) => list.map(([a, b]) => `${r1(a)},${r1(b)}`).join(' ');
const poly = (list, fill, stroke = INK, sw = 1.5) => `<polygon points="${pts(list)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
const path = (d, stroke, sw = 1.5, fill = 'none', extra = '') => `<path d="${d}" stroke="${stroke}" stroke-width="${sw}" fill="${fill}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;

/** A steady 0..1 number from screen coordinates, for small per-prop variety. */
const vary = (x, y, salt = 0) => {
  let h = Math.imul(Math.round(x) + 9973 * salt, 2654435761) ^ Math.imul(Math.round(y) + 7, 1597334677);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

/**
 * An isometric block: footprint fraction f of a square (fy for the other side), height h.
 * Returns the svg plus helpers to place points on its faces: L(u, v), R(u, v), T(u, w) (u, v, w in 0..1).
 */
const block = (cx, cy, f, h, top, left, right, opts = {}) => {
  const fy = opts.fy || f;
  const ax = (TW / 2) * f; // along +x (toward the right-down edge)
  const ay = (TW / 2) * fy; // along +y (toward the left-down edge)
  const P = (u, w) => [cx + (u - w) * 0.5 * 0 + (u * ax - w * ay), cy + (u * ax + w * ay) / 2];
  // Corners of the footprint around the center: u, w in -1..1.
  const c = (u, w) => P(u, w);
  const n = c(-1, -1);
  const e = c(1, -1);
  const s = c(1, 1);
  const w = c(-1, 1);
  const up = (p, k = 1) => [p[0], p[1] - h * k];
  const svg = poly([w, s, up(s), up(w)], left) + poly([s, e, up(e), up(s)], right) + poly([up(n), up(e), up(s), up(w)], top);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return {
    svg,
    L: (u, v) => up(lerp(w, s, u), v),
    R: (u, v) => up(lerp(s, e, u), v),
    T: (u, v) => up(lerp(lerp(w, n, v), lerp(s, e, v), u), 1),
    corners: { n, e, s, w },
    h,
  };
};

const line = (a, b) => `M${r1(a[0])} ${r1(a[1])} L${r1(b[0])} ${r1(b[1])}`;

/** Planks or courses across the two side faces of a block. */
const courses = (b, rows, color, sw = 1) => {
  let d = '';
  for (let i = 1; i < rows; i += 1) {
    const v = i / rows;
    d += `${line(b.L(0, v), b.L(1, v))} ${line(b.R(0, v), b.R(1, v))} `;
  }
  return path(d, color, sw);
};

/** Staggered bricks on the two side faces. */
const bricks = (b, rows, cols, color) => {
  let d = '';
  for (let i = 0; i < rows; i += 1) {
    const v0 = i / rows;
    const v1 = (i + 1) / rows;
    if (i) d += `${line(b.L(0, v0), b.L(1, v0))} ${line(b.R(0, v0), b.R(1, v0))} `;
    for (let j = 1; j < cols; j += 1) {
      const u = (j - (i % 2 ? 0.5 : 0)) / cols;
      if (u <= 0 || u >= 1) continue;
      d += `${line(b.L(u, v0), b.L(u, v1))} ${line(b.R(u, v0), b.R(u, v1))} `;
    }
  }
  return path(d, color, 1);
};

const shadow = (x, y, rx, ry = rx / 2, o = 0.3) => `<ellipse cx="${x}" cy="${y + 2}" rx="${rx}" ry="${ry}" fill="rgba(0,0,0,${o})"/>`;

const flame = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">`
  + '<path d="M-9 0 Q-11 -14 -3 -22 Q-4 -12 1 -10 Q2 -20 8 -26 Q7 -14 11 -8 Q12 -2 9 0 Z" fill="#ff7a1a" class="dq-flame"/>'
  + '<path d="M-5 0 Q-6 -9 -1 -14 Q0 -7 3 -6 Q4 -12 6 -15 Q7 -6 6 0 Z" fill="#ffc93a" class="dq-flame"/>'
  + '<path d="M-2 0 Q-2 -5 1 -8 Q2 -3 3 0 Z" fill="#fff4c2"/></g>';

const glow = (x, y, r, id = 'dq-g-fire', cls = 'dq-glow') => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.55}" fill="url(#${id})" class="${cls}"/>`;

// ---- The props ---------------------------------------------------------------------------------------------------

const hearth = (x, y) => {
  // A brick fireplace against the wall: raised hearth stone, arched firebox, mantle, chimney breast.
  let out = glow(x, y + 6, 70);
  const base = block(x, y, 0.95, 8, '#9a8f86', '#6f665f', '#5d5550');
  out += base.svg;
  const body = block(x, y - 8, 0.85, 52, '#8a3f2a', '#9b4a30', '#7d3a25', { fy: 0.85 });
  out += body.svg + bricks(body, 7, 4, 'rgba(40,15,8,0.45)');
  // Firebox arch on the left (front) face.
  const a = body.L(0.22, 0);
  const b2 = body.L(0.78, 0);
  const top = body.L(0.5, 0.62);
  out += `<path d="M${r1(a[0])} ${r1(a[1])} L${r1(a[0])} ${r1(a[1] - 18)} Q${r1(top[0])} ${r1(top[1] - 8)} ${r1(b2[0])} ${r1(b2[1] - 18)} L${r1(b2[0])} ${r1(b2[1])} Z" fill="#1a0e08" stroke="${INK}" stroke-width="1.5"/>`;
  // Logs and fire.
  const mid = body.L(0.5, 0);
  out += path(`M${mid[0] - 10} ${mid[1] - 3} l14 -4 M${mid[0] - 6} ${mid[1] - 1} l16 -1`, '#5a3416', 5);
  out += flame(mid[0], mid[1] - 4, 0.95);
  // Mantle shelf with a candle and a mug.
  const m = block(x, y - 60, 1.0, 6, '#6b4a2a', '#5a3c20', '#4a2e18', { fy: 0.95 });
  out += m.svg;
  const ml = m.T(0.25, 0.5);
  out += `<rect x="${r1(ml[0] - 2)}" y="${r1(ml[1] - 10)}" width="4" height="10" fill="#efe3c8" stroke="${INK}"/><circle cx="${r1(ml[0])}" cy="${r1(ml[1] - 12)}" r="2.2" fill="#ffc93a" class="dq-flame"/>`;
  // Chimney breast going up into the wall.
  const ch = block(x, y - 66, 0.6, 40, '#8a3f2a', '#9b4a30', '#7d3a25');
  out += ch.svg + bricks(ch, 5, 3, 'rgba(40,15,8,0.45)');
  return out;
};

const bar = (x, y) => {
  const b = block(x, y, 0.5, 30, '#8a5530', '#6e4224', '#5a361d', { fy: 1 });
  let out = shadow(x, y, 40, 14) + b.svg + courses(b, 4, 'rgba(30,15,5,0.4)');
  const top = block(x, y - 30, 0.6, 4, '#b07a45', '#7a4f2a', '#6a4322', { fy: 1 });
  out += top.svg;
  // A tankard or bottle on top, varied.
  const t = top.T(0.4 + vary(x, y) * 0.3, 0.5);
  out += vary(x, y, 2) < 0.5
    ? `<rect x="${r1(t[0] - 4)}" y="${r1(t[1] - 11)}" width="8" height="10" rx="1.5" fill="#c9a26a" stroke="${INK}"/><rect x="${r1(t[0] - 4)}" y="${r1(t[1] - 13)}" width="8" height="3" rx="1.5" fill="#fff"/>`
    : `<path d="M${r1(t[0] - 3)} ${r1(t[1])} v-9 l2 -3 v-4 h2 v4 l2 3 v9 z" fill="#3f7a4a" stroke="${INK}"/>`;
  return out;
};

const table = (x, y) => {
  let out = shadow(x, y, 30, 14);
  // Legs.
  const top = block(x, y - 16, 0.66, 5, '#b8854c', '#8a5c32', '#74492a');
  [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]].forEach(([u, w]) => {
    const px = x + (u * 29 - w * 29) * 0.5;
    const py = y + (u * 29 + w * 29) * 0.25;
    out += `<rect x="${r1(px - 2.5)}" y="${r1(py - 16)}" width="5" height="16" fill="#6b4524" stroke="${INK}" stroke-width="1.2"/>`;
  });
  out += top.svg;
  // Plank lines and what's on the table.
  out += path(`${line(top.T(0.33, 0), top.T(0.33, 1))} ${line(top.T(0.66, 0), top.T(0.66, 1))}`, 'rgba(60,30,10,0.35)', 1);
  const c = top.T(0.5, 0.5);
  const k = vary(x, y);
  if (k < 0.35) out += `<ellipse cx="${r1(c[0])}" cy="${r1(c[1])}" rx="10" ry="5" fill="#e8e2cf" stroke="${INK}"/><ellipse cx="${r1(c[0])}" cy="${r1(c[1] - 2)}" rx="6" ry="3" fill="#b8642f"/>`;
  else if (k < 0.7) out += `<rect x="${r1(c[0] - 9)}" y="${r1(c[1] - 9)}" width="7" height="9" rx="1.5" fill="#c9a26a" stroke="${INK}"/><rect x="${r1(c[0] + 3)}" y="${r1(c[1] - 7)}" width="7" height="8" rx="1.5" fill="#c9a26a" stroke="${INK}"/>`;
  else out += `<rect x="${r1(c[0] - 7)}" y="${r1(c[1] - 3)}" width="5" height="7" fill="#fff" stroke="${INK}" transform="rotate(-20 ${r1(c[0])} ${r1(c[1])})"/><rect x="${r1(c[0] + 1)}" y="${r1(c[1] - 4)}" width="5" height="7" fill="#fff" stroke="${INK}" transform="rotate(15 ${r1(c[0])} ${r1(c[1])})"/>`;
  return out;
};

const stool = (x, y) => {
  let out = shadow(x, y, 13, 6);
  out += `<rect x="${x - 7}" y="${y - 12}" width="3" height="12" fill="#6b4524" stroke="${INK}" stroke-width="1"/><rect x="${x + 4}" y="${y - 12}" width="3" height="12" fill="#6b4524" stroke="${INK}" stroke-width="1"/>`;
  out += `<ellipse cx="${x}" cy="${y - 10}" rx="11" ry="5.5" fill="#7a4f2a" stroke="${INK}" stroke-width="1.5"/><ellipse cx="${x}" cy="${y - 12}" rx="11" ry="5.5" fill="#a87543" stroke="${INK}" stroke-width="1.5"/>`;
  return out;
};

const barrel = (x, y) => {
  const w = 15;
  let out = shadow(x, y, 17, 8);
  out += `<path d="M${x - w} ${y - 2} Q${x - w - 3} ${y - 16} ${x - w} ${y - 30} L${x + w} ${y - 30} Q${x + w + 3} ${y - 16} ${x + w} ${y - 2} Q${x} ${y + 6} ${x - w} ${y - 2} Z" fill="url(#dq-g-wood)" stroke="${INK}" stroke-width="1.5"/>`;
  out += path(`M${x - 6} ${y + 1} Q${x - 8} ${y - 15} ${x - 6} ${y - 33} M${x + 5} ${y + 1} Q${x + 7} ${y - 15} ${x + 5} ${y - 33}`, 'rgba(40,20,8,0.35)', 1);
  out += path(`M${x - w - 1} ${y - 9} Q${x} ${y - 1} ${x + w + 1} ${y - 9} M${x - w - 1} ${y - 23} Q${x} ${y - 15} ${x + w + 1} ${y - 23}`, '#3d3a3a', 3);
  out += `<ellipse cx="${x}" cy="${y - 30}" rx="${w}" ry="7" fill="#b88550" stroke="${INK}" stroke-width="1.5"/><ellipse cx="${x}" cy="${y - 30}" rx="${w - 4}" ry="4.5" fill="none" stroke="rgba(60,30,10,0.4)"/>`;
  return out;
};

const crate = (x, y) => {
  const b = block(x, y, 0.48, 26, '#c79a5a', '#a07038', '#86592c');
  let out = shadow(x, y, 24, 11) + b.svg;
  // Frame and cross braces on both faces.
  out += path(`${line(b.L(0.1, 0.1), b.L(0.9, 0.9))} ${line(b.R(0.1, 0.9), b.R(0.9, 0.1))}`, '#6b4524', 3);
  out += path(`${line(b.T(0, 0.5), b.T(1, 0.5))}`, 'rgba(60,30,10,0.4)', 1);
  return out;
};

const chest = (x, y) => {
  const b = block(x, y, 0.46, 16, '#a0642c', '#8a5226', '#74441f', { fy: 0.34 });
  let out = glow(x, y - 10, 24, 'dq-g-gold') + shadow(x, y, 22, 10) + b.svg;
  // Rounded lid.
  const l0 = b.L(0, 1);
  const l1 = b.L(1, 1);
  const r1p = b.R(1, 1);
  out += `<path d="M${r1(l0[0])} ${r1(l0[1])} Q${r1((l0[0] + l1[0]) / 2)} ${r1(l0[1] - 14)} ${r1(l1[0])} ${r1(l1[1] - 1)} L${r1(r1p[0])} ${r1(r1p[1] - 1)} Q${r1((l1[0] + r1p[0]) / 2 - 4)} ${r1(r1p[1] - 16)} ${r1(l0[0] + 14)} ${r1(l0[1] - 10)} Z" fill="#b8763a" stroke="${INK}" stroke-width="1.5"/>`;
  // Gold bands and lock.
  out += path(`${line(b.L(0.25, 0), b.L(0.25, 1))} ${line(b.L(0.75, 0), b.L(0.75, 1))}`, '#e7b94a', 2.5);
  const lk = b.L(0.5, 0.65);
  out += `<rect x="${r1(lk[0] - 3.5)}" y="${r1(lk[1] - 3)}" width="7" height="8" rx="1.5" fill="#ffd34a" stroke="${INK}"/>`;
  out += `<circle cx="${x}" cy="${y - 34}" r="3" fill="#fff6c8" class="dq-glow"/>`;
  return out;
};

const tree = (x, y) => {
  const k = vary(x, y);
  const s = 0.9 + k * 0.25;
  let out = shadow(x, y, 26 * s, 12 * s, 0.32);
  out += `<path d="M${x - 5} ${y} Q${x - 4} ${y - 20} ${x - 3} ${y - 36} L${x + 3} ${y - 36} Q${x + 4} ${y - 20} ${x + 6} ${y} Q${x} ${y + 3} ${x - 5} ${y} Z" fill="#6b4524" stroke="${INK}" stroke-width="1.5"/>`;
  out += path(`M${x - 1} ${y - 4} q1 -10 -1 -20 M${x + 2} ${y - 14} q1 -6 0 -12`, 'rgba(30,15,5,0.4)', 1);
  const blob = (cx, cy, r, c) => `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="${c}" stroke="${INK}" stroke-width="1.5"/>`;
  out += blob(x - 15 * s, y - 42 * s, 15 * s, '#3d6a28') + blob(x + 15 * s, y - 44 * s, 15 * s, '#355f22') + blob(x, y - 58 * s, 19 * s, '#4f8232') + blob(x - 8 * s, y - 70 * s, 12 * s, '#5f9a3a') + blob(x + 9 * s, y - 66 * s, 12 * s, '#4f8232');
  out += `<circle cx="${r1(x - 9 * s)}" cy="${r1(y - 74 * s)}" r="${r1(5 * s)}" fill="#86c25a" opacity="0.8"/><circle cx="${r1(x + 5 * s)}" cy="${r1(y - 62 * s)}" r="${r1(4 * s)}" fill="#86c25a" opacity="0.6"/>`;
  if (k > 0.8) out += `<circle cx="${r1(x + 12 * s)}" cy="${r1(y - 48 * s)}" r="2.5" fill="#d1372a"/><circle cx="${r1(x - 6 * s)}" cy="${r1(y - 50 * s)}" r="2.5" fill="#d1372a"/>`;
  return out;
};

const pine = (x, y) => {
  const s = 0.9 + vary(x, y) * 0.25;
  let out = shadow(x, y, 20 * s, 9 * s, 0.32);
  out += `<rect x="${x - 4}" y="${y - 14}" width="8" height="14" fill="#5a3418" stroke="${INK}" stroke-width="1.5"/>`;
  const tier = (yb, w, hgt, c) => `<path d="M${r1(x)} ${r1(yb - hgt)} L${r1(x + w)} ${r1(yb)} Q${r1(x)} ${r1(yb + 5)} ${r1(x - w)} ${r1(yb)} Z" fill="${c}" stroke="${INK}" stroke-width="1.5"/>`;
  out += tier(y - 12, 24 * s, 34 * s, '#2a5236') + tier(y - 32 * s, 19 * s, 30 * s, '#326042') + tier(y - 50 * s, 13 * s, 26 * s, '#3a6e4c');
  // Snow on the tips.
  out += `<path d="M${r1(x)} ${r1(y - 76 * s)} l${r1(6 * s)} ${r1(11 * s)} q${r1(-6 * s)} 3 ${r1(-12 * s)} 0 z" fill="#f4f8fb" stroke="${INK}" stroke-width="1"/>`;
  out += path(`M${r1(x - 18 * s)} ${r1(y - 34 * s)} q6 3 12 0 M${r1(x + 6 * s)} ${r1(y - 52 * s)} q5 3 9 0`, '#f4f8fb', 3);
  return out;
};

const deadtree = (x, y) => {
  let out = shadow(x, y, 18, 8);
  out += `<path d="M${x - 6} ${y} Q${x - 3} ${y - 30} ${x - 3} ${y - 50} L${x + 2} ${y - 50} Q${x + 2} ${y - 28} ${x + 7} ${y} Z" fill="#4a3c2c" stroke="${INK}" stroke-width="1.5"/>`;
  out += path(`M${x - 2} ${y - 32} Q${x - 14} ${y - 38} ${x - 20} ${y - 52} M${x} ${y - 42} Q${x + 12} ${y - 48} ${x + 18} ${y - 62} M${x - 2} ${y - 50} L${x - 7} ${y - 68} M${x - 16} ${y - 46} l-7 -3 M${x + 14} ${y - 56} l7 -2`, '#4a3c2c', 4);
  out += path(`M${x - 2} ${y - 32} Q${x - 14} ${y - 38} ${x - 20} ${y - 52} M${x} ${y - 42} Q${x + 12} ${y - 48} ${x + 18} ${y - 62}`, INK, 0.8);
  // Hanging moss.
  out += path(`M${x - 12} ${y - 40} q-1 8 1 14 M${x + 10} ${y - 50} q1 7 -1 12`, '#6b7a3a', 2);
  return out;
};

const bush = (x, y) => {
  let out = shadow(x, y, 18, 8);
  const blob = (cx, cy, r, c) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}" stroke="${INK}" stroke-width="1.5"/>`;
  out += blob(x - 9, y - 7, 10, '#3d6a28') + blob(x + 9, y - 7, 10, '#355f22') + blob(x, y - 14, 11, '#4f8232');
  out += `<circle cx="${x - 3}" cy="${y - 18}" r="4" fill="#86c25a" opacity="0.7"/>`;
  if (vary(x, y) > 0.5) out += `<circle cx="${x + 6}" cy="${y - 12}" r="2.2" fill="#5b7bd6"/><circle cx="${x - 7}" cy="${y - 9}" r="2.2" fill="#5b7bd6"/><circle cx="${x + 1}" cy="${y - 5}" r="2.2" fill="#5b7bd6"/>`;
  return out;
};

const rock = (x, y) => {
  const k = vary(x, y);
  let out = shadow(x, y, 24, 10);
  out += poly([[x - 23, y + 1], [x - 18, y - 16], [x - 4, y - 25 - k * 6], [x + 14, y - 20], [x + 23, y - 3], [x + 6, y + 8]], '#858a92');
  out += poly([[x - 4, y - 25 - k * 6], [x + 14, y - 20], [x + 6, y - 9], [x - 11, y - 12]], '#a7acb3', INK, 1);
  out += poly([[x + 6, y - 9], [x + 14, y - 20], [x + 23, y - 3], [x + 6, y + 8]], '#6c7178', INK, 1);
  out += path(`M${x - 14} ${y - 6} l6 -4 l3 3`, 'rgba(0,0,0,0.3)', 1);
  if (k > 0.55) out += `<path d="M${x - 20} ${y - 2} q4 -6 10 -4 q-2 4 -10 4 z" fill="#5f8f3a"/>`;
  return out;
};

const stump = (x, y) => {
  let out = shadow(x, y, 15, 7);
  out += `<path d="M${x - 12} ${y - 12} L${x - 13} ${y} Q${x} ${y + 6} ${x + 13} ${y} L${x + 12} ${y - 12} Z" fill="#6b4524" stroke="${INK}" stroke-width="1.5"/>`;
  out += `<ellipse cx="${x}" cy="${y - 12}" rx="12" ry="6" fill="#d1aa72" stroke="${INK}" stroke-width="1.5"/><ellipse cx="${x}" cy="${y - 12}" rx="7" ry="3.5" fill="none" stroke="#a8804a"/><ellipse cx="${x}" cy="${y - 12}" rx="3" ry="1.5" fill="none" stroke="#a8804a"/>`;
  return out;
};

const pillar = (x, y) => {
  const base = block(x, y, 0.5, 8, '#c4bba8', '#988f7e', '#827a6a');
  const shaft = block(x, y - 8, 0.36, 70, '#b9b09e', '#a39a88', '#8a8272');
  const cap = block(x, y - 78, 0.5, 8, '#c4bba8', '#988f7e', '#827a6a');
  let out = shadow(x, y, 26, 12) + base.svg + shaft.svg;
  // Fluting.
  out += path(`${line(shaft.L(0.33, 0), shaft.L(0.33, 1))} ${line(shaft.L(0.66, 0), shaft.L(0.66, 1))} ${line(shaft.R(0.33, 0), shaft.R(0.33, 1))} ${line(shaft.R(0.66, 0), shaft.R(0.66, 1))}`, 'rgba(0,0,0,0.18)', 1.2);
  if (vary(x, y) > 0.6) out += path(`${line(shaft.L(0.2, 0.35), shaft.L(0.5, 0.42))} ${line(shaft.L(0.5, 0.42), shaft.L(0.4, 0.55))}`, 'rgba(0,0,0,0.4)', 1.2);
  out += cap.svg;
  return out;
};

const bones = (x, y) => {
  const bone = (x1, y1, x2, y2) => `${path(`M${x1} ${y1} L${x2} ${y2}`, INK, 6)}${path(`M${x1} ${y1} L${x2} ${y2}`, '#efe9d6', 3.5)}<circle cx="${x1}" cy="${y1}" r="2.6" fill="#efe9d6" stroke="${INK}"/><circle cx="${x2}" cy="${y2}" r="2.6" fill="#efe9d6" stroke="${INK}"/>`;
  let out = bone(x - 14, y, x + 6, y + 5) + bone(x - 4, y + 7, x + 10, y - 4);
  out += `<path d="M${x - 6} ${y - 4} q-6 -10 2 -14 q8 -3 10 4 q1 6 -4 9 l-1 3 h-5 z" fill="#efe9d6" stroke="${INK}" stroke-width="1.5"/><circle cx="${x - 2}" cy="${y - 11}" r="1.8" fill="${INK}"/><circle cx="${x + 3}" cy="${y - 10}" r="1.8" fill="${INK}"/>`;
  return out;
};

const torch = (x, y) => {
  let out = glow(x, y - 16, 40) + shadow(x, y, 6, 3);
  out += `<path d="M${x - 2} ${y} L${x - 3} ${y - 22} L${x + 3} ${y - 22} L${x + 2} ${y} Z" fill="#5a3418" stroke="${INK}" stroke-width="1.2"/>`;
  out += `<path d="M${x - 5} ${y - 22} h10 l-2 -4 h-6 z" fill="#4a4d52" stroke="${INK}" stroke-width="1"/>`;
  out += flame(x, y - 25, 0.75);
  return out;
};

const candle = (x, y) => {
  let out = glow(x, y - 10, 28, 'dq-g-green');
  [[-8, 12], [3, 17], [9, 9]].forEach(([dx, hgt]) => {
    out += `<rect x="${x + dx - 2.5}" y="${y - hgt}" width="5" height="${hgt}" rx="1" fill="#e4ecc4" stroke="${INK}" stroke-width="1"/>`;
    out += `<path d="M${x + dx - 2.5} ${y - hgt + 2} q1 4 0 6" stroke="#cfd8a8" stroke-width="1.5" fill="none"/>`;
    out += `<path d="M${x + dx} ${y - hgt - 1} q-3 -4 0 -9 q3 5 0 9 z" fill="#9be15d" class="dq-flame"/>`;
  });
  out += `<ellipse cx="${x}" cy="${y + 1}" rx="14" ry="4" fill="rgba(228,236,196,0.5)"/>`;
  return out;
};

const statue = (x, y) => {
  const base = block(x, y, 0.5, 16, '#b4b7bc', '#8a8d93', '#75787e');
  let out = shadow(x, y, 26, 12) + base.svg + courses(base, 2, 'rgba(0,0,0,0.2)');
  const by = y - 16;
  // A robed figure with a raised sword.
  out += `<path d="M${x - 10} ${by} L${x - 8} ${by - 34} Q${x} ${by - 40} ${x + 8} ${by - 34} L${x + 10} ${by} Q${x} ${by + 4} ${x - 10} ${by} Z" fill="#c3c6cb" stroke="${INK}" stroke-width="1.5"/>`;
  out += path(`M${x - 4} ${by - 2} q-1 -14 1 -28 M${x + 3} ${by - 2} q1 -12 0 -26`, 'rgba(0,0,0,0.18)', 1.2);
  out += `<circle cx="${x}" cy="${by - 43}" r="7.5" fill="#c3c6cb" stroke="${INK}" stroke-width="1.5"/>`;
  out += path(`M${x + 7} ${by - 30} L${x + 13} ${by - 46}`, '#c3c6cb', 5) + path(`M${x + 13} ${by - 46} L${x + 15} ${by - 66}`, '#d8dbe0', 3) + path(`M${x + 9} ${by - 46} h9`, '#a5a8ad', 3);
  out += `<path d="M${x - 10} ${by - 6} q4 -6 9 -3" fill="none" stroke="#5f8f3a" stroke-width="2.5"/>`;
  return out;
};

const crystal = (x, y) => {
  let out = glow(x, y - 16, 46, 'dq-g-ice');
  const shard = (bx, by, hgt, lean, w, c1, c2) => {
    const tip = [bx + lean, by - hgt];
    return poly([[bx - w, by], tip, [bx, by + 3]], c1) + poly([[bx, by + 3], tip, [bx + w, by]], c2);
  };
  out += shard(x + 10, y - 2, 30, 6, 6, '#9fd8ff', '#5aa8e0') + shard(x - 11, y, 36, -6, 7, '#c8b8ff', '#8a74e0') + shard(x, y + 2, 54, 1, 9, '#bff0ff', '#6fc0f0');
  out += path(`M${x - 2} ${y - 6} L${x} ${y - 44}`, 'rgba(255,255,255,0.8)', 2);
  out += `<circle cx="${x + 1}" cy="${y - 50}" r="2.5" fill="#fff" class="dq-glow"/>`;
  return out;
};

const mushroom = (x, y) => {
  const cap = (cx, cy, r, c) => `<rect x="${cx - r * 0.3}" y="${cy}" width="${r * 0.6}" height="${r * 1.1}" rx="${r * 0.2}" fill="#efe3c8" stroke="${INK}" stroke-width="1.2"/>`
    + `<path d="M${cx - r} ${cy + 1} Q${cx - r} ${cy - r * 0.9} ${cx} ${cy - r * 0.9} Q${cx + r} ${cy - r * 0.9} ${cx + r} ${cy + 1} Q${cx} ${cy + r * 0.35} ${cx - r} ${cy + 1} Z" fill="${c}" stroke="${INK}" stroke-width="1.5"/>`
    + `<circle cx="${cx - r * 0.4}" cy="${cy - r * 0.45}" r="${r * 0.16}" fill="#fff"/><circle cx="${cx + r * 0.35}" cy="${cy - r * 0.3}" r="${r * 0.12}" fill="#fff"/>`;
  let out = shadow(x, y, 16, 6);
  out += cap(x - 4, y - 14, 11, '#c0392b') + cap(x + 10, y - 6, 7, '#d1237a') + cap(x - 13, y - 4, 5, '#8e44ad');
  return out;
};

const stalagmite = (x, y) => {
  let out = shadow(x, y, 16, 7);
  out += `<path d="M${x - 15} ${y} Q${x - 8} ${y - 26} ${x - 1} ${y - 62} Q${x + 6} ${y - 28} ${x + 15} ${y} Q${x} ${y + 6} ${x - 15} ${y} Z" fill="#5d5478" stroke="${INK}" stroke-width="1.5"/>`;
  out += `<path d="M${x - 1} ${y - 62} Q${x + 6} ${y - 28} ${x + 15} ${y} Q${x + 6} ${y + 3} ${x + 3} ${y + 3} Q${x + 3} ${y - 30} ${x - 1} ${y - 62} Z" fill="#463e60"/>`;
  out += path(`M${x - 8} ${y - 10} q2 -4 5 -2 M${x - 5} ${y - 30} q2 -3 4 -1`, 'rgba(255,255,255,0.25)', 1.5);
  out += `<path d="M${x + 12} ${y + 1} q4 -16 9 -22 q2 12 -1 22 z" fill="#5d5478" stroke="${INK}" stroke-width="1.2"/>`;
  return out;
};

const web = (x, y) => {
  let d = '';
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    d += `M${x} ${y - 10} L${r1(x + Math.cos(a) * 26)} ${r1(y - 10 + Math.sin(a) * 15)} `;
  }
  [8, 15, 22].forEach((r) => {
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const b = ((i + 1) / 8) * Math.PI * 2;
      d += `M${r1(x + Math.cos(a) * r)} ${r1(y - 10 + Math.sin(a) * r * 0.58)} Q${r1(x + Math.cos((a + b) / 2) * r * 0.82)} ${r1(y - 10 + Math.sin((a + b) / 2) * r * 0.48)} ${r1(x + Math.cos(b) * r)} ${r1(y - 10 + Math.sin(b) * r * 0.58)} `;
    }
  });
  return path(d, 'rgba(240,240,255,0.7)', 1.1) + `<ellipse cx="${x + 9}" cy="${y - 4}" rx="4" ry="5" fill="rgba(240,240,255,0.65)"/>`;
};

const grave = (x, y) => {
  const k = vary(x, y);
  let out = shadow(x, y, 16, 7);
  out += `<ellipse cx="${x}" cy="${y + 4}" rx="16" ry="6" fill="#4a3a28" stroke="${INK}" stroke-width="1"/>`;
  if (k < 0.5) {
    out += `<path d="M${x - 11} ${y + 2} L${x - 11} ${y - 22} Q${x} ${y - 38} ${x + 11} ${y - 22} L${x + 11} ${y + 2} Z" fill="#9a9da3" stroke="${INK}" stroke-width="1.5"/>`;
    out += `<path d="M${x + 11} ${y - 22} L${x + 15} ${y - 20} L${x + 15} ${y + 4} L${x + 11} ${y + 2} Z" fill="#74777d" stroke="${INK}" stroke-width="1.2"/>`;
    out += path(`M${x - 5} ${y - 18} h10 M${x - 4} ${y - 12} h8 M${x - 5} ${y - 6} h10`, 'rgba(0,0,0,0.35)', 1.2);
  } else {
    out += `<path d="M${x - 3} ${y + 2} V${y - 18} H${x - 11} V${y - 24} H${x - 3} V${y - 34} H${x + 3} V${y - 24} H${x + 11} V${y - 18} H${x + 3} V${y + 2} Z" fill="#9a9da3" stroke="${INK}" stroke-width="1.5"/>`;
  }
  out += `<path d="M${x - 11} ${y} q3 -7 7 -2 q2 -6 6 0" fill="#3f6b2e" stroke="${INK}" stroke-width="0.8"/>`;
  return out;
};

const coffin = (x, y) => {
  const b = block(x, y, 0.5, 12, '#7a5230', '#5e3e22', '#4e321b', { fy: 0.28 });
  let out = shadow(x, y, 26, 10) + b.svg;
  const lid = block(x, y - 12, 0.54, 4, '#8f6238', '#6a4626', '#5a3b20', { fy: 0.32 });
  out += lid.svg;
  const c = lid.T(0.5, 0.5);
  out += path(`M${r1(c[0] - 10)} ${r1(c[1] - 5)} L${r1(c[0] + 10)} ${r1(c[1] + 5)} M${r1(c[0] - 4)} ${r1(c[1] + 3)} L${r1(c[0] + 4)} ${r1(c[1] - 3)}`, '#d4af37', 2.5);
  if (vary(x, y) > 0.6) out += `<path d="M${r1(c[0] + 14)} ${r1(c[1] + 2)} q4 -2 6 2" stroke="#efe9d6" stroke-width="3" fill="none"/>`;
  return out;
};

const banner = (x, y) => {
  let out = shadow(x, y, 10, 5);
  out += `<rect x="${x - 2.5}" y="${y - 78}" width="5" height="78" fill="#4a2e18" stroke="${INK}" stroke-width="1.2"/><circle cx="${x}" cy="${y - 80}" r="4" fill="#e7b94a" stroke="${INK}"/>`;
  out += path(`M${x} ${y - 72} h28`, '#4a2e18', 3);
  out += `<path d="M${x + 3} ${y - 72} h24 v40 l-12 -8 l-12 8 z" fill="#9b1e30" stroke="${INK}" stroke-width="1.5" class="dq-sway"/>`;
  out += `<path d="M${x + 15} ${y - 62} l5 6 l-5 6 l-5 -6 z" fill="#e7b94a" stroke="${INK}" stroke-width="1"/>`;
  out += path(`M${x + 6} ${y - 70} v36 M${x + 24} ${y - 70} v36`, '#e7b94a', 1.5);
  return out;
};

const armorstand = (x, y) => {
  let out = shadow(x, y, 14, 6);
  out += `<rect x="${x - 2}" y="${y - 24}" width="4" height="24" fill="#4a2e18" stroke="${INK}" stroke-width="1"/><path d="M${x - 10} ${y} h20" stroke="#4a2e18" stroke-width="4"/>`;
  out += `<path d="M${x - 14} ${y - 50} Q${x} ${y - 56} ${x + 14} ${y - 50} L${x + 11} ${y - 24} Q${x} ${y - 20} ${x - 11} ${y - 24} Z" fill="url(#dq-g-steel)" stroke="${INK}" stroke-width="1.5"/>`;
  out += path(`M${x} ${y - 52} v28 M${x - 10} ${y - 36} q10 4 20 0`, 'rgba(0,0,0,0.3)', 1.2);
  out += `<path d="M${x - 9} ${y - 58} q0 -14 9 -14 q9 0 9 14 z" fill="url(#dq-g-steel)" stroke="${INK}" stroke-width="1.5"/><path d="M${x - 6} ${y - 63} h12" stroke="${INK}" stroke-width="2.5"/>`;
  out += `<path d="M${x} ${y - 72} q6 -8 2 -14" stroke="#b8432f" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  return out;
};

const throne = (x, y) => {
  const seat = block(x, y, 0.5, 16, '#9b1e30', '#7a1626', '#62111e');
  let out = glow(x, y - 30, 40, 'dq-g-gold') + shadow(x, y, 26, 12) + seat.svg;
  out += `<path d="M${x - 16} ${y - 14} L${x - 15} ${y - 62} Q${x} ${y - 82} ${x + 15} ${y - 62} L${x + 16} ${y - 14} Z" fill="url(#dq-g-gold-face)" stroke="${INK}" stroke-width="1.5"/>`;
  out += `<path d="M${x - 10} ${y - 18} L${x - 9} ${y - 58} Q${x} ${y - 72} ${x + 9} ${y - 58} L${x + 10} ${y - 18} Z" fill="#9b1e30" stroke="${INK}" stroke-width="1"/>`;
  out += `<circle cx="${x}" cy="${y - 66}" r="3.5" fill="#d1237a" stroke="${INK}"/><circle cx="${x - 14}" cy="${y - 62}" r="2.5" fill="#5aa8e0" stroke="${INK}"/><circle cx="${x + 14}" cy="${y - 62}" r="2.5" fill="#5aa8e0" stroke="${INK}"/>`;
  return out;
};

const reeds = (x, y) => {
  let out = '';
  [[-12, 30, -4], [-5, 40, 1], [2, 34, 5], [9, 28, 8], [14, 22, 3]].forEach(([dx, hgt, lean]) => {
    out += path(`M${x + dx} ${y} q${lean / 2} ${-hgt / 2} ${lean} ${-hgt}`, '#6b7a2e', 2.5);
  });
  out += `<rect x="${x - 7}" y="${y - 42}" width="5" height="12" rx="2.5" fill="#6b4524" stroke="${INK}" stroke-width="1"/><rect x="${x + 4}" y="${y - 36}" width="5" height="11" rx="2.5" fill="#6b4524" stroke="${INK}" stroke-width="1"/>`;
  out += path(`M${x - 16} ${y - 2} q8 -10 14 -8 M${x + 18} ${y} q-6 -12 -14 -12`, '#86a03a', 2);
  return out;
};

const hut = (x, y) => {
  // A witch's hut on stilts with a sagging thatch roof and a lit window.
  let out = shadow(x, y, 36, 16);
  [[-22, 0], [22, 0], [-10, 8], [10, 8]].forEach(([dx, dy]) => { out += `<rect x="${x + dx - 2.5}" y="${y + dy - 22}" width="5" height="22" fill="#4a3220" stroke="${INK}" stroke-width="1.2"/>`; });
  const room = block(x, y - 22, 0.72, 32, '#6b5a3a', '#7a6440', '#5e4c30');
  out += room.svg + courses(room, 5, 'rgba(30,20,8,0.4)');
  const w = room.L(0.55, 0.45);
  out += `<polygon points="${pts([[w[0] - 6, w[1] - 5], [w[0] + 6, w[1] + 1], [w[0] + 6, w[1] + 13], [w[0] - 6, w[1] + 7]])}" fill="#ffd27a" stroke="${INK}" stroke-width="1.5" class="dq-glow"/>`;
  const rd = room.R(0.45, 0);
  out += `<polygon points="${pts([[rd[0] - 5, rd[1] + 2], [rd[0] + 5, rd[1] - 3], [rd[0] + 5, rd[1] - 21], [rd[0] - 5, rd[1] - 16]])}" fill="#3a2614" stroke="${INK}" stroke-width="1.5"/>`;
  // Roof.
  const { n, e, s, w: wc } = room.corners;
  const top = [x, y - 22 - 32 - 40];
  const up = (p) => [p[0], p[1] - 22 - 32];
  const out1 = (p, k) => [x + (p[0] - x) * k, y - 22 + (p[1] - (y - 22)) * k - 32];
  out += poly([out1(wc, 1.2), out1(s, 1.2), top], '#a08a4a') + poly([out1(s, 1.2), out1(e, 1.2), top], '#86723c');
  out += path(`M${r1(top[0])} ${r1(top[1])} L${r1(out1(wc, 1.2)[0] + 10)} ${r1(out1(wc, 1.2)[1] - 2)} M${r1(top[0])} ${r1(top[1])} L${r1(out1(s, 1.2)[0] - 8)} ${r1(out1(s, 1.2)[1])} M${r1(top[0])} ${r1(top[1])} L${r1(out1(e, 1.2)[0] - 8)} ${r1(out1(e, 1.2)[1])}`, 'rgba(60,40,10,0.45)', 1.2);
  void n; void up;
  out += `<path d="M${x + 6} ${y - 98} q-4 -10 2 -18 q6 -6 2 -14" stroke="rgba(200,200,200,0.5)" stroke-width="4" fill="none" class="dq-smoke"/>`;
  return out;
};

const cairn = (x, y) => {
  let out = shadow(x, y, 18, 8);
  const stone = (cx, cy, rx, ry, c) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${c}" stroke="${INK}" stroke-width="1.5"/><ellipse cx="${cx - rx * 0.3}" cy="${cy - ry * 0.35}" rx="${rx * 0.35}" ry="${ry * 0.3}" fill="rgba(255,255,255,0.25)"/>`;
  out += stone(x, y - 6, 17, 8, '#7f848b') + stone(x + 1, y - 17, 13, 6.5, '#93989f') + stone(x - 1, y - 27, 9.5, 5, '#a8adb4') + stone(x, y - 35, 6, 3.5, '#bcc1c7');
  out += `<path d="M${x - 8} ${y - 31} q8 -4 16 0" stroke="#f4f8fb" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  return out;
};

const snowbank = (x, y) => {
  let out = `<path d="M${x - 26} ${y + 2} Q${x - 22} ${y - 12} ${x - 8} ${y - 12} Q${x} ${y - 20} ${x + 10} ${y - 12} Q${x + 24} ${y - 10} ${x + 26} ${y + 2} Q${x} ${y + 9} ${x - 26} ${y + 2} Z" fill="#f4f8fb" stroke="#9fb0c4" stroke-width="1.5"/>`;
  out += `<path d="M${x - 2} ${y - 6} Q${x + 10} ${y - 10} ${x + 22} ${y - 2} Q${x + 10} ${y + 4} ${x - 2} ${y - 6} Z" fill="#dbe6f2"/>`;
  out += `<circle cx="${x - 10}" cy="${y - 9}" r="1.5" fill="#fff"/><circle cx="${x + 6}" cy="${y - 14}" r="1.2" fill="#fff"/>`;
  return out;
};

const exit = (x, y) => `${glow(x, y, 40, 'dq-g-ice')}<ellipse cx="${x}" cy="${y}" rx="26" ry="13" fill="none" stroke="#bff0ff" stroke-width="2.5" stroke-dasharray="6 5" class="dq-spin"/>`
  + `<ellipse cx="${x}" cy="${y}" rx="15" ry="7.5" fill="#e3f6ff" opacity="0.7" class="dq-glow"/>`
  + `<path d="M${x} ${y - 50} l11 15 h-6 v14 h-10 v-14 h-6 z" fill="#ffe066" stroke="${INK}" stroke-width="2" class="dq-hop"/>`;

const cottage = (x, y) => {
  // Whitewashed timber-frame cottage with a thatched roof, a door, a lit window and a chimney.
  const k = vary(x, y);
  const walls = ['#efe4cc', '#e6d6b4', '#d9c7a0'][Math.floor(k * 3)];
  const room = block(x, y, 0.82, 38, walls, walls, '#cbb894');
  let out = shadow(x, y, 46, 20) + room.svg;
  // Timber frame.
  out += path(`${line(room.L(0, 0.5), room.L(1, 0.5))} ${line(room.R(0, 0.5), room.R(1, 0.5))} ${line(room.L(0.5, 0), room.L(0.5, 1))} ${line(room.R(0.5, 0), room.R(0.5, 1))} ${line(room.L(0, 0), room.L(0.5, 0.5))} ${line(room.R(0.5, 0.5), room.R(1, 1))}`, '#5a3418', 2.5);
  // Door on the left face, window on the right.
  const d = room.L(0.72, 0);
  out += `<polygon points="${pts([[d[0] - 5, d[1] - 2], [d[0] + 5, d[1] + 3], [d[0] + 5, d[1] - 19], [d[0] - 5, d[1] - 24]])}" fill="#6b3f1f" stroke="${INK}" stroke-width="1.5"/><circle cx="${r1(d[0] + 2)}" cy="${r1(d[1] - 9)}" r="1.3" fill="#e7b94a"/>`;
  const w = room.R(0.3, 0.55);
  out += `<polygon points="${pts([[w[0] - 6, w[1] + 3], [w[0] + 6, w[1] - 3], [w[0] + 6, w[1] - 13], [w[0] - 6, w[1] - 7]])}" fill="#ffd27a" stroke="${INK}" stroke-width="1.5" class="dq-glow"/>`;
  out += path(line([w[0], w[1] - 10 + 0], [w[0], w[1] + 0]), INK, 1);
  // Roof: two slopes over the left and right faces.
  const { n, e, s: so, w: wc } = room.corners;
  const lift = (p, dy) => [p[0], p[1] - 38 - dy];
  const ridgeA = [(n[0] + e[0]) / 2, (n[1] + e[1]) / 2];
  const ridgeB = [(wc[0] + so[0]) / 2, (wc[1] + so[1]) / 2];
  const over = (p, c, k2) => [p[0] + (p[0] - c[0]) * k2, p[1] + (p[1] - c[1]) * k2];
  const RA = lift(ridgeA, 30);
  const RB = lift(ridgeB, 30);
  const roofCol = k > 0.5 ? '#c49a4a' : '#9b4a30';
  out += poly([lift(over(wc, [x, y], 0.12), -4), lift(over(so, [x, y], 0.12), -4), RB], shade2(roofCol, -0.15));
  out += poly([RB, lift(over(so, [x, y], 0.12), -4), lift(over(e, [x, y], 0.12), -4), RA], roofCol);
  out += path(`${line(RB, RA)}`, INK, 2);
  for (let i = 1; i < 4; i += 1) {
    const t = i / 4;
    const a = [RB[0] + (RA[0] - RB[0]) * t, RB[1] + (RA[1] - RB[1]) * t];
    const so2 = lift(over(so, [x, y], 0.12), -4);
    const e2 = lift(over(e, [x, y], 0.12), -4);
    const b2 = [so2[0] + (e2[0] - so2[0]) * t, so2[1] + (e2[1] - so2[1]) * t];
    out += path(line(a, b2), 'rgba(40,20,5,0.3)', 1);
  }
  // Chimney with smoke.
  const c = [RA[0] - 8, RA[1] + 6];
  out += `<rect x="${r1(c[0] - 4)}" y="${r1(c[1] - 16)}" width="8" height="16" fill="#8a3f2a" stroke="${INK}" stroke-width="1.2"/>`;
  out += `<path d="M${r1(c[0])} ${r1(c[1] - 20)} q-4 -8 2 -14 q6 -6 1 -12" stroke="rgba(220,220,220,0.55)" stroke-width="4" fill="none" class="dq-smoke"/>`;
  return out;
};

const well = (x, y) => {
  let out = shadow(x, y, 20, 9);
  out += `<path d="M${x - 16} ${y - 2} L${x - 16} ${y - 16} Q${x} ${y - 8} ${x + 16} ${y - 16} L${x + 16} ${y - 2} Q${x} ${y + 8} ${x - 16} ${y - 2} Z" fill="#8f949b" stroke="${INK}" stroke-width="1.5"/>`;
  out += path(`M${x - 16} ${y - 9} Q${x} ${y} ${x + 16} ${y - 9} M${x - 8} ${y - 12} v8 M${x + 6} ${y - 12} v9`, 'rgba(0,0,0,0.3)', 1);
  out += `<ellipse cx="${x}" cy="${y - 16}" rx="16" ry="7" fill="#a7acb3" stroke="${INK}" stroke-width="1.5"/><ellipse cx="${x}" cy="${y - 16}" rx="11" ry="4.5" fill="#1d2a3a"/>`;
  out += `<rect x="${x - 15}" y="${y - 42}" width="3.5" height="26" fill="#5a3418" stroke="${INK}"/><rect x="${x + 11.5}" y="${y - 42}" width="3.5" height="26" fill="#5a3418" stroke="${INK}"/>`;
  out += `<path d="M${x - 19} ${y - 40} L${x} ${y - 52} L${x + 19} ${y - 40} Z" fill="#9b4a30" stroke="${INK}" stroke-width="1.5"/>`;
  out += path(`M${x - 12} ${y - 36} h24`, '#5a3418', 2.5) + path(`M${x} ${y - 36} v10`, '#c9b08a', 1.2);
  out += `<rect x="${x - 3.5}" y="${y - 27}" width="7" height="6" fill="#7a5230" stroke="${INK}" stroke-width="1"/>`;
  return out;
};

const fence = (x, y) => {
  let out = '';
  const a = [x - 24, y + 6];
  const b = [x + 24, y - 6];
  const post = (p) => `<rect x="${r1(p[0] - 2.5)}" y="${r1(p[1] - 20)}" width="5" height="20" fill="#7a5230" stroke="${INK}" stroke-width="1.1"/><path d="M${r1(p[0] - 2.5)} ${r1(p[1] - 20)} l2.5 -3 l2.5 3" fill="#7a5230" stroke="${INK}" stroke-width="1"/>`;
  out += path(`M${a[0]} ${a[1] - 7} L${b[0]} ${b[1] - 7} M${a[0]} ${a[1] - 15} L${b[0]} ${b[1] - 15}`, INK, 5) + path(`M${a[0]} ${a[1] - 7} L${b[0]} ${b[1] - 7} M${a[0]} ${a[1] - 15} L${b[0]} ${b[1] - 15}`, '#a87543', 3);
  out += post(a) + post([x, y]) + post(b);
  return out;
};

const stall = (x, y) => {
  const k = vary(x, y);
  const table = block(x, y, 0.62, 14, '#b8854c', '#8a5c32', '#74492a', { fy: 0.45 });
  let out = shadow(x, y, 32, 14) + table.svg;
  // Goods on the counter.
  const goods = k < 0.5 ? ['#d1372a', '#e7b94a', '#5f9a3a'] : ['#8e44ad', '#2f80ed', '#efe3c8'];
  [0.2, 0.5, 0.8].forEach((u, i) => { const p = table.T(u, 0.5); out += `<circle cx="${r1(p[0])}" cy="${r1(p[1] - 3)}" r="4" fill="${goods[i]}" stroke="${INK}"/><circle cx="${r1(p[0] + 4)}" cy="${r1(p[1] - 1)}" r="3.5" fill="${goods[i]}" stroke="${INK}"/>`; });
  // Poles and a striped awning.
  const l = table.L(0, 1);
  const rr = table.R(1, 1);
  out += path(`M${r1(l[0])} ${r1(l[1])} v-34 M${r1(rr[0])} ${r1(rr[1])} v-34`, '#5a3418', 3);
  const col = k < 0.5 ? '#c0392b' : '#2f80ed';
  const A = [l[0] - 4, l[1] - 30];
  const B = [rr[0] + 4, rr[1] - 30];
  const C = [B[0] - 12, B[1] - 14];
  const D = [A[0] - 12, A[1] - 14];
  out += poly([D, C, B, A], '#fff');
  for (let i = 0; i < 4; i += 1) {
    const t0 = i / 4;
    const t1 = (i + 0.5) / 4;
    const p = (P, Q, t) => [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t];
    out += poly([p(D, C, t0), p(D, C, t1), p(A, B, t1), p(A, B, t0)], col, INK, 0.8);
  }
  out += path(`M${r1(A[0])} ${r1(A[1])} q4 5 8 0 q4 5 8 0 q4 5 8 0 q4 5 8 0 q4 5 8 0 q4 5 8 0`, col, 2.5);
  return out;
};

const lamppost = (x, y) => {
  let out = glow(x, y - 44, 44) + shadow(x, y, 8, 4);
  out += `<rect x="${x - 2}" y="${y - 50}" width="4" height="50" fill="#2e2a33" stroke="${INK}" stroke-width="1"/><path d="M${x - 6} ${y} h12" stroke="#2e2a33" stroke-width="4"/>`;
  out += `<path d="M${x - 7} ${y - 50} h14 l-3 -12 h-8 z" fill="#ffd27a" stroke="${INK}" stroke-width="1.5" class="dq-glow"/><path d="M${x - 8} ${y - 62} h16 l-8 -6 z" fill="#2e2a33" stroke="${INK}" stroke-width="1"/>`;
  return out;
};

const haybale = (x, y) => {
  const b = block(x, y, 0.5, 18, '#e8c45a', '#d4a83a', '#b8902e', { fy: 0.34 });
  let out = shadow(x, y, 22, 10) + b.svg;
  out += path(`${line(b.L(0.3, 0), b.L(0.3, 1))} ${line(b.L(0.7, 0), b.L(0.7, 1))}`, '#8a6a1f', 1.5);
  out += path(`M${x - 18} ${y - 4} l3 -3 M${x - 8} ${y + 2} l2 -4 M${x + 10} ${y - 6} l3 -3`, '#a8862a', 1);
  return out;
};

const cart = (x, y) => {
  const bed = block(x, y - 10, 0.55, 12, '#a87543', '#8a5c32', '#74492a', { fy: 0.35 });
  let out = shadow(x, y, 28, 12);
  const wheel = (p) => `<ellipse cx="${r1(p[0])}" cy="${r1(p[1])}" rx="8" ry="9" fill="#5a3418" stroke="${INK}" stroke-width="1.5"/><ellipse cx="${r1(p[0])}" cy="${r1(p[1])}" rx="2.5" ry="3" fill="#2a1a10"/>` + path(`M${r1(p[0] - 7)} ${r1(p[1])} h14 M${r1(p[0])} ${r1(p[1] - 8)} v16`, '#3a2414', 1.5);
  out += wheel([x + 12, y - 4]);
  out += bed.svg + courses(bed, 2, 'rgba(40,20,5,0.4)');
  // Load: sacks or a barrel.
  const t = bed.T(0.5, 0.5);
  out += vary(x, y) < 0.5
    ? `<ellipse cx="${r1(t[0] - 6)}" cy="${r1(t[1] - 6)}" rx="9" ry="7" fill="#d8c39a" stroke="${INK}"/><ellipse cx="${r1(t[0] + 6)}" cy="${r1(t[1] - 4)}" rx="8" ry="6" fill="#cbb48a" stroke="${INK}"/>`
    : `<rect x="${r1(t[0] - 8)}" y="${r1(t[1] - 16)}" width="16" height="16" rx="3" fill="url(#dq-g-wood)" stroke="${INK}"/>`;
  out += wheel([x - 14, y + 3]);
  out += path(`M${x - 24} ${y - 6} L${x - 40} ${y + 2}`, '#5a3418', 3);
  return out;
};

const tent = (x, y) => {
  const k = vary(x, y);
  const col = ['#b8432f', '#3a6b8a', '#6b7a3a'][Math.floor(k * 3)];
  let out = shadow(x, y, 32, 14);
  const front = [x - 30, y + 2];
  const right = [x + 30, y - 4];
  const back = [x + 10, y - 16];
  const apex = [x - 4, y - 46];
  out += poly([front, [x, y + 14], apex], shade2(col, -0.2)) + poly([[x, y + 14], right, apex], col) + poly([right, back, apex], shade2(col, -0.3));
  out += `<path d="M${x - 14} ${y + 8} L${x - 4} ${y - 30} L${x + 4} ${y + 10} Z" fill="#2a1a10" stroke="${INK}" stroke-width="1"/>`;
  out += path(`M${apex[0]} ${apex[1]} v-10`, '#5a3418', 2.5) + `<path d="M${apex[0]} ${apex[1] - 10} l9 3 l-9 3 z" fill="#e7b94a" stroke="${INK}" stroke-width="0.8"/>`;
  out += path(`M${front[0]} ${front[1]} l-8 6 M${right[0]} ${right[1]} l8 4`, '#c9b08a', 1);
  return out;
};

const campfire = (x, y) => {
  let out = glow(x, y - 4, 64);
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    out += `<ellipse cx="${r1(x + Math.cos(a) * 15)}" cy="${r1(y + Math.sin(a) * 7.5)}" rx="5" ry="3.5" fill="#8f949b" stroke="${INK}" stroke-width="1"/>`;
  }
  out += path(`M${x - 10} ${y + 2} L${x + 9} ${y - 5} M${x - 9} ${y - 5} L${x + 10} ${y + 2}`, '#5a3418', 4.5);
  out += flame(x, y - 1, 0.9);
  out += `<circle cx="${x + 5}" cy="${y - 30}" r="1.5" fill="#ffb347" class="dq-ember"/><circle cx="${x - 4}" cy="${y - 36}" r="1.2" fill="#ffb347" class="dq-ember"/>`;
  return out;
};

const signpost = (x, y) => {
  let out = shadow(x, y, 8, 4);
  out += `<rect x="${x - 2.5}" y="${y - 48}" width="5" height="48" fill="#6b4524" stroke="${INK}" stroke-width="1.2"/>`;
  out += `<path d="M${x - 2} ${y - 44} h22 l6 5 l-6 5 h-22 z" fill="#c9a26a" stroke="${INK}" stroke-width="1.3"/>`;
  out += `<path d="M${x + 2} ${y - 30} h-22 l-6 5 l6 5 h22 z" fill="#b8925a" stroke="${INK}" stroke-width="1.3"/>`;
  out += path(`M${x + 4} ${y - 39} h12 M${x - 20} ${y - 25} h14`, 'rgba(40,20,5,0.55)', 1.5);
  return out;
};

const weaponrack = (x, y) => {
  let out = shadow(x, y, 20, 8);
  out += path(`M${x - 18} ${y + 2} L${x - 18} ${y - 30} M${x + 18} ${y - 8} L${x + 18} ${y - 40} M${x - 18} ${y - 22} L${x + 18} ${y - 32}`, '#5a3418', 4);
  out += path(`M${x - 18} ${y + 2} L${x - 18} ${y - 30} M${x + 18} ${y - 8} L${x + 18} ${y - 40}`, INK, 0.8);
  // Spear, sword, axe leaning on it.
  out += path(`M${x - 10} ${y + 2} L${x - 8} ${y - 46}`, '#6b4524', 2.5) + `<path d="M${x - 11} ${y - 44} l3 -10 l3 10 z" fill="#c5cad1" stroke="${INK}" stroke-width="1"/>`;
  out += path(`M${x + 1} ${y - 2} L${x + 2} ${y - 40}`, '#d6dae0', 3.5) + path(`M${x - 3} ${y - 8} h9`, '#7a5f1a', 3);
  out += path(`M${x + 10} ${y - 6} L${x + 11} ${y - 42}`, '#6b4524', 2.5) + `<path d="M${x + 11} ${y - 42} q9 1 8 11 q-5 -4 -8 -3 z" fill="#c5cad1" stroke="${INK}" stroke-width="1"/>`;
  return out;
};

const shade2 = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k)));
  return `#${ch.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('')}`;
};

export const PROP_DRAW = {
  cottage, well, fence, stall, lamppost, haybale, cart, tent, campfire, signpost, weaponrack,
  table, stool, barrel, crate, bar, hearth, tree, pine, deadtree, bush, rock, stump, pillar, bones, torch, candle, statue, crystal,
  mushroom, stalagmite, web, grave, coffin, banner, armorstand, throne, reeds, hut, cairn, snowbank, chest, exit,
};

/** Shared gradients for the props, rendered once inside the board's <defs>. */
export const PROP_DEFS = `
<radialGradient id="dq-g-fire"><stop offset="0%" stop-color="#ffb347" stop-opacity="0.55"/><stop offset="100%" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient>
<radialGradient id="dq-g-gold"><stop offset="0%" stop-color="#ffe9a0" stop-opacity="0.5"/><stop offset="100%" stop-color="#ffd34a" stop-opacity="0"/></radialGradient>
<radialGradient id="dq-g-green"><stop offset="0%" stop-color="#b8f07a" stop-opacity="0.5"/><stop offset="100%" stop-color="#9be15d" stop-opacity="0"/></radialGradient>
<radialGradient id="dq-g-ice"><stop offset="0%" stop-color="#bff0ff" stop-opacity="0.6"/><stop offset="100%" stop-color="#7ad7ff" stop-opacity="0"/></radialGradient>
<linearGradient id="dq-g-wood" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="#6e4422"/><stop offset="45%" stop-color="#a87040"/><stop offset="100%" stop-color="#5a361a"/></linearGradient>
<linearGradient id="dq-g-steel" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="#7d8189"/><stop offset="40%" stop-color="#d6dae0"/><stop offset="100%" stop-color="#6c7078"/></linearGradient>
<linearGradient id="dq-g-gold-face" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="#a8821f"/><stop offset="45%" stop-color="#f2d06b"/><stop offset="100%" stop-color="#8a6a15"/></linearGradient>`;
