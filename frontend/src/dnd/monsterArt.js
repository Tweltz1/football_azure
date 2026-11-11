// Drawn figures for the monsters on the TV board, as SVG strings. Each one stands with its feet at (0, 0)
// and is about 70 px tall at scale 1, the same size as a hero.

import { shade } from './iso';

const f = (v) => Math.round(v * 10) / 10;

// ---- Pieces ------------------------------------------------------------------------------------------------------

const WEAPONS = {
  none: () => '',
  sword: (x, y) => `<path d="M${x} ${y} L${x + 4} ${y - 30}" stroke="#d9dde3" stroke-width="4" stroke-linecap="round"/><path d="M${x - 5} ${y - 2} L${x + 6} ${y + 1}" stroke="#7a5f1a" stroke-width="4" stroke-linecap="round"/>`,
  dagger: (x, y) => `<path d="M${x} ${y} L${x + 3} ${y - 15}" stroke="#d9dde3" stroke-width="3.5" stroke-linecap="round"/><path d="M${x - 4} ${y} L${x + 4} ${y + 1}" stroke="#5a3c20" stroke-width="3" stroke-linecap="round"/>`,
  axe: (x, y) => `<path d="M${x} ${y + 6} L${x + 2} ${y - 28}" stroke="#5a3c20" stroke-width="4" stroke-linecap="round"/><path d="M${x + 2} ${y - 28} q14 2 12 16 q-8 -6 -12 -4 z" fill="#c5cad1" stroke="#55575d" stroke-width="1.5"/>`,
  club: (x, y) => `<path d="M${x} ${y + 4} L${x + 5} ${y - 26}" stroke="#6b4a2a" stroke-width="7" stroke-linecap="round"/><circle cx="${x + 5}" cy="${y - 27}" r="6" fill="#7a5530"/>`,
  spear: (x, y) => `<path d="M${x} ${y + 14} L${x + 2} ${y - 36}" stroke="#6b4a2a" stroke-width="3" stroke-linecap="round"/><path d="M${x - 3} ${y - 34} L${x + 2} ${y - 46} L${x + 7} ${y - 34} z" fill="#c5cad1"/>`,
  staff: (x, y) => `<path d="M${x} ${y + 18} L${x + 1} ${y - 34}" stroke="#4a321c" stroke-width="4" stroke-linecap="round"/><circle cx="${x + 1}" cy="${y - 38}" r="6" fill="#c38bff" class="dq-glow"/>`,
  bow: (x, y) => `<path d="M${x - 2} ${y - 22} q14 22 0 44" stroke="#6b4a2a" stroke-width="3" fill="none"/><path d="M${x - 2} ${y - 22} L${x - 2} ${y + 22}" stroke="#efe3c8" stroke-width="1"/>`,
  mug: (x, y) => `<rect x="${x - 5}" y="${y - 10}" width="10" height="12" rx="2" fill="#c9a26a" stroke="#6b4a2a" stroke-width="2"/><rect x="${x - 5}" y="${y - 13}" width="10" height="4" rx="2" fill="#fff"/>`,
  claws: (x, y) => `<path d="M${x - 3} ${y + 2} l-2 7 M${x} ${y + 3} l0 7 M${x + 3} ${y + 2} l2 7" stroke="#efe3c8" stroke-width="2" stroke-linecap="round"/>`,
  shield: (x, y) => `<path d="M${x - 9} ${y - 12} h18 v10 q0 12 -9 16 q-9 -4 -9 -16 z" fill="#8a8f99" stroke="#4a4d52" stroke-width="2"/><path d="M${x} ${y - 10} v22" stroke="#d4af37" stroke-width="2"/>`,
};

const HEADS = {
  none: () => '',
  hood: (y, o) => `<path d="M-13 ${y + 6} q-1 -22 13 -22 q14 0 13 22 q-4 -10 -13 -10 q-9 0 -13 10 z" fill="${o.cloth}" stroke="${shade(o.cloth, -0.4)}" stroke-width="1.5"/>`,
  bandana: (y) => `<path d="M-11 ${y - 4} q11 -12 22 0 z" fill="#b8432f"/><path d="M10 ${y - 4} l7 4 l-6 2 z" fill="#b8432f"/>`,
  tricorn: (y) => `<path d="M-17 ${y - 4} q17 -6 34 0 l-5 -8 q-12 -8 -24 0 z" fill="#1e1a22" stroke="#d4af37" stroke-width="1.5"/>`,
  ears: (y, o) => `<path d="M-9 ${y - 2} l-12 -7 l8 11 z M9 ${y - 2} l12 -7 l-8 11 z" fill="${o.skin}" stroke="${shade(o.skin, -0.35)}" stroke-width="1"/>`,
  roundears: (y, o) => `<circle cx="-9" cy="${y - 8}" r="4.5" fill="${o.skin}"/><circle cx="9" cy="${y - 8}" r="4.5" fill="${o.skin}"/>`,
  horns: (y) => `<path d="M-7 ${y - 7} q-6 -8 -2 -14 q1 7 6 10 z M7 ${y - 7} q6 -8 2 -14 q-1 7 -6 10 z" fill="#e8e2cf"/>`,
  helmet: (y, o) => `<path d="M-11 ${y + 1} q0 -15 11 -15 q11 0 11 15 z" fill="${o.metal}" stroke="${shade(o.metal, -0.4)}" stroke-width="1.5"/><path d="M-11 ${y - 1} h22" stroke="${shade(o.metal, -0.4)}" stroke-width="3"/><path d="M0 ${y - 14} v-6" stroke="#b8432f" stroke-width="4" stroke-linecap="round"/>`,
  witch: (y) => `<path d="M-16 ${y - 5} h32 l-3 -3 h-26 z" fill="#1e1a22"/><path d="M-9 ${y - 7} l10 -26 l2 4 l6 22 z" fill="#1e1a22"/>`,
};

const FACES = {
  plain: (y, o) => `<circle cx="-3.5" cy="${y}" r="1.8" fill="${o.eye}"/><circle cx="3.5" cy="${y}" r="1.8" fill="${o.eye}"/><path d="M-3 ${y + 5} q3 1.5 6 0" stroke="rgba(0,0,0,0.5)" stroke-width="1.4" fill="none"/>`,
  mean: (y, o) => `<path d="M-6 ${y - 3} l4 2 M6 ${y - 3} l-4 2" stroke="rgba(0,0,0,0.6)" stroke-width="1.6"/><circle cx="-3.5" cy="${y}" r="1.8" fill="${o.eye}"/><circle cx="3.5" cy="${y}" r="1.8" fill="${o.eye}"/><path d="M-3.5 ${y + 6} q3.5 -2 7 0" stroke="rgba(0,0,0,0.6)" stroke-width="1.4" fill="none"/>`,
  tusks: (y, o) => `${FACES.mean(y, o)}<path d="M-4 ${y + 7} l1 -4 l1.5 4 z M4 ${y + 7} l-1 -4 l-1.5 4 z" fill="#f4efe0"/>`,
  skull: (y) => `<ellipse cx="-3.8" cy="${y}" rx="2.8" ry="3.2" fill="#16122b"/><ellipse cx="3.8" cy="${y}" rx="2.8" ry="3.2" fill="#16122b"/><path d="M-1 ${y + 4} l1 -2 l1 2 z" fill="#16122b"/><path d="M-4 ${y + 7.5} h8 M-2 ${y + 6} v3 M0 ${y + 6} v3 M2 ${y + 6} v3" stroke="#16122b" stroke-width="1"/>`,
  glow: (y, o) => `<circle cx="-3.5" cy="${y}" r="2.4" fill="${o.eye}" class="dq-glow"/><circle cx="3.5" cy="${y}" r="2.4" fill="${o.eye}" class="dq-glow"/>`,
  snout: (y, o) => `<ellipse cx="0" cy="${y + 5}" rx="7" ry="4.5" fill="${shade(o.skin, 0.15)}"/><circle cx="-4" cy="${y - 2}" r="1.8" fill="${o.eye}"/><circle cx="4" cy="${y - 2}" r="1.8" fill="${o.eye}"/><circle cx="-2" cy="${y + 4}" r="0.9" fill="#16122b"/><circle cx="2" cy="${y + 4}" r="0.9" fill="#16122b"/>`,
  frog: (y, o) => `<circle cx="-6" cy="${y - 6}" r="4" fill="${o.skin}" stroke="${shade(o.skin, -0.3)}"/><circle cx="6" cy="${y - 6}" r="4" fill="${o.skin}" stroke="${shade(o.skin, -0.3)}"/><circle cx="-6" cy="${y - 6}" r="2" fill="#16122b"/><circle cx="6" cy="${y - 6}" r="2" fill="#16122b"/><path d="M-8 ${y + 3} q8 6 16 0" stroke="#16122b" stroke-width="1.5" fill="none"/>`,
  hag: (y, o) => `${FACES.mean(y, o)}<path d="M0 ${y} l5 5 l-5 0" fill="${shade(o.skin, -0.2)}"/>`,
};

/**
 * A two-legged figure. skin, cloth, pants; head: HEADS key; face: FACES key; weapon/offhand: WEAPONS keys;
 * bulk widens the body, s scales the whole figure, hunch leans it forward, rags tears the hem.
 */
const humanoid = (o) => {
  const b = o.bulk || 1;
  const w = 11 * b;
  const pants = o.pants || shade(o.cloth, -0.35);
  const line = shade(o.skin, -0.4);
  const bones = o.bones;
  let out = '';
  // Legs and feet.
  if (bones) {
    out += `<path d="M-5 -22 L-6 -2 M5 -22 L6 -2" stroke="${o.skin}" stroke-width="3.5" stroke-linecap="round"/><path d="M-9 -1 h6 M3 -1 h6" stroke="${o.skin}" stroke-width="3" stroke-linecap="round"/>`;
  } else {
    out += `<rect x="${f(-w * 0.6)}" y="-24" width="${f(w * 0.5)}" height="22" rx="2" fill="${pants}"/><rect x="${f(w * 0.1)}" y="-24" width="${f(w * 0.5)}" height="22" rx="2" fill="${pants}"/>`;
    out += `<ellipse cx="${f(-w * 0.35)}" cy="-1" rx="${f(w * 0.36)}" ry="3" fill="#2a1f18"/><ellipse cx="${f(w * 0.35)}" cy="-1" rx="${f(w * 0.36)}" ry="3" fill="#2a1f18"/>`;
  }
  // Body.
  if (bones) {
    out += `<path d="M0 -48 L0 -22" stroke="${o.skin}" stroke-width="3.5"/><path d="M-8 -44 q8 3 16 0 M-8 -38 q8 3 16 0 M-7 -32 q7 3 14 0" stroke="${o.skin}" stroke-width="2.5" fill="none"/><path d="M-7 -24 h14" stroke="${o.skin}" stroke-width="3.5" stroke-linecap="round"/>`;
  } else {
    const hem = o.rags ? `l${f(w * 0.3)} 5 l${f(w * 0.3)} -4 l${f(w * 0.4)} 5 l${f(w * 0.4)} -5 l${f(w * 0.3)} 4 l${f(w * 0.3)} -5` : `h${f(w * 2)}`;
    const robe = o.robe ? 6 : 0;
    out += `<path d="M${f(-w)} ${-20 + robe} L${f(-w * 0.85)} -46 Q0 -52 ${f(w * 0.85)} -46 L${f(w)} ${-20 + robe} Z" fill="${o.cloth}" stroke="${shade(o.cloth, -0.4)}" stroke-width="1.5"/>`;
    if (o.rags) out += `<path d="M${f(-w)} ${-20 + robe} ${hem}" stroke="${shade(o.cloth, -0.4)}" stroke-width="1.5" fill="${o.cloth}"/>`;
    out += `<path d="M${f(-w * 0.9)} -27 h${f(w * 1.8)}" stroke="${o.belt || '#3a2a1a'}" stroke-width="3"/>`;
    if (o.fur) out += `<path d="M${f(-w * 0.85)} -46 q${f(w * 0.85)} 8 ${f(w * 1.7)} 0 l-2 6 q${f(-w * 0.8)} 6 ${f(-w * 1.6)} 0 z" fill="${o.fur}"/>`;
  }
  // Arms.
  const reach = o.reach ? -8 : 0;
  const armL = `M${f(-w * 0.9)} -44 L${f(-w - 5)} ${-26 + reach}`;
  const armR = `M${f(w * 0.9)} -44 L${f(w + 5)} ${-26 + reach}`;
  out += `<path d="${armL} ${armR}" stroke="${bones ? o.skin : o.sleeve || o.cloth}" stroke-width="${bones ? 3.5 : 6 * Math.min(1.4, b)}" stroke-linecap="round"/>`;
  out += `<circle cx="${f(-w - 5)}" cy="${-26 + reach}" r="3.5" fill="${o.skin}"/><circle cx="${f(w + 5)}" cy="${-26 + reach}" r="3.5" fill="${o.skin}"/>`;
  out += (WEAPONS[o.offhand] || WEAPONS.none)(f(-w - 5), -26 + reach);
  // Head.
  const hy = -60;
  out += (HEADS[o.head] && o.head === 'ears') || o.head === 'roundears' ? HEADS[o.head](hy, o) : '';
  out += `<ellipse cx="0" cy="${hy}" rx="${o.headW || 10}" ry="${o.headH || 11}" fill="${o.skin}" stroke="${line}" stroke-width="1.5"/>`;
  out += (FACES[o.face || 'plain'])(hy + 1, o);
  if (o.beard) out += `<path d="M-8 ${hy + 4} q8 14 16 0 q-8 4 -16 0" fill="${o.beard}"/>`;
  if (o.head && o.head !== 'ears' && o.head !== 'roundears') out += HEADS[o.head](hy, o);
  out += (WEAPONS[o.weapon] || WEAPONS.none)(f(w + 5), -26 + reach);
  const s = o.s || 1;
  const lean = o.hunch ? ' rotate(8)' : '';
  return `<g transform="scale(${s})${lean}">${out}</g>`;
};

const wings = (color, span = 30, y = -44) => `<path d="M-6 ${y} q${-span} -22 ${-span - 6} 6 q${span * 0.4} -4 ${span * 0.6} 6 q-${span * 0.2} -10 ${span * 0.4} -6 z" fill="${color}" stroke="${shade(color, -0.4)}" stroke-width="1.5"/>`
  + `<path d="M6 ${y} q${span} -22 ${span + 6} 6 q-${span * 0.4} -4 -${span * 0.6} 6 q${span * 0.2} -10 -${span * 0.4} -6 z" fill="${color}" stroke="${shade(color, -0.4)}" stroke-width="1.5"/>`;

/** A four-legged animal facing left. head: 'wolf' | 'rat' | 'beak' | 'dragon'. */
const beast = (o) => {
  const c = o.color;
  const dark = shade(c, -0.35);
  const L = o.len || 26;
  let out = '';
  if (o.wings) out += `<g transform="translate(4 8)">${wings(o.wingColor || shade(c, -0.15), 26, -40)}</g>`;
  // Tail.
  out += o.head === 'rat'
    ? `<path d="M${L} -12 q16 4 18 -10" stroke="#d9a7a0" stroke-width="2.5" fill="none"/>`
    : `<path d="M${L - 2} -20 q14 -4 16 -18" stroke="${c}" stroke-width="${o.head === 'dragon' ? 7 : 6}" stroke-linecap="round" fill="none"/>`;
  // Legs.
  [-L + 6, -L + 13, L - 12, L - 5].forEach((x, i) => {
    out += `<rect x="${x - 3}" y="-14" width="6" height="14" rx="2" fill="${i % 2 ? dark : c}"/>`;
  });
  // Body.
  out += `<ellipse cx="0" cy="-20" rx="${L}" ry="${o.h || 12}" fill="${c}" stroke="${dark}" stroke-width="1.5"/>`;
  if (o.belly) out += `<ellipse cx="-2" cy="-14" rx="${L * 0.7}" ry="5" fill="${o.belly}"/>`;
  // Head.
  const hx = -L - 4;
  const hy = o.neck ? -44 : -28;
  if (o.neck) out += `<path d="M${-L + 6} -24 Q${hx} -30 ${hx + 2} ${hy + 6}" stroke="${c}" stroke-width="12" stroke-linecap="round" fill="none"/>`;
  if (o.head === 'wolf') {
    out += `<path d="M${hx + 6} ${hy - 6} l3 -12 l5 10 z M${hx + 13} ${hy - 6} l4 -11 l3 11 z" fill="${dark}"/>`;
    out += `<ellipse cx="${hx + 8}" cy="${hy}" rx="11" ry="9" fill="${c}" stroke="${dark}" stroke-width="1.5"/><path d="M${hx} ${hy - 2} l-12 5 l12 5 z" fill="${c}" stroke="${dark}" stroke-width="1.5"/><circle cx="${hx - 11}" cy="${hy + 3}" r="2" fill="#16122b"/>`;
    out += `<circle cx="${hx + 6}" cy="${hy - 2}" r="2" fill="#ffe066"/>`;
  } else if (o.head === 'rat') {
    out += `<circle cx="${hx + 9}" cy="${hy - 8}" r="5" fill="#d9a7a0" stroke="${dark}"/><ellipse cx="${hx + 6}" cy="${hy}" rx="10" ry="7" fill="${c}" stroke="${dark}" stroke-width="1.5"/><path d="M${hx - 2} ${hy - 3} l-10 4 l10 4 z" fill="${c}"/><circle cx="${hx - 12}" cy="${hy + 1}" r="2" fill="#d9a7a0"/><circle cx="${hx + 3}" cy="${hy - 2}" r="1.8" fill="#ff5a4f"/>`;
  } else if (o.head === 'beak') {
    out += `<circle cx="${hx + 6}" cy="${hy}" r="10" fill="#f4efe0" stroke="${dark}" stroke-width="1.5"/><path d="M${hx - 2} ${hy - 4} q-12 2 -10 10 q4 -4 10 -2 z" fill="#e7b94a" stroke="#7a5f1a"/><circle cx="${hx + 3}" cy="${hy - 3}" r="2" fill="#16122b"/>`;
  } else if (o.head === 'dragon') {
    out += `<path d="M${hx + 8} ${hy - 8} l6 -12 l1 12 z M${hx + 2} ${hy - 9} l2 -12 l4 11 z" fill="#efe3c8"/>`;
    out += `<ellipse cx="${hx + 4}" cy="${hy}" rx="12" ry="9" fill="${c}" stroke="${dark}" stroke-width="1.5"/><path d="M${hx - 4} ${hy - 4} l-14 4 l14 7 z" fill="${c}" stroke="${dark}" stroke-width="1.5"/><circle cx="${hx}" cy="${hy - 3}" r="2.2" fill="#ffe066" class="dq-glow"/>`;
    out += `<path d="M${hx - 18} ${hy + 1} q-8 -2 -12 4" stroke="#ff8a2a" stroke-width="3" fill="none" class="dq-flame"/>`;
  }
  if (o.spikes) out += `<path d="M${-L * 0.6} -31 l4 -8 l4 7 l4 -8 l4 7 l4 -8 l4 7" fill="${dark}"/>`;
  const s = o.s || 1;
  return `<g transform="scale(${s})">${out}</g>`;
};

const spider = (o) => {
  const c = o.color;
  let out = '';
  [-1, 1].forEach((side) => {
    [0, 1, 2, 3].forEach((i) => {
      const y = -16 + i * 3;
      out += `<path d="M${side * 6} ${y} q${side * 16} -16 ${side * (22 + i * 2)} ${12 - i}" stroke="${shade(c, 0.2)}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    });
  });
  out += `<ellipse cx="6" cy="-22" rx="16" ry="13" fill="${c}" stroke="#000" stroke-width="1.5"/><path d="M2 -28 l6 4 l-6 4 l6 4" stroke="#b8432f" stroke-width="2.5" fill="none"/>`;
  out += `<ellipse cx="-10" cy="-16" rx="9" ry="8" fill="${shade(c, 0.1)}" stroke="#000" stroke-width="1.5"/>`;
  [[-15, -18], [-11, -20], [-14, -14], [-10, -15]].forEach(([x, y]) => { out += `<circle cx="${x}" cy="${y}" r="1.6" fill="#ff5a4f" class="dq-glow"/>`; });
  out += `<path d="M-16 -10 l-2 5 M-12 -10 l1 5" stroke="#efe3c8" stroke-width="2"/>`;
  return out;
};

const mimic = () => `<g>${'<polygon points="-24,-4 0,8 24,-4 24,-26 0,-14 -24,-26" fill="#7a5228" stroke="#3a2716" stroke-width="2"/>'}`
  + '<path d="M-24 -26 L0 -14 L24 -26 L24 -32 L0 -44 L-24 -32 Z" fill="#b07a3a" stroke="#3a2716" stroke-width="2" transform="rotate(-14 -24 -26)"/>'
  + '<path d="M-22 -24 l4 6 l3 -5 l4 7 l3 -6 l4 7 l3 -6 l4 6 l3 -6 l4 6 l3 -5 l4 5" fill="#f4efe0" stroke="#3a2716" stroke-width="1"/>'
  + '<path d="M-6 -16 q8 18 20 6" stroke="#d1237a" stroke-width="6" stroke-linecap="round" fill="none"/>'
  + '<circle cx="-12" cy="-36" r="3" fill="#ffe066" class="dq-glow"/><circle cx="-2" cy="-40" r="3" fill="#ffe066" class="dq-glow"/></g>';

const ghostly = (svg) => `<g opacity="0.88">${svg}</g>`;

// ---- The bestiary ------------------------------------------------------------------------------------------------

const HUMAN = '#d39a6e';

const ART = {
  bandit: () => humanoid({ skin: HUMAN, cloth: '#8b5a2b', head: 'bandana', face: 'mean', eye: '#16122b', weapon: 'dagger', sleeve: '#6b4a2a' }),
  banditCaptain: () => humanoid({ skin: '#b0774b', cloth: '#6b1f2e', head: 'tricorn', face: 'mean', eye: '#16122b', weapon: 'sword', bulk: 1.15, s: 1.1, beard: '#2b1d16', belt: '#d4af37' }),
  drunk: () => humanoid({ skin: '#f1c7a5', cloth: '#b07a4c', face: 'plain', eye: '#16122b', weapon: 'mug', bulk: 1.2, beard: '#8b5a2b' }),
  thug: () => humanoid({ skin: '#8a5634', cloth: '#5a5f6a', face: 'mean', eye: '#16122b', weapon: 'club', bulk: 1.35, s: 1.08, sleeve: '#8a5634' }),
  cultist: () => humanoid({ skin: '#ebb998', cloth: '#5b2d8e', head: 'hood', face: 'glow', eye: '#ff5a4f', weapon: 'dagger', robe: true }),
  cultFanatic: () => humanoid({ skin: '#ebb998', cloth: '#3a1f5c', head: 'hood', face: 'glow', eye: '#c38bff', weapon: 'staff', robe: true, s: 1.12, belt: '#d4af37' }),
  goblin: () => humanoid({ skin: '#5f8f3a', cloth: '#6b4a2a', head: 'ears', face: 'mean', eye: '#ffe066', weapon: 'dagger', s: 0.8, headW: 11 }),
  goblinArcher: () => humanoid({ skin: '#6f9f4a', cloth: '#4a5a2e', head: 'ears', face: 'mean', eye: '#ffe066', offhand: 'bow', s: 0.8, headW: 11 }),
  kobold: () => humanoid({ skin: '#b2552f', cloth: '#5a3c20', head: 'horns', face: 'snout', eye: '#ffe066', weapon: 'spear', s: 0.75, rags: true }),
  orc: () => humanoid({ skin: '#4f7a3a', cloth: '#4a3c30', head: 'ears', face: 'tusks', eye: '#ff5a4f', weapon: 'axe', bulk: 1.25, s: 1.08, fur: '#7a6a55', sleeve: '#4f7a3a' }),
  bugbear: () => humanoid({ skin: '#a0723f', cloth: '#5a3c20', head: 'roundears', face: 'mean', eye: '#ffe066', weapon: 'club', bulk: 1.3, s: 1.18, fur: '#6b4a2a', sleeve: '#a0723f', hunch: true }),
  ogre: () => humanoid({ skin: '#a0794b', cloth: '#6b5a3a', face: 'tusks', eye: '#16122b', weapon: 'club', bulk: 1.6, s: 1.4, rags: true, sleeve: '#a0794b' }),
  skeleton: () => humanoid({ skin: '#e8e2cf', bones: true, face: 'skull', eye: '#16122b', weapon: 'sword', offhand: 'shield', cloth: '#e8e2cf' }),
  zombie: () => humanoid({ skin: '#7a9a5a', cloth: '#5a5f6a', face: 'mean', eye: '#e8e2cf', rags: true, reach: true, hunch: true, sleeve: '#7a9a5a' }),
  ghoul: () => humanoid({ skin: '#9aa38f', cloth: '#3e3326', face: 'mean', eye: '#ff5a4f', weapon: 'claws', offhand: 'claws', rags: true, hunch: true, sleeve: '#9aa38f' }),
  wight: () => ghostly(humanoid({ skin: '#8ea0c0', cloth: '#2a3348', head: 'hood', face: 'glow', eye: '#7ad7ff', weapon: 'sword', robe: true, rags: true, s: 1.15 })),
  lizardfolk: () => humanoid({ skin: '#3a6b3f', cloth: '#6b4a2a', face: 'snout', eye: '#ffe066', weapon: 'spear', offhand: 'shield', sleeve: '#3a6b3f' }),
  bullywug: () => humanoid({ skin: '#5f8f3a', cloth: '#4a3c24', face: 'frog', eye: '#16122b', weapon: 'spear', headW: 13, headH: 9, s: 0.9, sleeve: '#5f8f3a' }),
  hag: () => humanoid({ skin: '#3d6b2f', cloth: '#2a2233', head: 'witch', face: 'hag', eye: '#ffe066', weapon: 'staff', robe: true, rags: true, hunch: true, s: 1.12 }),
  armor: () => humanoid({ skin: '#9a9ca3', metal: '#9a9ca3', cloth: '#8a8f99', pants: '#6c7078', head: 'helmet', face: 'glow', eye: '#7ad7ff', weapon: 'sword', offhand: 'shield', bulk: 1.15, sleeve: '#9a9ca3', belt: '#55575d' }),
  harpy: () => `${wings('#a3794f', 30)}${humanoid({ skin: '#e8c39a', cloth: '#a3794f', face: 'mean', eye: '#ffe066', weapon: 'claws', offhand: 'claws', rags: true })}`,
  wolf: () => beast({ color: '#8a8f99', head: 'wolf', belly: '#c9ccd2' }),
  rat: () => beast({ color: '#7b6a5a', head: 'rat', len: 18, h: 9, s: 0.85 }),
  griffon: () => beast({ color: '#c9a24a', head: 'beak', wings: true, wingColor: '#a3794f', s: 1.2, belly: '#e7c97a' }),
  youngDragon: () => beast({ color: '#b8432f', head: 'dragon', wings: true, wingColor: '#8e2a1e', neck: true, spikes: true, belly: '#e7b94a', s: 1.25, len: 30, h: 14 }),
  spider: (o) => spider(o),
  mimic: () => mimic(),
};

/** SVG markup for a monster figure, feet at (0, 0). Unknown monsters fall back to their emoji. */
export const monsterMarkup = (id, color, glyph) => {
  const draw = ART[id];
  if (!draw) return `<text x="0" y="-12" font-size="38" text-anchor="middle">${glyph || '👹'}</text>`;
  return draw({ color });
};

export const hasMonsterArt = (id) => Boolean(ART[id]);

/** How tall a monster figure stands, for placing its health bar. */
export const monsterHeight = (id) => {
  const tall = { ogre: 104, youngDragon: 96, griffon: 72, banditCaptain: 84, cultFanatic: 86, wight: 88, bugbear: 86, hag: 86, orc: 82, thug: 82 };
  const short = { goblin: 58, goblinArcher: 58, kobold: 56, rat: 36, spider: 42, mimic: 50, wolf: 50, bullywug: 66 };
  return tall[id] || short[id] || 76;
};
