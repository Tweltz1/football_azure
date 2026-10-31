// Draws a party character as SVG markup, in the Hood League crew style: flat colors, thick ink
// outlines, round head, rosy cheeks and a big smile. A port of Hood Protocol's CartoonPerson
// (hood-protocol/App/Hangout/CartoonPerson.swift) plus Halloween costumes.
// Units match that art: feet at (0, 0), top of the head near y = -240.

import { CLOTHES, HAIR_COLORS, hex, PANTS_COLORS, SHOE_COLORS, SKINS } from './look.js';

export const INK = '#16122b';
const r1 = (v) => Math.round(v * 10) / 10;

const st = (fill, w = 5) => `fill="${fill}" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const rect = (x, y, w, h, r, fill, sw = 5) => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(r)}" ${st(fill, sw)}/>`;
const ell = (x, y, w, h, fill, sw = 5) => `<ellipse cx="${r1(x + w / 2)}" cy="${r1(y + h / 2)}" rx="${r1(w / 2)}" ry="${r1(h / 2)}" ${st(fill, sw)}/>`;
const path = (d, fill, sw = 5) => `<path d="${d}" ${st(fill, sw)}/>`;
const fRect = (x, y, w, h, r, fill, op = 1) => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(r)}" fill="${fill}"${op < 1 ? ` fill-opacity="${op}"` : ''}/>`;
const fEll = (x, y, w, h, fill, op = 1) => `<ellipse cx="${r1(x + w / 2)}" cy="${r1(y + h / 2)}" rx="${r1(w / 2)}" ry="${r1(h / 2)}" fill="${fill}"${op < 1 ? ` fill-opacity="${op}"` : ''}/>`;
const fPath = (d, fill, op = 1) => `<path d="${d}" fill="${fill}"${op < 1 ? ` fill-opacity="${op}"` : ''}/>`;
const sPath = (d, color, w, op = 1) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${op < 1 ? ` stroke-opacity="${op}"` : ''}/>`;
const sEll = (x, y, w, h, color, sw) => `<ellipse cx="${r1(x + w / 2)}" cy="${r1(y + h / 2)}" rx="${r1(w / 2)}" ry="${r1(h / 2)}" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
const text = (x, y, s, size, color) => `<text x="${x}" y="${y}" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="${size}" fill="${color}" text-anchor="middle" dominant-baseline="central">${s}</text>`;
const poly = (pts) => `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(' L')} Z`;
const g = (transform, inner, cls) => `<g${transform ? ` transform="${transform}"` : ''}${cls ? ` class="${cls}"` : ''}>${inner}</g>`;

const COSTUME_SKIN = { 6: '#8fc27a', 7: '#a3b98f' };

const hairShows = (look) => [0, 4, 6, 12, 19, 20].includes(look.hat);

/** Where each hand goes for a pose. */
const armTargets = (pose) => {
  const k = pose.k || 0;
  switch (pose.kind) {
    case 'walk': return [[-44 - 6 * Math.sin(k), -72], [44 + 6 * Math.sin(k), -72]];
    case 'cheer': return [[-58, -214], [58, -214]];
    case 'wave': return [[-44, -70], [66, -196]];
    case 'scared': return [[-24, -170], [24, -170]];
    case 'throw': {
      const windUp = k < 0.3 ? Math.sin((k / 0.3) * Math.PI / 2) : 1;
      const release = k < 0.3 ? 0 : Math.sin(Math.min(1, (k - 0.3) / 0.4) * Math.PI / 2);
      const back = k > 0.75 ? (k - 0.75) / 0.25 : 0;
      // Throwing to the left (the monsters come from the left of the TV)
      const x = 40 + 10 * windUp + 26 * release - 30 * back;
      const y = -90 - 60 * windUp - 40 * release + 100 * back;
      return [[-x, y], [44, -70]];
    }
    default: return [[-44, -70], [44, -70]];
  }
};

const arm = (shoulder, reach, side, sleeve, skin) => {
  const dx = reach[0] - shoulder[0];
  const dy = reach[1] - shoulder[1];
  const len = Math.hypot(dx, dy);
  const max = 82;
  const hand = len > max ? [shoulder[0] + (dx / len) * max, shoulder[1] + (dy / len) * max] : reach;
  const c = [(shoulder[0] + hand[0]) / 2 + side * 14, (shoulder[1] + hand[1]) / 2];
  const d = `M${r1(shoulder[0])} ${r1(shoulder[1])} Q${r1(c[0])} ${r1(c[1])} ${r1(hand[0])} ${r1(hand[1])}`;
  return sPath(d, INK, 24) + sPath(d, sleeve, 15) + ell(hand[0] - 10, hand[1] - 6, 20, 20, skin);
};

const classicHat = (hat, color) => {
  const top = hat === 3 ? -252 : -240;
  let out = path(`M-45 -196 Q-46 ${top} 0 ${top} Q46 ${top} 45 -196 Z`, color);
  if (hat === 3) {
    out += rect(-48, -206, 96, 18, 8, color) + ell(-9, -266, 18, 18, color);
  } else {
    out += ell(-5, -245, 10, 10, color);
    if (hat === 1) {
      out += path('M-50 -196 Q0 -212 50 -196 Q52 -186 40 -184 Q0 -194 -40 -184 Q-52 -186 -50 -196 Z', color);
    } else {
      out += rect(-14, -204, 28, 10, 4, '#e9e3d0', 3);
    }
  }
  return out;
};

const fancyHat = (hat, color) => {
  switch (hat) {
    case 4: return path(poly([[-26, -218], [26, -218], [4, -300]]), color)
      + [[-8, -236], [10, -248], [2, -270], [-14, -226], [14, -228]].map(([x, y]) => fEll(x - 3, y - 3, 6, 6, '#fff')).join('')
      + ell(-5, -310, 18, 18, '#fff', 3);
    case 5: return ell(-82, -214, 164, 28, color)
      + path('M-38 -204 L-34 -252 Q-18 -266 0 -248 Q18 -266 34 -252 L38 -204 Z', color)
      + fRect(-37, -218, 74, 9, 0, INK, 0.75);
    case 6: return path(poly([[-38, -212], [-40, -250], [-20, -230], [0, -260], [20, -230], [40, -250], [38, -212]]), '#f5c542')
      + [[-22, '#2f80ed'], [0, '#e0302e'], [22, '#3ddc97']].map(([x, c]) => ell(x - 5, -228, 10, 10, c, 2)).join('');
    case 7: {
      const cone = poly([[-40, -206], [40, -206], [7, -318], [-7, -318]]);
      return path(cone, '#ff7a1a') + fPath('M-36 -292 L36 -292 L33 -276 L-33 -276 Z M-24 -252 L24 -252 L28 -236 L-28 -236 Z', '#fff')
        + sPath(cone, INK, 5) + rect(-58, -212, 116, 14, 4, '#ff7a1a');
    }
    case 8: return [-1, 1].map((s) => path(`M${38 * s} -214 Q${80 * s} -226 ${70 * s} -270 Q${60 * s} -236 ${44 * s} -228 Z`, '#f4ebd0', 4)).join('')
      + path('M-46 -204 Q0 -280 46 -204 Z', '#b8bec8') + rect(-48, -214, 96, 14, 4, '#b07a4c', 4)
      + [-30, -10, 10, 30].map((x) => fEll(x - 2.5, -210, 5, 5, '#f5c542')).join('');
    case 9: return classicHat(1, color) + fRect(-2.5, -262, 5, 20, 0, INK)
      + ell(-30, -268, 30, 9, '#e0302e', 2.5) + ell(0, -268, 30, 9, '#2f80ed', 2.5);
    case 10: return [[-24, -246, 19], [24, -246, 19], [0, -262, 24]].map(([x, y, r]) => ell(x - r, y - r, 2 * r, 2 * r, '#fff', 4)).join('')
      + rect(-40, -232, 80, 28, 6, '#fff', 4);
    case 11: return path(poly([[-46, -204], [-38, -230], [-28, -244], [-20, -262], [-8, -270], [0, -296], [8, -272], [20, -262], [30, -242], [38, -228], [46, -204]]), '#d3d8df', 4)
      + sPath('M-18 -222 L-4 -262 M14 -218 L22 -244', '#fff', 3);
    case 12: return sEll(-34, -284, 68, 16, INK, 10) + sEll(-34, -284, 68, 16, '#ffe38a', 5);
    case 14: return ell(-58, -214, 116, 20, color) + rect(-34, -300, 68, 94, 6, color) + fRect(-32, -230, 64, 12, 0, '#d33b3b');
    case 15: return path('M-36 -212 Q-8 -280 26 -330 Q18 -270 36 -212 Z', color) + ell(-62, -222, 124, 22, color)
      + [[-6, -250], [10, -278], [-2, -232]].map(([x, y]) => text(x, y, '★', 14, '#ffe38a')).join('');
    case 16: return path('M-66 -214 Q-40 -272 0 -270 Q40 -272 66 -214 Q0 -196 -66 -214 Z', '#1e1e24')
      + ell(-9, -250, 18, 16, '#fff', 2.5) + fEll(-5, -246, 4, 4, INK) + fEll(1, -246, 4, 4, INK);
    case 17: return path('M-38 -210 L-30 -252 Q0 -266 30 -252 L38 -210 Z', color)
      + path('M-38 -214 L38 -214 L56 -194 Q0 -186 -56 -194 Z', color);
    case 18: return g('rotate(-8)', ell(-52, -252, 100, 40, color) + fRect(-2, -262, 4, 12, 0, INK));
    case 19: return [-1, 1].map((s) => g(`translate(${22 * s} -226) rotate(${12 * s})`,
      ell(-12, -74, 24, 76, '#fff') + fEll(-6, -64, 12, 56, '#ffb6c8'))).join('');
    case 20: return [-1, 1].map((s) => path(`M${16 * s} -226 Q${16 * s} -250 ${34 * s} -262 Q${40 * s} -240 ${34 * s} -222 Z`, '#d33b3b', 3.5)).join('');
    case 21: return classicHat(3, '#1e1e24') + path('M-62 -244 L0 -266 L62 -244 L0 -224 Z', '#1e1e24')
      + sPath('M0 -246 L40 -238 L44 -206', '#f5c542', 4);
    case 22: return path('M30 -210 Q64 -180 52 -140 L40 -140 Q46 -180 22 -206', color, 4)
      + path('M-46 -196 Q0 -262 46 -196 Q0 -210 -46 -196', color) + fRect(-2, -240, 4, 34, 0, INK, 0.3);
    case 23: return path('M-46 -200 Q0 -266 46 -200 Q0 -214 -46 -200', color)
      + [[-20, -226], [8, -236], [24, -218], [-4, -214]].map(([x, y]) => fEll(x - 3, y - 3, 6, 6, '#fff', 0.8)).join('')
      + ell(40, -214, 16, 14, color, 3)
      + [20, 60].map((a) => g(`translate(50 -206) rotate(${a})`, rect(0, -5, 22, 10, 4, color, 3))).join('');
    default: return '';
  }
};

const witchHat = (band) => path('M-70 -206 Q0 -226 70 -206 Q74 -194 0 -192 Q-74 -194 -70 -206 Z', '#2a1f3d')
  + path('M-36 -208 Q-20 -270 14 -300 Q40 -312 46 -290 Q22 -292 20 -270 Q24 -236 36 -208 Z', '#2a1f3d')
  + fRect(-34, -226, 68, 12, 0, band) + rect(-8, -229, 16, 18, 3, '#f5c542', 3);

const pumpkinHead = () => {
  let out = fRect(-4, -262, 8, 22, 3, '#3a5a2c') + sPath('M0 -258 Q10 -268 14 -256', '#3a5a2c', 4);
  out += ell(-58, -246, 52, 96, '#f07f1d') + ell(6, -246, 52, 96, '#f07f1d') + ell(-34, -248, 68, 100, '#ff9a2e');
  out += path('M-30 -206 L-12 -206 L-21 -190 Z M12 -206 L30 -206 L21 -190 Z', '#ffd84a', 3.5);
  out += path('M-8 -186 L0 -176 L8 -186 Z', '#ffd84a', 3);
  out += path('M-32 -172 Q0 -150 32 -172 L26 -160 L18 -166 L12 -154 L4 -162 L-4 -154 L-12 -162 L-18 -154 L-26 -164 Z', '#ffd84a', 3.5);
  return out;
};

const head = (look, skin, shirt, face) => {
  const hair = hex(HAIR_COLORS[look.hairColor] ?? 0);
  const hatColor = hex(CLOTHES[look.hatColor] ?? 0);
  const costume = look.costume || 0;
  const witch = costume === 5;
  const shows = witch || hairShows(look);
  let out = '';
  if (costume === 1) {
    // Vampire collar standing up behind the head
    out += path('M-44 -142 L-70 -214 L-30 -178 Z M44 -142 L70 -214 L30 -178 Z', '#1a1020', 4)
      + fPath('M-44 -146 L-62 -200 L-34 -176 Z M44 -146 L62 -200 L34 -176 Z', '#b3122e');
  }
  if (look.top === 1) out += ell(-52, -238, 104, 104, shirt);
  if (shows || look.hair === 4 || [8, 10, 11].includes(look.hair)) {
    switch (look.hair) {
      case 4: out += rect(-54, -232, 108, 116, 44, hair); break;
      case 3: if (shows) out += ell(-66, -262, 132, 124, hair); break;
      case 8: out += rect(-42, -206, 84, 66, 18, hair); break;
      case 10: out += [-1, 1].map((s) => ell(58 * s - 17, -214, 34, 40, hair)).join(''); break;
      case 11: for (let x = -48; x <= 48; x += 12) out += rect(x - 6, -222, 12, 82 - Math.abs(x) * 0.3, 6, hair, 3); break;
      default: break;
    }
  }
  // Ears and face
  out += ell(-52, -192, 20, 20, skin) + ell(32, -192, 20, 20, skin) + ell(-44, -230, 88, 88, skin);
  if (look.facial === 1) {
    out += fPath('M-38 -172 Q-30 -136 0 -134 Q30 -136 38 -172 Q20 -150 0 -152 Q-20 -150 -38 -172 Z', '#8a5a3c', 0.55);
  }
  if (shows) {
    switch (look.hair) {
      case 0: case 1: case 4: case 5: case 8: case 10: case 11: {
        const top = look.hair === 0 ? -232 : -236;
        out += path(`M-44 -186 Q-48 -236 0 ${top} Q46 -234 44 -190 Q30 -206 6 -206 Q-20 -214 -44 -186 Z`, hair);
        if (look.hair === 5) out += ell(-16, -262, 32, 32, hair);
        break;
      }
      case 2: for (let x = -36; x <= 36; x += 18) out += ell(x - 14, -240 + Math.abs(x) * 0.35, 28, 28, hair, 4); break;
      case 7: out += path('M-10 -222 L-10 -262 L-5 -246 L0 -276 L5 -252 L10 -270 L12 -222 Z', hair, 4); break;
      case 9: {
        let d = 'M-46 -192';
        [-40, -24, -8, 8, 24, 40].forEach((x, i) => { d += ` L${x} ${r1(-252 + (i % 2 ? 14 : 0) + Math.abs(x) * 0.3)} L${x + 8} -222`; });
        out += path(`${d} L46 -192 Q0 -222 -46 -192 Z`, hair, 4);
        break;
      }
      default: break;
    }
  }
  if (costume === 6 && (look.hat === 0 || witch)) {
    out += rect(-44, -240, 88, 34, 6, '#1c1410');
  }
  if (look.extra === 4 && shows) out += rect(-45, -216, 90, 13, 5, shirt, 3.5);
  if (witch) out += witchHat(hatColor);
  else if (look.hat >= 1 && look.hat <= 3) out += classicHat(look.hat, hatColor);
  else if (look.hat > 3) out += fancyHat(look.hat, hatColor);
  if (costume === 9) {
    out += [-1, 1].map((s) => path(`M${14 * s} -224 L${44 * s} -258 L${46 * s} -206 Z`, '#1a1a1f', 4) + fPath(`M${22 * s} -222 L${40 * s} -244 L${40 * s} -214 Z`, '#ff9ab8')).join('');
  }

  // Eyes (blink handled by CSS on the .lc-eyes group)
  if (costume === 7) out += fEll(-27, -198, 24, 26, '#4a3a5a', 0.5) + fEll(3, -198, 24, 26, '#4a3a5a', 0.5);
  if (look.shades) {
    out += rect(-30, -194, 24, 16, 6, '#111') + rect(6, -194, 24, 16, 6, '#111');
  } else if (face === 'scared') {
    out += g('', ell(-22, -195, 14, 18, '#fff', 3) + ell(8, -195, 14, 18, '#fff', 3) + fEll(-18, -189, 6, 7, INK) + fEll(12, -189, 6, 7, INK), 'lc-eyes');
  } else {
    out += g('', fEll(-20, -191, 10, 14, INK) + fEll(10, -191, 10, 14, INK) + fEll(-16, -189, 4, 4, '#fff') + fEll(14, -189, 4, 4, '#fff'), 'lc-eyes');
  }
  if (look.glasses && !look.shades) out += sEll(-27, -196, 24, 24, INK, 3) + sEll(3, -196, 24, 24, INK, 3);
  out += fEll(-33, -175, 14, 14, '#ff7f8f', 0.45) + fEll(19, -175, 14, 14, '#ff7f8f', 0.45);
  if (look.facial === 2) out += path('M-16 -166 Q-8 -172 0 -166 Q8 -172 16 -166 Q8 -160 0 -164 Q-8 -160 -16 -166 Z', '#3a2418', 2);
  if (face === 'scared') {
    out += ell(-9, -166, 18, 18, '#5a2030', 4);
  } else {
    out += path('M-15 -160 Q0 -144 15 -160 Z', '#fff', 4);
    if (look.extra === 1) out += fRect(-11, -159, 22, 5, 2, '#f5c542');
  }
  if (costume === 1 && face !== 'scared') {
    out += [-9, 9].map((x) => path(`M${x - 3} -160 L${x + 3} -160 L${x} -151 Z`, '#fff', 1.5)).join('');
  }
  switch (look.extra) {
    case 2: out += ell(-9, -182, 18, 18, '#e0302e', 3) + fEll(-4, -178, 5, 5, '#fff', 0.7); break;
    case 3: out += fRect(-26, -176, 16, 5, 2, INK) + fRect(10, -176, 16, 5, 2, INK); break;
    case 5: out += path('M-44 -174 L-38 -167 L-44 -158 L-50 -167 Z', '#bdf4ff', 2); break;
    case 6: out += sEll(2, -198, 26, 26, '#f5c542', 3.5) + sPath('M27 -180 Q40 -164 34 -142', '#f5c542', 1.5); break;
    case 7: out += sPath('M-44 -206 L44 -176', INK, 3) + ell(-27, -196, 22, 20, '#1e1e24', 2.5); break;
    case 8: out += text(22, -170, '★', 12, '#2b2b3a'); break;
    case 9: out += [[-30, -172], [-24, -166], [-34, -165], [24, -172], [30, -166], [20, -165], [-6, -176], [6, -176]].map(([x, y]) => fEll(x - 1.6, y - 1.6, 3.2, 3.2, '#9a5a3a', 0.8)).join(''); break;
    case 10: if (face !== 'scared' && costume !== 1) out += [-9, 9].map((x) => path(`M${x - 3} -160 L${x + 3} -160 L${x} -152 Z`, '#fff', 1.5)).join(''); break;
    case 11: out += sEll(1, -170, 7, 7, '#f5c542', 2); break;
    case 12: out += ell(-10, -166, 20, 20, '#ff8bd0', 2); break;
    case 13: out += text(-24, -166, '♥', 12, '#d33b3b'); break;
    default: break;
  }
  // Costume face details
  if (costume === 6) {
    out += sPath('M-18 -220 L18 -220 M-12 -224 L-12 -216 M0 -224 L0 -216 M12 -224 L12 -216', INK, 3);
    out += [-1, 1].map((s) => rect(44 * s - 9, -152, 18, 12, 3, '#a8adb6', 3)).join('');
  }
  if (costume === 7) out += sPath('M20 -170 L34 -160 M24 -172 L22 -164 M30 -168 L28 -160', INK, 2.5);
  if (costume === 9) {
    out += path('M-6 -176 L6 -176 L0 -169 Z', '#ff9ab8', 2) + sPath('M-14 -168 L-44 -174 M-14 -164 L-44 -162 M14 -168 L44 -174 M14 -164 L44 -162', INK, 2);
  }
  return out;
};

/**
 * The SVG markup (no <svg> wrapper) for a look. pose: { kind: 'stand'|'walk'|'wave'|'cheer'|'throw'|'scared', k }.
 * Feet at (0, 0).
 */
export const personMarkup = (look, pose = { kind: 'stand' }) => {
  const costume = look.costume || 0;
  const skin = COSTUME_SKIN[costume] || hex(SKINS[look.skin] ?? SKINS[2]);
  let shirt;
  if ([7, 9, 14].includes(look.top)) shirt = '#f4f1ea';
  else if (look.top === 16) shirt = '#1e1e24';
  else shirt = hex(CLOTHES[look.topColor] ?? 0);
  let pants = hex(PANTS_COLORS[look.pants] ?? 0);
  const shoe = hex(SHOE_COLORS[look.shoes] ?? 0);
  const skeleton = costume === 2;
  const top = skeleton ? 0 : look.top;
  if (skeleton) { shirt = '#1b1b22'; pants = '#1b1b22'; }
  const shorts = skeleton ? false : look.shorts;
  let sleeve = [3, 4, 7, 12].includes(top) ? skin : top === 6 ? '#15151a' : top === 13 ? '#f4f1ea' : shirt;
  if (skeleton) sleeve = '#1b1b22';

  let lift = 0;
  let swing = 0;
  if (pose.kind === 'walk') { swing = Math.sin(pose.k || 0); lift = Math.abs(Math.sin(pose.k || 0)) * 6; }
  if (pose.kind === 'cheer') lift = 8;

  let out = fEll(-56, -10, 112, 22, '#000', 0.22);
  let body = '';

  if (top === 15) body += path('M-36 -140 L36 -140 Q58 -90 54 -30 Q0 -18 -54 -30 Q-58 -90 -36 -140 Z', '#d33b3b');
  if (costume === 1) {
    body += path('M-40 -142 L40 -142 Q70 -80 64 -14 Q0 -2 -64 -14 Q-70 -80 -40 -142 Z', '#1a1020')
      + fPath('M-30 -136 L30 -136 Q52 -80 48 -22 Q0 -12 -48 -22 Q-52 -80 -30 -136 Z', '#b3122e');
  }

  // Legs
  [-18, 18].forEach((lx, index) => {
    const angle = (index === 0 ? 1 : -1) * swing * 0.35 * (180 / Math.PI);
    let leg = '';
    if (top === 4) {
      leg += rect(lx - 12, -70, 24, 62, 11, skin) + rect(lx - 12, -24, 24, 16, 4, '#fff');
    } else if (shorts) {
      leg += rect(lx - 12, -50, 24, 42, 11, skin) + rect(lx - 16, -74, 32, 38, 9, pants);
    } else {
      leg += rect(lx - 14, -74, 28, 68, 12, pants);
    }
    if (skeleton) leg += sPath(`M${lx} -66 L${lx} -44 M${lx} -36 L${lx} -14`, '#f2efe6', 5) + fEll(lx - 5, -44, 10, 8, '#f2efe6');
    leg += ell(lx + (lx > 0 ? 3 : -3) - 21, -17, 42, 20, shoe);
    body += angle ? g(`rotate(${r1(angle)} ${lx} -74)`, leg) : leg;
  });

  // Torso
  if (top === 4) {
    body += path('M-30 -140 L30 -140 L44 -58 Q0 -50 -44 -58 Z', shirt);
    body += [[-18, -120], [10, -110], [-6, -92], [22, -80], [-26, -74], [4, -70], [-14, -100], [26, -128]].map(([x, y]) => fEll(x - 3, y - 3, 6, 6, '#ffd1ea')).join('');
  } else {
    body += rect(-38, -142, 76, 80, 20, shirt);
    switch (top) {
      case 1: body += sPath('M-8 -136 L-10 -112 M8 -136 L10 -112', '#eee', 3) + rect(-24, -96, 48, 22, 8, shirt, 3); break;
      case 2: {
        const packers = CLOTHES[look.topColor] === 0x203731;
        body += path('M-14 -142 L0 -130 L14 -142', packers ? '#ffb612' : '#f3c33b', 3) + text(0, -100, packers ? '12' : '17', 38, packers ? '#ffb612' : '#fff');
        break;
      }
      case 3: case 12: {
        const d = 'M-38 -128 Q-24 -126 -22 -142 M38 -128 Q24 -126 22 -142';
        body += fPath(d, skin) + sPath(d, INK, 4);
        if (top === 12) body += text(0, -100, '00', 32, '#fff');
        break;
      }
      case 5: [[-22, -124], [14, -116], [-8, -96], [24, -86], [-26, -80], [4, -132]].forEach(([fx, fy]) => {
        for (let p = 0; p < 5; p += 1) {
          const a = (p / 5) * 2 * Math.PI;
          body += fEll(fx + 5 * Math.cos(a) - 3.5, fy + 5 * Math.sin(a) - 3.5, 7, 7, p % 2 === 0 ? '#fff1a8' : '#fff');
        }
        body += fEll(fx - 2.5, fy - 2.5, 5, 5, '#ff6b6b');
      }); break;
      case 6: body += path('M-14 -142 L14 -142 L0 -84 Z', '#fff', 3) + fEll(-2.5, -114, 5, 5, INK) + fEll(-2.5, -100, 5, 5, INK)
        + path('M0 -134 L-13 -141 L-13 -127 Z M0 -134 L13 -141 L13 -127 Z', '#d33b3b', 2.5); break;
      case 7: body += fEll(14, -146, 30, 22, skin) + path('M-38 -136 L14 -142 L38 -70 L10 -64 Z', '#e6e0d2', 3)
        + [0, 1, 2, 3].map((k) => fEll(-30 + k * 9, -128 + k * 9, 9, 5, '#c9a227')).join(''); break;
      case 8: body += rect(-32, -124, 24, 28, 4, '#fff', 3) + text(-20, -110, 'H', 22, shirt) + sPath('M-36 -70 L36 -70 M-36 -64 L36 -64', '#fff', 3); break;
      case 9: for (let x = -30; x <= 30; x += 15) body += fRect(x - 3.5, -140, 7, 76, 0, '#15151a');
        body += rect(10, -112, 14, 8, 3, '#c0c4cc', 2); break;
      case 10: {
        let plaid = '';
        for (let x = -28; x <= 28; x += 14) plaid += fRect(x - 2.5, -140, 5, 76, 0, INK, 0.28);
        for (let y = -132; y <= -70; y += 14) plaid += fRect(-36, y - 2.5, 72, 5, 0, INK, 0.28);
        body += plaid + sPath('M-16 -142 L0 -126 L16 -142', INK, 3);
        break;
      }
      case 11: for (let y = -126; y <= -74; y += 13) body += sPath(`M-36 ${y} Q0 ${y + 5} 36 ${y}`, INK, 2.5, 0.45);
        body += fRect(-2, -142, 4, 80, 0, INK, 0.5); break;
      case 13: body += fRect(-36, -140, 72, 76, 18, '#f4f1ea') + rect(-24, -116, 48, 54, 6, shirt, 3.5)
        + [-20, 20].map((x) => sPath(`M${x} -116 L${x * 1.4} -142`, shirt, 8) + fEll(x - 4, -116, 8, 8, '#f5c542')).join(''); break;
      case 14: body += sPath('M-16 -142 L-2 -96 L-2 -64 M16 -142 L2 -96 L2 -64', INK, 3, 0.6) + rect(12, -122, 16, 12, 2, '#fff', 2) + fRect(16, -128, 3, 10, 0, '#2f80ed'); break;
      case 15: body += ell(-16, -126, 32, 28, '#f5c542', 3) + text(0, -112, 'H', 18, '#d33b3b'); break;
      case 16: body += sPath('M-6 -140 L10 -64', '#c0c4cc', 3) + path('M-34 -138 L-14 -144 L-22 -118 Z M34 -138 L14 -144 L22 -118 Z', '#2c2c34', 3); break;
      case 17: body += sPath('M-16 -142 L8 -84 M16 -142 L-4 -100', '#fff', 6) + rect(-38, -92, 76, 9, 4, shirt, 2.5) + sPath('M14 -86 L8 -66 M18 -86 L24 -68', INK, 5); break;
      default: break;
    }
    if (skeleton) {
      body += sPath('M0 -136 L0 -70', '#f2efe6', 6);
      for (let y = -128; y <= -96; y += 11) body += sPath(`M-26 ${y + 4} Q-14 ${y - 4} -4 ${y} M26 ${y + 4} Q14 ${y - 4} 4 ${y}`, '#f2efe6', 5);
      body += fEll(-14, -82, 28, 12, '#f2efe6');
    }
    if (costume === 7) body += sPath('M-38 -66 L-30 -74 L-22 -64 L-12 -76 L-2 -64 L8 -74 L18 -64 L28 -74 L38 -66', INK, 3);
    if (look.chain && !skeleton) body += sPath('M-16 -142 Q0 -112 16 -142', '#f5c542', 5);
  }

  // Arms
  const [left, right] = armTargets(pose);
  const armSkin = skeleton ? '#f2efe6' : skin;
  if (pose.kind === 'wave') {
    body += arm([-36, -128], left, -1, sleeve, armSkin);
    body += g('', arm([36, -128], right, 1, sleeve, armSkin), 'lc-wave');
  } else {
    const arms = arm([-36, -128], left, -1, sleeve, armSkin) + arm([36, -128], right, 1, sleeve, armSkin);
    body += pose.kind === 'cheer' ? g('', arms, 'lc-cheer') : arms;
  }
  if (pose.kind === 'throw' && (pose.k || 0) < 0.32) {
    body += ell(left[0] - 8, left[1] - 18, 16, 16, '#c79bff', 2.5);
  }

  const face = pose.kind === 'scared' ? 'scared' : 'smile';
  body += costume === 3 ? pumpkinHead() : head(look, skin, shirt, face);

  if (costume === 8) {
    // Mummy wraps over everything, then the eyes peek out again
    let wraps = '';
    [[-40, -136, -8], [-40, -116, 6], [-40, -96, -5], [-40, -78, 7]].forEach(([x, y, a]) => { wraps += g(`rotate(${a} 0 ${y})`, rect(x, y - 6, 80, 13, 4, '#efe6cf', 3)); });
    [[-224, 5], [-208, -6], [-176, 4], [-160, -5]].forEach(([y, a]) => { wraps += g(`rotate(${a} 0 ${y})`, rect(-44, y - 6, 88, 13, 5, '#efe6cf', 3)); });
    [-18, 18].forEach((lx) => { [-60, -40, -24].forEach((y, i) => { wraps += g(`rotate(${i % 2 ? 8 : -8} ${lx} ${y})`, rect(lx - 15, y - 5, 30, 10, 4, '#efe6cf', 2.5)); }); });
    wraps += rect(-30, -197, 60, 16, 6, '#3a2a20', 2.5) + g('', fEll(-20, -194, 10, 10, '#fff') + fEll(10, -194, 10, 10, '#fff') + fEll(-17, -191, 5, 5, INK) + fEll(13, -191, 5, 5, INK), 'lc-eyes');
    body += wraps;
  }
  if (costume === 4) {
    // A ghost sheet over the whole person, feet poking out
    body += path('M-56 -40 Q-62 -150 -50 -200 Q-36 -258 0 -258 Q36 -258 50 -200 Q62 -150 56 -40 Q44 -28 34 -40 Q22 -28 12 -40 Q0 -28 -12 -40 Q-22 -28 -34 -40 Q-44 -28 -56 -40 Z', '#f7f7fb');
    body += g('', fEll(-24, -206, 16, 22, INK) + fEll(8, -206, 16, 22, INK), 'lc-eyes') + fEll(-8, -176, 16, 18, INK, 0.85);
  }

  out += lift ? g(`translate(0 ${-lift})`, body) : body;
  return out;
};

/** A whole <svg> for a look. view: 'full' (whole body) or 'head' (head and shoulders). */
export const personSvg = (look, pose, view = 'full') => {
  const box = view === 'head' ? '-80 -290 160 170' : '-95 -340 190 360';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${personMarkup(look, pose)}</svg>`;
};
