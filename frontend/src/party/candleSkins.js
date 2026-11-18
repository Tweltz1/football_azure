// Holiday versions of Last Candle. The game logic keeps its slot ids (monster kinds ghost, bat, skeleton,
// zombie, spider, witch, king and charms garlic, salt, bell, candy, crystal, bone, herb, star); a skin only
// renames and redraws them for the theme on now (see season.js). Halloween has no skin: it is the original.
// Critters stand with feet at (0, 0), about 150 units tall; ghost and bat slots float, bat flaps (lc-flap-*).
// Charm art fits a 100 x 100 box centered on 0,0.

import { season } from './season.js';
import { dot, ell, eyes, line, path, shadow } from './inkArt.js';
import { INK } from './cartoon.js';

const legs = (color = '#f5a623', y = -40) => line(`M-12 ${y} L-14 -4 M12 ${y} L14 -4`, INK, 11) + line(`M-12 ${y} L-14 -4 M12 ${y} L14 -4`, color, 5)
  + line('M-24 -4 L-4 -4 M4 -4 L24 -4', INK, 6);
const smirk = (y, w = 12) => line(`M${-w} ${y} Q0 ${y + 10} ${w} ${y - 4}`, INK, 4);
const arms = (y, color, spread = 50) => line(`M-24 ${y} Q-40 ${y + 14} -${spread} ${y - 6} M24 ${y} Q40 ${y + 14} ${spread} ${y - 6}`, INK, 16)
  + line(`M-24 ${y} Q-40 ${y + 14} -${spread} ${y - 6} M24 ${y} Q40 ${y + 14} ${spread} ${y - 6}`, color, 9);
const wings = (color, y = -96) => `<g class="lc-flap-l">${path(`M-16 ${y} Q-56 ${y - 36} -90 ${y - 12} Q-70 ${y + 4} -58 ${y + 14} Q-40 ${y + 2} -18 ${y + 16} Z`, color)}</g>`
  + `<g class="lc-flap-r">${path(`M16 ${y} Q56 ${y - 36} 90 ${y - 12} Q70 ${y + 4} 58 ${y + 14} Q40 ${y + 2} 18 ${y + 16} Z`, color)}</g>`;
const star5 = (cx, cy, r, fill, w = 4) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`;
  });
  return path(`M${pts.join(' L')} Z`, fill, w);
};
const heartPath = (cx, cy, s) => `M${cx} ${cy + 26 * s} C${cx - 44 * s} ${cy - 2 * s} ${cx - 26 * s} ${cy - 40 * s} ${cx} ${cy - 16 * s} C${cx + 26 * s} ${cy - 40 * s} ${cx + 44 * s} ${cy - 2 * s} ${cx} ${cy + 26 * s} Z`;

// ---------- Thanksgiving ----------
const turkey = (big = false) => shadow(40)
  + [-60, -30, 0, 30, 60].map((a, i) => `<g transform="rotate(${a} 0 -80)">${ell(0, -138, 16, 46, ['#d33b3b', '#f07f1d', '#f5c542', '#f07f1d', '#d33b3b'][i])}</g>`).join('')
  + legs()
  + ell(0, -72, 40, 38, '#8b5a2b')
  + path('M-20 -84 Q-8 -64 -24 -50 M20 -84 Q8 -64 24 -50', '#6b4226', 4)
  + ell(0, -124, 20, 22, '#9c6a3c')
  + eyes(-130, 8, 4.5)
  + path('M-6 -118 L0 -106 L6 -118 Z', '#f5a623', 3)
  + `<ellipse cx="6" cy="-104" rx="5" ry="10" fill="#d33b3b" stroke="${INK}" stroke-width="3"/>`
  + (big ? path('M-26 -146 L-22 -196 L22 -196 L26 -146 Z', '#1e1e24') + ell(0, -146, 40, 8, '#1e1e24') + path('M-9 -168 L9 -168 L9 -156 L-9 -156 Z', '#f5c542', 3) : '');

const crow = () => shadow(28)
  + `<g class="lc-float">${wings('#23202b')}`
  + ell(0, -96, 28, 30, '#2e2a38') + ell(0, -128, 18, 18, '#2e2a38')
  + dot(-7, -132, 5, '#ffe066') + dot(7, -132, 5, '#ffe066') + dot(-6, -132, 2, INK) + dot(8, -132, 2, INK)
  + path('M-6 -124 L0 -110 L6 -124 Z', '#f5a623', 3) + path('M-10 -68 L0 -56 L10 -68 Z', '#2e2a38', 4) + '</g>';

const scarecrow = () => shadow()
  + line('M0 -40 L0 -4', '#8b5a2b', 12)
  + path('M-18 -40 L-26 -8 L-14 -14 L-8 -2 L0 -14 L8 -2 L14 -14 L26 -8 L18 -40 Z', '#e9c46a', 4)
  + line('M-60 -112 L60 -112', INK, 16) + line('M-60 -112 L60 -112', '#8b5a2b', 9)
  + path('M-66 -118 L-78 -104 L-64 -106 L-72 -94 L-58 -104 Z M66 -118 L78 -104 L64 -106 L72 -94 L58 -104 Z', '#e9c46a', 3)
  + path('M-30 -124 L30 -124 L26 -40 L-26 -40 Z', '#c0392b')
  + line('M-30 -100 L30 -100 M-28 -76 L28 -76 M-10 -124 L-10 -40 M10 -124 L10 -40', '#7b1f16', 3)
  + ell(0, -156, 28, 30, '#e8d3a2')
  + line('M-14 -142 L-8 -146 L-2 -142 L4 -146 L10 -142 L14 -146', INK, 3)
  + path('M-10 -160 L-4 -154 M-10 -154 L-4 -160 M4 -160 L10 -154 M4 -154 L10 -160', 'none', 3.5)
  + path('M-58 -178 Q0 -192 58 -178 Q60 -170 0 -172 Q-60 -170 -58 -178 Z', '#c99a4b')
  + path('M-26 -176 Q-24 -214 0 -214 Q24 -214 26 -176 Z', '#c99a4b')
  + line('M-24 -184 L24 -184', '#8b5a2b', 6);

const raccoon = () => shadow()
  + path('M24 -40 Q74 -40 70 -90 Q64 -110 52 -96 Q60 -60 22 -60 Z', '#8a8d96')
  + line('M58 -58 L66 -64 M62 -76 L70 -78 M60 -92 L66 -98', '#2b2b33', 7)
  + legs('#5b5e66', -36)
  + ell(0, -70, 32, 38, '#8a8d96') + ell(0, -62, 18, 22, '#cfd2d8', 4)
  + arms(-86, '#8a8d96', 46)
  + path('M-30 -150 L-36 -172 L-18 -160 Z M30 -150 L36 -172 L18 -160 Z', '#8a8d96', 4)
  + ell(0, -132, 32, 28, '#8a8d96')
  + path('M-30 -136 Q-16 -150 0 -136 Q16 -150 30 -136 Q16 -124 0 -132 Q-16 -124 -30 -136 Z', '#2b2b33', 3)
  + dot(-12, -138, 4.5, '#fff') + dot(12, -138, 4.5, '#fff') + dot(-12, -138, 2, INK) + dot(12, -138, 2, INK)
  + ell(0, -116, 14, 10, '#cfd2d8', 3) + dot(0, -120, 4, INK) + smirk(-110, 8);

const squirrel = () => shadow(44)
  + path('M14 -30 Q70 -20 66 -90 Q62 -150 30 -150 Q54 -120 40 -90 Q30 -60 10 -50 Z', '#b5651d')
  + line('M30 -140 Q50 -120 46 -90', '#e0a060', 5)
  + legs('#8b4513', -30)
  + ell(-6, -64, 26, 34, '#c46f2a') + ell(-8, -58, 14, 20, '#f3d2a2', 4)
  + ell(-8, -92, 8, 8, '#8b5a2b', 4) + path('M-16 -94 Q-8 -106 0 -94 Z', '#6b4226', 3)
  + path('M-24 -128 L-30 -148 L-14 -134 Z M8 -128 L14 -148 L0 -134 Z', '#c46f2a', 4)
  + ell(-8, -116, 24, 22, '#c46f2a')
  + eyes(-120, 9, 5) + dot(-8, -108, 3.5, INK) + path('M-14 -102 L-2 -102 L-4 -96 L-12 -96 Z', '#fff', 2.5);

const fox = () => shadow()
  + path('M20 -36 Q76 -30 72 -80 Q66 -96 54 -84 Q56 -52 22 -54 Z', '#e8701a') + path('M62 -88 Q72 -88 72 -80 Q66 -70 58 -78 Z', '#fff', 3)
  + legs('#3a2a20', -34)
  + ell(0, -72, 30, 40, '#e8701a') + ell(0, -66, 16, 26, '#fff4e0', 4)
  + arms(-90, '#e8701a', 52)
  + ell(-58, -98, 20, 9, '#f5c542', 4) + path('M-76 -100 Q-58 -118 -40 -100 Z', '#c8762b', 4)
  + path('M-30 -136 L-34 -174 L-10 -146 Z M30 -136 L34 -174 L10 -146 Z', '#e8701a', 4)
  + path('M-34 -132 Q-30 -160 0 -160 Q30 -160 34 -132 L0 -104 Z', '#e8701a')
  + path('M-24 -124 L0 -104 L24 -124 Q12 -118 0 -122 Q-12 -118 -24 -124 Z', '#fff4e0', 3)
  + dot(0, -106, 5, INK) + eyes(-136, 12, 5);

const corn = path('M-14 -30 Q-20 0 -14 30 Q0 40 14 30 Q20 0 14 -30 Q0 -40 -14 -30 Z', '#f5c542')
  + line('M-8 -24 L-8 26 M0 -30 L0 32 M8 -24 L8 26 M-14 -12 L14 -12 M-15 4 L15 4 M-14 18 L14 18', '#c99a2b', 2.5)
  + path('M-14 30 Q-34 10 -28 -20 Q-16 0 -6 34 Z M14 30 Q34 10 28 -20 Q16 0 6 34 Z', '#6fbf4f', 4);
const pie = path('M-36 4 L36 4 L30 24 Q0 30 -30 24 Z', '#c8762b') + path('M-36 4 Q0 -30 36 4 Z', '#f08a24')
  + line('M-30 4 Q0 -14 30 4', '#c8762b', 4) + ell(14, -14, 9, 6, '#fffaf0', 3);
const cranberry = [[-12, 6], [12, 6], [0, -12]].map(([x, y]) => ell(x, y, 15, 15, '#c1121f')).join('')
  + dot(-16, 2, 3, '#ffb3b3') + dot(8, 2, 3, '#ffb3b3') + dot(-4, -16, 3, '#ffb3b3') + line('M0 -26 Q4 -38 14 -40', '#3a5a2c', 4);
const gravy = path('M-34 0 Q-30 26 0 26 Q30 26 34 0 Z', '#fffaf0') + path('M34 0 L46 -10 L40 4 Z', '#fffaf0', 4)
  + path('M-30 0 Q0 -10 30 0 Q0 8 -30 0 Z', '#8b5a2b', 3) + line('M-34 6 Q-48 4 -44 18 Q-40 26 -30 18', INK, 5);
const wishbone = path('M0 34 L-8 0 Q-16 -24 -26 -34 L-18 -38 Q-6 -24 0 -6 Q6 -24 18 -38 L26 -34 Q16 -24 8 0 Z', '#f4eedc');
const leaf = path('M0 -38 L8 -18 L26 -24 L20 -6 L36 -2 L18 10 L22 26 L4 18 L0 34 L-4 18 L-22 26 L-18 10 L-36 -2 L-20 -6 L-26 -24 L-8 -18 Z', '#e85d1e')
  + line('M0 34 L0 -20 M0 8 L-16 -6 M0 8 L16 -6', '#a83a12', 3);
const acorn = path('M-20 -4 Q-22 24 0 34 Q22 24 20 -4 Z', '#c8762b')
  + path('M-26 -6 Q-26 -28 0 -28 Q26 -28 26 -6 Z', '#7a4a24') + line('M0 -28 L4 -38', INK, 5)
  + line('M-18 -14 L18 -14 M-22 -20 L22 -20', '#5a3418', 2.5);

// ---------- Christmas ----------
const snowman = () => shadow(36)
  + `<g class="lc-float">${ell(0, -58, 38, 34, '#f4f8ff')}${ell(0, -112, 28, 26, '#f4f8ff')}`
  + line('M-26 -112 L-58 -134 M26 -112 L58 -134', '#6b4226', 6)
  + dot(0, -72, 4, INK) + dot(0, -56, 4, INK) + path('M-30 -94 Q0 -82 30 -94 L30 -82 Q0 -72 -30 -82 Z', '#d33b3b', 4)
  + path('M14 -86 L22 -60 L8 -64 Z', '#d33b3b', 4)
  + ell(0, -146, 22, 22, '#f4f8ff') + eyes(-150, 8, 4.5) + path('M0 -144 L20 -140 L0 -138 Z', '#f08a24', 3)
  + smirk(-134, 9)
  + path('M-26 -164 L26 -164 L22 -172 L-22 -172 Z', '#1e1e24', 4) + path('M-16 -170 L-14 -200 L14 -200 L16 -170 Z', '#1e1e24') + '</g>';

const owl = () => shadow(28)
  + `<g class="lc-float">${wings('#e9eef6')}`
  + ell(0, -100, 30, 36, '#f4f8ff')
  + line('M-12 -96 L-6 -92 L0 -96 L6 -92 L12 -96 M-14 -84 L-8 -80 L-2 -84 L4 -80 L10 -84', '#9aa5b8', 3)
  + path('M-26 -128 L-22 -146 L-12 -132 Z M26 -128 L22 -146 L12 -132 Z', '#f4f8ff', 4)
  + ell(-11, -122, 10, 10, '#ffe066', 3.5) + ell(11, -122, 10, 10, '#ffe066', 3.5) + dot(-11, -122, 4.5, INK) + dot(11, -122, 4.5, INK)
  + path('M-4 -112 L0 -104 L4 -112 Z', '#f5a623', 2.5)
  + path('M-14 -66 L-10 -60 M-8 -66 L-4 -60 M8 -66 L4 -60 M14 -66 L10 -60', 'none', 3) + '</g>';

const nutcracker = () => shadow()
  + path('M-22 -64 L-20 -6 L-4 -6 L-6 -64 Z M22 -64 L20 -6 L4 -6 L6 -64 Z', '#f4f1ea')
  + ell(-14, -6, 13, 7, '#1e1e24', 4) + ell(14, -6, 13, 7, '#1e1e24', 4)
  + path('M-30 -126 L30 -126 L28 -62 L-28 -62 Z', '#d33b3b')
  + line('M-30 -70 L30 -70', '#1e1e24', 8) + path('M-6 -74 L6 -74 L6 -66 L-6 -66 Z', '#f5c542', 3)
  + line('M0 -122 L0 -78', '#f5c542', 4) + [-110, -98, -86].map((y) => dot(0, y, 3.5, '#f5c542')).join('')
  + arms(-118, '#d33b3b', 42)
  + path('M-24 -168 L24 -168 L24 -128 Q0 -120 -24 -128 Z', '#f6d7b8')
  + path('M-24 -146 Q-26 -124 0 -122 Q26 -124 24 -146 Q12 -136 0 -136 Q-12 -136 -24 -146 Z', '#f4f1ea', 4)
  + path('M-14 -136 L14 -136 L14 -128 L-14 -128 Z', '#fff', 3)
  + dot(-9, -156, 4, INK) + dot(9, -156, 4, INK) + path('M-14 -148 Q-7 -152 0 -146 Q7 -152 14 -148', 'none', 3)
  + path('M-26 -168 L26 -168 L26 -214 L-26 -214 Z', '#1e1e24') + line('M-26 -176 L26 -176', '#f5c542', 5)
  + path('M14 -214 L20 -232 L26 -214 Z', '#d33b3b', 3);

const gingerbread = () => shadow()
  + path('M-30 -128 Q-32 -150 0 -152 Q32 -150 30 -128 Q50 -120 52 -104 Q50 -92 30 -96 L32 -60 Q50 -20 38 -6 Q24 0 14 -30 Q6 -44 0 -44 Q-6 -44 -14 -30 Q-24 0 -38 -6 Q-50 -20 -32 -60 L-30 -96 Q-50 -92 -52 -104 Q-50 -120 -30 -128 Z', '#c8762b')
  + ell(0, -150, 28, 28, '#c8762b')
  + line('M-44 -110 L-36 -100 M44 -110 L36 -100 M-40 -24 L-30 -16 M40 -24 L30 -16', '#fff', 4)
  + eyes(-154, 9, 4.5) + line('M-10 -140 Q0 -132 10 -140', '#fff', 4)
  + dot(0, -112, 5, '#d33b3b') + dot(0, -94, 5, '#2f9e44') + dot(0, -76, 5, '#d33b3b')
  + path('M-14 -128 L0 -120 L14 -128 L14 -116 L0 -122 L-14 -116 Z', '#3ddc97', 3);

const penguin = () => shadow(40)
  + ell(-14, -4, 13, 6, '#f5a623', 4) + ell(14, -4, 13, 6, '#f5a623', 4)
  + ell(0, -66, 38, 58, '#23202b') + ell(0, -58, 26, 44, '#f4f8ff', 4)
  + path('M-36 -90 Q-58 -60 -46 -42 Q-36 -56 -32 -70 Z M36 -90 Q58 -60 46 -42 Q36 -56 32 -70 Z', '#23202b', 4)
  + ell(0, -128, 26, 24, '#23202b') + ell(-9, -130, 8, 9, '#fff', 3) + ell(9, -130, 8, 9, '#fff', 3)
  + dot(-8, -129, 3.5, INK) + dot(10, -129, 3.5, INK) + path('M-7 -118 L0 -108 L7 -118 Z', '#f5a623', 3)
  + path('M-28 -104 Q0 -94 28 -104 L28 -96 Q0 -86 -28 -96 Z', '#d33b3b', 3.5) + path('M14 -96 L24 -72 L8 -80 Z', '#d33b3b', 3.5);

const elf = () => shadow()
  + path('M-20 -62 L-18 -8 L-4 -8 L-6 -62 Z M20 -62 L18 -8 L4 -8 L6 -62 Z', '#d33b3b')
  + path('M-18 -8 Q-34 -8 -34 -20 L-16 -14 Z M18 -8 Q34 -8 34 -20 L16 -14 Z', '#2f9e44', 4)
  + path('M-30 -120 L30 -120 L36 -60 L24 -54 L12 -62 L0 -54 L-12 -62 L-24 -54 L-36 -60 Z', '#2f9e44')
  + line('M-30 -70 L30 -70', '#1e1e24', 7)
  + arms(-112, '#2f9e44', 50) + path('M50 -126 L66 -126 L66 -110 L50 -110 Z', '#3ddc97', 3) + line('M58 -126 L58 -110 M50 -118 L66 -118', '#d33b3b', 3)
  + path('M-34 -150 L-50 -164 L-30 -140 Z M34 -150 L50 -164 L30 -140 Z', '#f6d7b8', 4)
  + ell(0, -144, 30, 30, '#f6d7b8') + eyes(-148, 10, 4.5) + path('M-12 -132 Q0 -122 12 -134', 'none', 4)
  + path('M-32 -156 Q-20 -200 20 -214 Q12 -188 32 -156 Z', '#2f9e44') + ell(20, -216, 8, 8, '#f5c542', 3)
  + path('M-34 -158 L34 -158 L34 -150 L-34 -150 Z', '#d33b3b', 3);

const yeti = () => shadow(80)
  + path('M-60 -100 Q-70 -40 -50 -4 L-14 -4 L-10 -40 L10 -40 L14 -4 L50 -4 Q70 -40 60 -100 Z', '#eef3fb')
  + line('M-60 -100 Q-100 -70 -96 -30 M60 -100 Q100 -70 96 -30', INK, 30) + line('M-60 -100 Q-100 -70 -96 -30 M60 -100 Q100 -70 96 -30', '#eef3fb', 22)
  + path('M-104 -32 L-98 -16 L-90 -30 L-86 -14 L-80 -30 Z M104 -32 L98 -16 L90 -30 L86 -14 L80 -30 Z', '#eef3fb', 4)
  + ell(0, -150, 60, 64, '#eef3fb')
  + path('M-34 -170 Q0 -200 34 -170 L34 -120 Q0 -100 -34 -120 Z', '#9ec9ff', 4)
  + dot(-14, -152, 7, INK) + dot(14, -152, 7, INK) + dot(-12, -155, 2.5, '#fff') + dot(16, -155, 2.5, '#fff')
  + path('M-18 -130 Q0 -116 18 -130 L18 -124 Q0 -112 -18 -124 Z', '#fff', 3)
  + path('M-60 -196 L-70 -226 L-42 -206 Z M60 -196 L70 -226 L42 -206 Z', '#cfd8e6', 4)
  + path('M-40 -206 L-46 -262 L-22 -236 L0 -270 L22 -236 L46 -262 L40 -206 Z', '#7fd3ff')
  + dot(0, -230, 7, '#fff');

const candyCane = line('M10 34 L10 -16 Q10 -36 -8 -36 Q-26 -36 -26 -20', INK, 16) + line('M10 34 L10 -16 Q10 -36 -8 -36 Q-26 -36 -26 -20', '#fff', 9)
  + line('M4 24 L16 18 M4 8 L16 2 M4 -8 L16 -14 M0 -30 L8 -22 M-16 -34 L-14 -24', '#e0302e', 4);
const cookie = ell(0, 0, 32, 32, '#d8a35a') + [[-14, -10], [10, -16], [-4, 12], [16, 8], [-18, 14]].map(([x, y]) => dot(x, y, 4.5, '#5a3418')).join('');
const ornament = ell(0, 6, 30, 30, '#d33b3b') + path('M-10 -30 L10 -30 L10 -22 L-10 -22 Z', '#c9a227', 4)
  + line('M0 -30 Q-6 -40 0 -42 Q6 -40 0 -30', INK, 3) + line('M-28 0 Q0 12 28 0', '#ffe066', 4) + dot(-12, -6, 5, '#ffb3b3');
const cocoa = path('M-26 -16 L26 -16 L22 30 L-22 30 Z', '#f4f1ea') + line('M26 -6 Q42 -6 40 8 Q38 20 24 18', INK, 5)
  + ell(0, -16, 26, 6, '#6b4226', 4) + ell(-8, -22, 6, 5, '#fff', 3) + ell(6, -22, 6, 5, '#fff', 3)
  + line('M-8 -32 Q-14 -40 -8 -46 M6 -32 Q0 -40 6 -46', '#cfd8e6', 3);
const mitten = path('M-20 34 L-22 -6 Q-24 -36 2 -36 Q24 -36 22 -6 L30 -14 Q40 -10 32 4 L20 22 L20 34 Z', '#2f80ed')
  + path('M-24 24 L24 24 L24 36 L-24 36 Z', '#fff', 4) + line('M-14 -10 L12 -10 M-14 4 L12 4', '#9ed3ff', 4);
const holly = path('M0 0 Q-10 -20 -30 -22 Q-26 -12 -34 -6 Q-22 -2 -24 10 Q-12 2 0 0 Z', '#2f9e44', 4)
  + path('M0 0 Q10 -20 30 -22 Q26 -12 34 -6 Q22 -2 24 10 Q12 2 0 0 Z', '#2f9e44', 4)
  + ell(-6, 12, 8, 8, '#d33b3b', 3.5) + ell(8, 12, 8, 8, '#d33b3b', 3.5) + ell(1, 24, 8, 8, '#d33b3b', 3.5);

// ---------- New Year's ----------
const clock = (big = false) => shadow(big ? 70 : 40)
  + legs('#1e1e24', -30)
  + ell(0, -86, 44, 52, '#f5c542') + ell(0, -86, 34, 42, '#fffaf0', 4)
  + [0, 1, 2, 3].map((i) => {
    const a = (i * Math.PI) / 2;
    return dot((28 * Math.sin(a)).toFixed(1), (-86 - 34 * Math.cos(a)).toFixed(1), 3.5, INK);
  }).join('')
  + line('M0 -86 L0 -114 M0 -86 L14 -96', INK, 5)
  + arms(-90, '#f5c542', 62)
  + path('M-22 -140 L-38 -156 M22 -140 L38 -156', 'none', 6)
  + ell(-38, -158, 9, 9, '#f5c542', 4) + ell(38, -158, 9, 9, '#f5c542', 4)
  + eyes(-74, 12, 4) + smirk(-60, 10)
  + (big ? path('M-34 -136 L-38 -176 L-16 -156 L0 -186 L16 -156 L38 -176 L34 -136 Z', '#ffe066') + dot(0, -160, 6, '#d33b3b') : '');
const disco = () => shadow(30)
  + `<g class="lc-float">${line('M0 -150 L0 -132', INK, 4)}${ell(0, -98, 36, 36, '#c9ced6')}`
  + line('M-34 -110 L34 -110 M-36 -96 L36 -96 M-34 -82 L34 -82 M-18 -132 L-18 -64 M0 -134 L0 -62 M18 -132 L18 -64', '#8f9298', 2.5)
  + dot(-12, -116, 4, '#fff') + dot(16, -88, 3, '#fff')
  + eyes(-100, 11, 5) + smirk(-84, 9) + '</g>';
const balloonGuy = () => shadow(28)
  + `<g class="lc-float">${line('M0 -56 Q10 -30 0 -4', INK, 3)}${ell(0, -104, 34, 44, '#ff5fa2')}`
  + path('M-6 -60 L6 -60 L0 -52 Z', '#ff5fa2', 3) + ell(-12, -122, 6, 10, '#ffd1e3', 0)
  + eyes(-110, 11, 5) + smirk(-92, 9) + '</g>';
const rocket = () => shadow()
  + path('M-18 -40 L-30 -10 L-14 -16 Z M18 -40 L30 -10 L14 -16 Z', '#2f80ed', 4)
  + path('M-18 -150 Q0 -190 18 -150 L18 -24 L-18 -24 Z', '#e0302e')
  + path('M-18 -130 L18 -130 L18 -116 L-18 -116 Z', '#fff', 3)
  + path('M-10 -24 L0 -2 L10 -24 Z', '#ffe066', 3)
  + eyes(-92, 8, 4.5) + smirk(-76, 7);
const popper = () => shadow()
  + path('M-26 -100 L26 -100 L14 -4 L-14 -4 Z', '#3ddc97')
  + line('M-22 -70 L22 -70 M-18 -40 L18 -40', '#fff', 4)
  + [[-30, -130, '#ff5fa2'], [-8, -146, '#ffe066'], [16, -138, '#2f80ed'], [32, -118, '#ff8a2a'], [0, -122, '#b48cff']].map(([x, y, c]) => path(`M${x} ${y} l8 -4 l2 8 Z`, c, 2)).join('')
  + eyes(-78, 9, 4.5) + smirk(-60, 8);
const confettiCloud = () => shadow(50)
  + ell(-22, -76, 30, 26, '#e9e3ff') + ell(18, -84, 34, 30, '#e9e3ff') + ell(0, -60, 44, 22, '#e9e3ff')
  + [[-34, -36], [-10, -30], [14, -26], [34, -34], [-24, -16], [24, -14]].map(([x, y], i) => path(`M${x} ${y} l6 -3 l2 7 Z`, ['#ff5fa2', '#ffe066', '#2f80ed', '#3ddc97', '#ff8a2a', '#b48cff'][i], 2)).join('')
  + eyes(-78, 12, 5) + smirk(-62, 9);
const partyHat = path('M-24 30 L24 30 L0 -34 Z', '#b48cff') + line('M-14 6 L14 6 M-18 18 L18 18', '#ffe066', 4) + ell(0, -36, 7, 7, '#ff5fa2', 3);
const confetti = [[-20, -16, '#ff5fa2'], [14, -22, '#ffe066'], [-6, 6, '#2f80ed'], [22, 10, '#3ddc97'], [-24, 22, '#ff8a2a'], [4, 26, '#b48cff']]
  .map(([x, y, c]) => path(`M${x} ${y} l12 -6 l4 12 Z`, c, 3)).join('');
const sparkler = line('M-24 30 L10 -6', INK, 7) + line('M-24 30 L10 -6', '#9a9ca3', 3)
  + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
    const r = (a * Math.PI) / 180;
    return line(`M${(14 + 8 * Math.cos(r)).toFixed(1)} ${(-10 + 8 * Math.sin(r)).toFixed(1)} L${(14 + 24 * Math.cos(r)).toFixed(1)} ${(-10 + 24 * Math.sin(r)).toFixed(1)}`, '#ffd84a', 4);
  }).join('') + dot(14, -10, 7, '#fff6c4');
const balloon = ell(0, -8, 26, 32, '#e0302e') + path('M-6 24 L6 24 L0 30 Z', '#e0302e', 3) + line('M0 30 Q8 36 0 42', INK, 3) + ell(-10, -20, 5, 8, '#ffb3b3', 0);
const horn = path('M-34 4 L-34 -6 L14 -14 L34 -30 L34 26 L14 10 Z', '#3ddc97') + line('M-6 -10 L-6 8 M6 -12 L6 10', '#ffe066', 4);
const streamer = line('M-30 -30 Q-10 -10 -24 6 Q-36 24 -8 30 Q20 34 30 10', INK, 13) + line('M-30 -30 Q-10 -10 -24 6 Q-36 24 -8 30 Q20 34 30 10', '#2f80ed', 7);
const goldStar = star5(0, 2, 36, '#ffd84a');

// ---------- Valentine's ----------
const loveBug = () => shadow(28)
  + `<g class="lc-float">${wings('#ffd1e3', -100)}${ell(0, -96, 28, 32, '#e0302e')}`
  + line('M0 -126 L0 -66', INK, 4) + dot(-14, -100, 5, INK) + dot(12, -84, 5, INK) + dot(14, -108, 4, INK)
  + ell(0, -134, 18, 16, '#23202b') + dot(-7, -136, 4, '#fff') + dot(7, -136, 4, '#fff')
  + line('M-6 -148 Q-14 -166 -20 -164 M6 -148 Q14 -166 20 -164', INK, 3)
  + path(heartPath(-21, -166, 0.18), '#ff5fa2', 2) + path(heartPath(21, -166, 0.18), '#ff5fa2', 2) + '</g>';
const grumpCloud = () => shadow(30)
  + `<g class="lc-float">${ell(-24, -112, 30, 26, '#8f9298')}${ell(18, -120, 34, 30, '#8f9298')}${ell(0, -96, 44, 22, '#8f9298')}`
  + line('M-14 -116 L-4 -112 M14 -116 L4 -112', INK, 4) + dot(-10, -106, 4, INK) + dot(10, -106, 4, INK)
  + line('M-10 -88 Q0 -96 10 -88', INK, 4)
  + line('M-20 -70 L-24 -54 M0 -70 L-4 -54 M20 -70 L16 -54', '#9ed3ff', 4) + '</g>';
const teddy = () => shadow()
  + ell(-16, -10, 14, 10, '#a86a3c') + ell(16, -10, 14, 10, '#a86a3c')
  + ell(0, -60, 34, 40, '#a86a3c') + ell(0, -56, 20, 26, '#e0b080', 4)
  + arms(-80, '#a86a3c', 44)
  + ell(-28, -148, 12, 12, '#a86a3c') + ell(28, -148, 12, 12, '#a86a3c')
  + ell(0, -124, 32, 30, '#a86a3c') + ell(0, -114, 14, 11, '#e0b080', 3.5)
  + dot(0, -118, 4, INK) + line('M-12 -136 L-4 -132 M12 -136 L4 -132', INK, 4) + dot(-10, -128, 3.5, INK) + dot(10, -128, 3.5, INK)
  + path(heartPath(0, -58, 0.32), '#e0302e', 3);
const brokenHeart = () => shadow()
  + legs('#e0302e', -36)
  + path(heartPath(0, -90, 1.6), '#e0302e')
  + line('M0 -116 L-8 -96 L6 -84 L-4 -66 L0 -50', INK, 4)
  + line('M-26 -104 L-14 -98 M26 -104 L14 -98', INK, 4) + dot(-18, -92, 4.5, INK) + dot(18, -92, 4.5, INK)
  + line('M-10 -72 Q0 -80 10 -72', INK, 4);
const chocoBox = () => shadow()
  + legs('#5a3418', -24)
  + path(heartPath(0, -84, 1.7), '#d33b3b')
  + path(heartPath(0, -84, 1.3), '#5a3418', 3)
  + dot(-16, -96, 7, '#8b5a2b') + dot(16, -96, 7, '#8b5a2b') + dot(0, -72, 7, '#8b5a2b')
  + line('M-58 -140 L-48 -112 M58 -140 L48 -112', 'none', 0)
  + eyes(-118, 18, 5) + ell(0, -50, 14, 5, '#ff5fa2', 3);
const imp = () => shadow()
  + path('M-18 -60 L-16 -6 L-4 -6 L-6 -60 Z M18 -60 L16 -6 L4 -6 L6 -60 Z', '#ff8bd0')
  + path('M-28 -116 L28 -116 L32 -58 L-32 -58 Z', '#ff8bd0')
  + `<g class="lc-flap-l">${path('M-24 -108 Q-58 -136 -72 -110 Q-52 -104 -26 -96 Z', '#fff')}</g>`
  + `<g class="lc-flap-r">${path('M24 -108 Q58 -136 72 -110 Q52 -104 26 -96 Z', '#fff')}</g>`
  + line('M-60 -60 L60 -112', '#c8762b', 5) + path('M60 -112 L48 -112 L58 -100 Z', '#ff5fa2', 3)
  + ell(0, -142, 28, 28, '#ffd1e3') + eyes(-146, 10, 4.5) + smirk(-130, 9)
  + path('M-24 -164 L-30 -180 L-12 -168 Z M24 -164 L30 -180 L12 -168 Z', '#ff5fa2', 3.5);
const heartbreaker = () => shadow(80)
  + path('M-60 -110 L60 -110 Q86 -50 76 -6 Q0 8 -76 -6 Q-86 -50 -60 -110 Z', '#3a0f22')
  + line('M-60 -100 Q-100 -80 -104 -110 M60 -100 Q100 -80 104 -110', INK, 22) + line('M-60 -100 Q-100 -80 -104 -110 M60 -100 Q100 -80 104 -110', '#3a0f22', 14)
  + path(heartPath(0, -170, 2.4), '#b3122e')
  + line('M0 -210 L-12 -184 L8 -166 L-6 -140 L0 -118', INK, 5)
  + `<g class="lc-glow">${path('M-36 -186 L-12 -178 L-30 -168 Z M36 -186 L12 -178 L30 -168 Z', '#ffe066', 3)}</g>`
  + path('M-24 -146 Q0 -156 24 -146 L18 -138 L8 -144 L0 -136 L-8 -144 L-18 -138 Z', '#fff', 3)
  + path('M-40 -230 L-44 -270 L-22 -250 L0 -280 L22 -250 L44 -270 L40 -230 Z', '#ff5fa2');
const rose = line('M0 36 L0 -6', '#2f9e44', 6) + path('M0 14 Q-20 8 -22 -6 Q-8 -4 0 10 Z', '#3ddc97', 3)
  + ell(0, -16, 20, 18, '#e0302e') + line('M-10 -20 Q0 -30 10 -18 Q2 -8 -6 -14', '#9e0c22', 3);
const heartCharm = path(heartPath(0, 4, 1.15), '#ff4f8b') + dot(-14, -10, 5, '#ffd1e3');
const choco = path('M-30 -26 L30 -26 L30 26 L-30 26 Z', '#6b4226') + line('M-30 0 L30 0 M0 -26 L0 26', '#4a2c18', 4) + ell(-15, -13, 6, 5, '#8b5a2b', 0);
const letter = path('M-34 -22 L34 -22 L34 26 L-34 26 Z', '#fffaf0') + path('M-34 -22 L0 6 L34 -22', 'none', 4) + path(heartPath(0, 6, 0.32), '#e0302e', 3);
const ring = ell(0, 10, 24, 22, 'none', 0) + `<ellipse cx="0" cy="10" rx="24" ry="22" fill="none" stroke="${INK}" stroke-width="13"/><ellipse cx="0" cy="10" rx="24" ry="22" fill="none" stroke="#f5c542" stroke-width="7"/>`
  + path('M-12 -14 L12 -14 L18 -24 L0 -38 L-18 -24 Z', '#bdf4ff', 4);
const candyHeart = path(heartPath(0, 4, 1.1), '#ffd1e3') + `<text x="0" y="0" font-family="Arial Black,Arial" font-weight="900" font-size="14" fill="#d1237a" text-anchor="middle" dominant-baseline="central">BE MINE</text>`;
const arrow = line('M-32 30 L28 -28', INK, 9) + line('M-32 30 L28 -28', '#c8762b', 4) + path('M30 -30 L12 -26 L26 -12 Z', '#ff5fa2', 3)
  + path('M-32 30 L-38 18 M-32 30 L-20 36 M-24 22 L-30 10 M-24 22 L-12 28', 'none', 4);

// ---------- St. Patrick's ----------
const leprechaun = (big = false) => shadow(big ? 70 : 46)
  + path('M-20 -60 L-18 -6 L-4 -6 L-6 -60 Z M20 -60 L18 -6 L4 -6 L6 -60 Z', '#2f6b3a')
  + ell(-14, -4, 13, 6, '#1e1e24', 4) + ell(14, -4, 13, 6, '#1e1e24', 4)
  + path('M-30 -118 L30 -118 L34 -58 L-34 -58 Z', '#2f9e44')
  + line('M-32 -70 L32 -70', '#1e1e24', 7) + path('M-6 -74 L6 -74 L6 -66 L-6 -66 Z', '#f5c542', 3)
  + arms(-110, '#2f9e44', 48)
  + ell(0, -144, 28, 28, '#f6d7b8')
  + path('M-28 -146 Q-34 -104 0 -100 Q34 -104 28 -146 Q14 -126 0 -128 Q-14 -126 -28 -146 Z', '#e8701a', 4)
  + eyes(-152, 10, 4.5) + path('M-8 -134 Q0 -128 8 -134', 'none', 3.5)
  + ell(0, -170, 40, 8, '#2f9e44') + path('M-24 -170 L-20 -214 L20 -214 L24 -170 Z', '#2f9e44')
  + line('M-22 -180 L22 -180', '#1e1e24', 7) + path('M-7 -186 L7 -186 L7 -174 L-7 -174 Z', '#f5c542', 3)
  + (big ? ell(-66, -90, 24, 18, '#1e1e24') + [-74, -64, -54].map((x) => dot(x, -106, 7, '#ffd84a')).join('') : '');
const snake = () => shadow(50)
  + path('M-50 -8 Q-60 -40 -20 -40 Q20 -40 20 -70 Q20 -100 0 -110 Q30 -120 34 -90 Q40 -20 -10 -20 Q-30 -20 -30 -8 Z', '#7cc95a')
  + dot(-36, -28, 4, '#4f8f3a') + dot(0, -30, 4, '#4f8f3a') + dot(28, -60, 4, '#4f8f3a')
  + ell(10, -118, 22, 16, '#7cc95a') + eyes(-122, 8, 4) + line('M24 -112 L34 -110 L38 -104 M34 -110 L40 -114', '#e0302e', 2.5);
const goat = () => shadow()
  + legs('#e9e3d0', -40)
  + ell(0, -70, 40, 30, '#f4f1ea')
  + path('M28 -110 L22 -82 L36 -78 L44 -104 Z', '#f4f1ea', 4)
  + ell(36, -122, 20, 22, '#f4f1ea')
  + line('M28 -138 Q20 -160 34 -164 M42 -138 Q48 -158 60 -152', '#8b5a2b', 6)
  + dot(30, -126, 4, INK) + dot(44, -126, 4, INK) + path('M30 -104 L36 -88 L42 -104 Z', '#e9e3d0', 3)
  + path('M-40 -76 L-50 -70', 'none', 5);
const potMimic = () => shadow(44)
  + legs('#1e1e24', -20)
  + path('M-40 -90 Q-46 -20 0 -20 Q46 -20 40 -90 Z', '#2b2b33')
  + ell(0, -90, 44, 12, '#ffd84a')
  + [-26, -10, 8, 24].map((x, i) => dot(x, -100 - (i % 2) * 6, 8, '#ffd84a')).join('')
  + dot(-14, -62, 6, '#ffe066') + dot(14, -62, 6, '#ffe066') + path('M-14 -44 L-8 -50 L-2 -44 L4 -50 L10 -44', 'none', 3.5);
const blackCat = () => shadow(40)
  + path('M20 -30 Q60 -30 56 -80 Q52 -96 44 -84', 'none', 9)
  + legs('#1e1e24', -30)
  + ell(0, -64, 30, 34, '#2b2433')
  + path('M-24 -120 L-28 -150 L-8 -128 Z M24 -120 L28 -150 L8 -128 Z', '#2b2433', 4)
  + ell(0, -112, 28, 26, '#2b2433')
  + ell(-10, -114, 6, 7, '#ffe066', 0) + ell(10, -114, 6, 7, '#ffe066', 0) + dot(-10, -114, 2.5, INK) + dot(10, -114, 2.5, INK)
  + path('M-4 -104 L4 -104 L0 -100 Z', '#ff9ab8', 2) + line('M-8 -100 L-30 -104 M8 -100 L30 -104', '#9a9ca3', 2);
const magpie = () => shadow(28)
  + `<g class="lc-float">${wings('#1e1e24')}`
  + ell(0, -96, 28, 30, '#1e1e24') + ell(0, -92, 16, 18, '#f4f8ff', 3)
  + ell(0, -128, 18, 18, '#1e1e24') + dot(-6, -132, 4, '#fff') + dot(6, -132, 4, '#fff')
  + path('M-5 -124 L0 -112 L5 -124 Z', '#1e1e24', 3) + dot(0, -110, 6, '#ffd84a') + '</g>';
const shamrock = [[-14, -10], [14, -10], [0, -28]].map(([x, y]) => path(heartPath(x, y + 4, 0.45), '#3ddc97', 4)).join('')
  + line('M0 -6 Q4 18 12 32', '#2f9e44', 6);
const horseshoe = `<path d="M-22 30 L-26 0 Q-26 -32 0 -32 Q26 -32 26 0 L22 30" fill="none" stroke="${INK}" stroke-width="18" stroke-linecap="round"/>`
  + `<path d="M-22 30 L-26 0 Q-26 -32 0 -32 Q26 -32 26 0 L22 30" fill="none" stroke="#c0c4cc" stroke-width="10" stroke-linecap="round"/>`
  + [[-24, 10], [-22, -14], [0, -30], [22, -14], [24, 10]].map(([x, y]) => dot(x, y, 2.5, INK)).join('');
const coin = ell(0, 0, 32, 32, '#ffd84a') + ell(0, 0, 22, 22, '#f5c542', 3) + path(heartPath(-6, -4, 0.2), '#3ddc97', 2) + path(heartPath(6, -4, 0.2), '#3ddc97', 2) + path(heartPath(0, -12, 0.2), '#3ddc97', 2);
const rainbow = ['#e0302e', '#ff8a2a', '#ffd84a', '#3ddc97', '#2f80ed'].map((c, i) => `<path d="M${-36 + i * 6} 22 A${36 - i * 6} ${36 - i * 6} 0 0 1 ${36 - i * 6} 22" fill="none" stroke="${c}" stroke-width="7"/>`).join('')
  + ell(-30, 24, 12, 8, '#fff') + ell(30, 24, 12, 8, '#fff');
const harp = path('M-20 34 L-20 -30 Q-4 -40 10 -24 Q24 -8 30 30 Z', '#f5c542') + line('M-12 26 L-12 -26 M-2 26 L-2 -26 M8 28 L8 -18 M18 30 L18 -6', '#fffaf0', 2.5);
const clover4 = [[-12, -12], [12, -12], [-12, 12], [12, 12]].map(([x, y]) => ell(x, y, 13, 13, '#3ddc97', 4)).join('') + dot(0, 0, 5, '#2f9e44') + line('M8 8 L26 34', '#2f9e44', 5);
const hatCharm = ell(0, 22, 36, 8, '#2f9e44') + path('M-22 22 L-18 -28 L18 -28 L22 22 Z', '#2f9e44') + line('M-20 8 L20 8', '#1e1e24', 8) + path('M-6 2 L6 2 L6 14 L-6 14 Z', '#f5c542', 3);

// ---------- Easter ----------
const sneakyFox = fox;
const frog = () => shadow(44)
  + ell(-22, -10, 18, 8, '#5fbf4a') + ell(22, -10, 18, 8, '#5fbf4a')
  + ell(0, -54, 38, 34, '#7cc95a') + ell(0, -48, 24, 20, '#d8f5c8', 4)
  + ell(-18, -88, 14, 14, '#7cc95a') + ell(18, -88, 14, 14, '#7cc95a')
  + dot(-18, -88, 7, '#fff') + dot(18, -88, 7, '#fff') + dot(-16, -88, 3.5, INK) + dot(20, -88, 3.5, INK)
  + line('M-16 -64 Q0 -54 16 -64', INK, 4);
const bunnyThief = () => shadow()
  + legs('#e9e3d0', -36)
  + ell(0, -70, 30, 36, '#f4f1ea')
  + arms(-90, '#f4f1ea', 50) + ell(56, -98, 12, 16, '#ff9ad5', 4) + line('M50 -104 L62 -96', '#fff', 3)
  + `<g transform="rotate(-10 -12 -150)">${ell(-12, -186, 10, 34, '#f4f1ea')}${ell(-12, -186, 4, 24, '#ffb6c8', 0)}</g>`
  + `<g transform="rotate(12 12 -150)">${ell(12, -186, 10, 34, '#f4f1ea')}${ell(12, -186, 4, 24, '#ffb6c8', 0)}</g>`
  + ell(0, -136, 28, 26, '#f4f1ea')
  + path('M-26 -144 L26 -144 L26 -132 L-26 -132 Z', '#1e1e24', 3) + dot(-10, -138, 3.5, '#fff') + dot(10, -138, 3.5, '#fff')
  + path('M-4 -126 L4 -126 L0 -120 Z', '#ff9ab8', 2) + line('M0 -120 L-6 -114 M0 -120 L6 -114', INK, 3);
const wasp = (color = '#ffd84a') => shadow(28)
  + `<g class="lc-float">${wings('rgba(220,240,255,0.9)', -110)}${ell(0, -96, 30, 22, color)}`
  + line('M-14 -114 L-14 -78 M2 -118 L2 -74 M18 -112 L18 -80', '#1e1e24', 6)
  + path('M30 -96 L44 -92 L30 -88 Z', '#1e1e24', 3)
  + ell(-30, -100, 14, 14, '#1e1e24') + dot(-34, -104, 4, '#ff3b3b') + dot(-26, -104, 4, '#ff3b3b')
  + line('M-34 -112 Q-40 -126 -46 -126 M-26 -112 Q-24 -126 -18 -128', INK, 3) + '</g>';
const chickBully = () => shadow(36)
  + legs('#f5a623', -24)
  + ell(0, -60, 36, 38, '#ffe066')
  + path('M-34 -60 Q-52 -50 -40 -36 Z M34 -60 Q52 -50 40 -36 Z', '#ffd84a', 4)
  + line('M-2 -100 Q-6 -110 0 -112 Q6 -110 2 -100', INK, 3)
  + line('M-16 -78 L-6 -72 M16 -78 L6 -72', INK, 4) + dot(-11, -68, 4, INK) + dot(11, -68, 4, INK)
  + path('M-7 -60 L0 -50 L7 -60 Z', '#f5a623', 3)
  + path('M-38 -46 Q0 -26 38 -46 Q40 -20 0 -18 Q-40 -20 -38 -46 Z', '#fffaf0', 4)
  + path('M-38 -46 L-30 -38 L-22 -48 L-12 -38 L-2 -48 L8 -38 L18 -48 L28 -38 L38 -46', 'none', 3);
const eggSnatcher = () => shadow(80)
  + path('M-60 -100 Q-70 -40 -50 -4 L50 -4 Q70 -40 60 -100 Z', '#6b4e9e')
  + line('M-60 -96 Q-100 -70 -100 -110 M60 -96 Q100 -70 100 -110', INK, 26) + line('M-60 -96 Q-100 -70 -100 -110 M60 -96 Q100 -70 100 -110', '#6b4e9e', 18)
  + ell(-100, -124, 18, 22, '#ff9ad5') + ell(100, -124, 18, 22, '#9ed3ff')
  + line('M-112 -124 L-88 -124 M88 -128 L112 -120', '#fff', 4)
  + `<g transform="rotate(-12 -20 -200)">${ell(-20, -250, 14, 46, '#6b4e9e')}${ell(-20, -250, 6, 34, '#ffb6c8', 0)}</g>`
  + `<g transform="rotate(14 20 -200)">${ell(20, -250, 14, 46, '#6b4e9e')}${ell(20, -250, 6, 34, '#ffb6c8', 0)}</g>`
  + ell(0, -160, 54, 50, '#6b4e9e')
  + path('M-54 -170 L54 -170 L54 -150 L-54 -150 Z', '#1e1e24', 4)
  + `<g class="lc-glow">${dot(-20, -160, 7, '#ffe066')}${dot(20, -160, 7, '#ffe066')}</g>`
  + path('M-8 -136 L8 -136 L0 -128 Z', '#ff9ab8', 2) + path('M-20 -122 Q0 -110 20 -122 L14 -114 L8 -120 L0 -112 L-8 -120 L-14 -114 Z', '#fff', 3);
const egg = (fill, band) => ell(0, 2, 26, 34, fill) + line('M-24 -4 Q-12 -12 0 -4 Q12 4 24 -4', band, 4) + line('M-22 14 L-14 8 L-6 14 L2 8 L10 14 L18 8 L24 12', band, 3);
const carrot = path('M-8 -18 L8 -18 L2 36 Z', '#ff8a2a') + line('M-4 -6 L2 -4 M-2 8 L3 10', '#c85a10', 3)
  + path('M0 -18 Q-14 -36 -20 -30 Q-8 -24 -4 -18 Z M0 -18 Q0 -40 6 -40 Q6 -26 2 -18 Z M0 -18 Q14 -36 20 -30 Q8 -24 4 -18 Z', '#3ddc97', 3);
const tulip = line('M0 36 L0 0', '#2f9e44', 6) + path('M0 22 Q-18 14 -18 0 Q-6 4 0 18 Z', '#3ddc97', 3)
  + path('M-18 -28 L-10 -16 L0 -30 L10 -16 L18 -28 L16 0 Q0 10 -16 0 Z', '#ff5fa2');
const chocBunny = ell(-8, -28, 6, 16, '#8b5a2b', 4) + ell(8, -28, 6, 16, '#8b5a2b', 4) + ell(0, -6, 16, 14, '#8b5a2b') + ell(0, 22, 22, 18, '#8b5a2b') + dot(-5, -8, 2.5, '#fff') + dot(5, -8, 2.5, '#fff');
const basket = path('M-34 -4 L34 -4 L26 30 L-26 30 Z', '#c99a4b') + `<path d="M-28 -4 Q0 -48 28 -4" fill="none" stroke="${INK}" stroke-width="9"/><path d="M-28 -4 Q0 -48 28 -4" fill="none" stroke="#c99a4b" stroke-width="4"/>`
  + line('M-30 8 L30 8 M-28 20 L28 20', '#8b5a2b', 3) + ell(-12, -6, 9, 11, '#9ed3ff', 3) + ell(10, -6, 9, 11, '#ff9ad5', 3);
const jellyBeans = [[-14, -8, '#e0302e'], [12, -14, '#3ddc97'], [-2, 10, '#ffd84a'], [18, 12, '#b48cff'], [-20, 18, '#ff8a2a']].map(([x, y, c]) => `<ellipse cx="${x}" cy="${y}" rx="12" ry="8" transform="rotate(-25 ${x} ${y})" fill="${c}" stroke="${INK}" stroke-width="4"/>`).join('');

// ---------- Fourth of July ----------
const mosquito = () => wasp('#9a8a7a');
const ant = () => shadow(44)
  + line('M-20 -30 L-34 -4 M0 -30 L-4 -4 M20 -30 L30 -4', INK, 5)
  + ell(-30, -44, 22, 18, '#5a2a1a') + ell(4, -46, 14, 12, '#5a2a1a') + ell(30, -58, 18, 16, '#5a2a1a')
  + line('M34 -72 Q38 -94 50 -96 M28 -72 Q22 -92 30 -100', INK, 3)
  + dot(36, -60, 4, '#fff') + dot(36, -60, 2, INK)
  + ell(0, -84, 22, 14, '#e0302e') + line('M-20 -84 Q0 -96 20 -84', '#7a1f16', 3) + dot(-6, -88, 3, '#2f9e44') + dot(8, -88, 3, '#2f9e44');
const seagull = () => shadow(30)
  + `<g class="lc-float">${wings('#f4f8ff')}`
  + ell(0, -96, 30, 22, '#f4f8ff') + ell(18, -114, 16, 16, '#f4f8ff')
  + dot(22, -118, 4, INK) + path('M30 -114 L48 -110 L30 -106 Z', '#f5a623', 3)
  + ell(52, -106, 14, 6, '#e0302e', 3) + ell(52, -106, 10, 3, '#f5c542', 0) + '</g>';
const stormCloud = (big = false) => shadow(big ? 80 : 50)
  + ell(-30, -130, 38, 32, '#5a6070') + ell(24, -140, 44, 38, '#5a6070') + ell(0, -112, 58, 28, '#5a6070')
  + path('M-6 -86 L-18 -50 L-4 -54 L-14 -16 L14 -64 L0 -60 L8 -86 Z', '#ffe066', 4)
  + line('M-24 -138 L-12 -132 M24 -138 L12 -132', INK, 4) + dot(-16, -124, 5, '#fff') + dot(16, -124, 5, '#fff')
  + line('M-14 -108 Q0 -116 14 -108', INK, 4)
  + (big ? `<g class="lc-glow">${path('M-60 -86 L-70 -60 L-58 -62 L-66 -40', 'none', 5)}${path('M60 -86 L70 -60 L58 -62 L66 -40', 'none', 5)}</g>` : '');
const raccoonJ = raccoon;
const grillBot = () => shadow()
  + legs('#1e1e24', -36)
  + ell(0, -74, 40, 34, '#2b2b33')
  + line('M-34 -84 L34 -84 M-36 -72 L36 -72', '#8f9298', 3)
  + line('M-40 -60 L-52 -30 M40 -60 L52 -30', INK, 6)
  + path('M-44 -108 Q0 -150 44 -108 Z', '#e0302e')
  + dot(-14, -76, 6, '#ffe066') + dot(14, -76, 6, '#ffe066') + line('M-10 -60 Q0 -54 10 -60', '#ffe066', 4)
  + line('M-6 -150 Q-14 -166 -6 -178 M8 -150 Q0 -166 8 -178', '#cfd2d8', 4);
const bugSpray = path('M-16 -20 L16 -20 L16 34 L-16 34 Z', '#3ddc97') + path('M-10 -32 L10 -32 L10 -20 L-10 -20 Z', '#fff', 4)
  + path('M10 -30 L22 -30', 'none', 4) + line('M24 -34 L34 -40 M24 -28 L36 -28 M24 -22 L34 -16', '#9ed3ff', 3) + line('M-10 0 L10 0 M-10 10 L10 10', '#fff', 3);
const lemonade = path('M-20 -24 L20 -24 L16 32 L-16 32 Z', '#fff6a8') + line('M-20 -12 L20 -12', '#ffd84a', 4) + ell(14, -26, 10, 10, '#ffd84a', 3) + line('M-4 -40 L4 -8', '#e0302e', 4);
const flag = line('M-28 36 L-28 -36', INK, 6) + path('M-28 -32 L32 -32 L32 6 L-28 6 Z', '#fff')
  + line('M-6 -24 L32 -24 M-6 -12 L32 -12 M-28 0 L32 0', '#e0302e', 5) + path('M-28 -32 L-6 -32 L-6 -14 L-28 -14 Z', '#2340c8', 3);
const watermelon = path('M-34 -6 A34 34 0 0 0 34 -6 Z', '#3ddc97') + path('M-28 -6 A28 28 0 0 0 28 -6 Z', '#ff5f6d', 0)
  + [[-14, 4], [0, 10], [14, 4]].map(([x, y]) => dot(x, y, 3, INK)).join('');
const hotdog = `<ellipse cx="0" cy="0" rx="38" ry="12" fill="#c0392b" stroke="${INK}" stroke-width="5"/>` + path('M-34 4 Q0 26 34 4 L30 14 Q0 30 -30 14 Z', '#f5c08a') + line('M-26 -2 Q-18 -8 -10 -2 Q-2 4 6 -2 Q14 -8 22 -2', '#ffd84a', 4);
const fan = path('M0 0 L-30 -24 Q-14 -40 0 -36 Z', '#2f80ed', 4) + path('M0 0 L30 -24 Q14 -40 0 -36 Z', '#e0302e', 4) + path('M0 0 L-22 -30 Q0 -44 22 -30 Z', '#fff', 4) + line('M0 0 L0 34', '#c8762b', 6);
const shades = path('M-34 -8 L34 -8 L30 10 Q20 18 6 10 L0 2 L-6 10 Q-20 18 -30 10 Z', '#1e1e24') + line('M-34 -8 L-40 -14 M34 -8 L40 -14', INK, 5);

// ---------- The skins ----------
const SKINS = {
  thanksgiving: {
    hall: { title: 'Harvest Hallway', place: "the farmhouse", wall: ['#4a2a14', '#5a3418', '#7a4a24'], symbols: [['leaf', 'a leaf', '🍂'], ['corn', 'corn', '🌽'], ['turkey', 'a turkey', '🦃'], ['pie', 'a pie', '🥧'], ['apple', 'an apple', '🍎']].map(([id, name, icon]) => ({ id, name, icon })) },
    yard: { skies: [['#1a1030', '#5a2d4f', '#c0603a', '#3a2a14', '#5a4320', '#7a5a2c', '#ffd28a', '#e8b060'], ['#141420', '#3a3448', '#6a5a5a', '#2c2a20', '#4a4030', '#6a5a40', '#f0e6d2', '#d8ccb0'], ['#120a1a', '#4a1f2a', '#a8402a', '#2a1a10', '#3e2a18', '#5e4228', '#ffb060', '#e08a3a']], prop: () => path('M-40 0 L-40 -40 Q0 -52 40 -40 L40 0 Z', '#e9c46a') + line('M-36 -14 L36 -14 M-36 -28 L36 -28', '#c99a2b', 3) + ell(0, -58, 18, 15, '#f07f1d', 4) + line('M0 -72 L4 -80', '#3a5a2c', 4) },
    monsters: {
      ghost: { name: 'Runaway Turkey', art: () => turkey() },
      bat: { name: 'Crow', art: crow },
      skeleton: { name: 'Scarecrow', art: scarecrow },
      zombie: { name: 'Raccoon', art: raccoon },
      spider: { name: 'Squirrel', art: squirrel },
      witch: { name: 'Pie Thief Fox', art: fox },
      king: { name: 'Giant Gobbler', art: () => turkey(true) },
    },
    charms: {
      garlic: { name: 'Corn', icon: '🌽', color: '#fff3b0', art: corn },
      salt: { name: 'Pie', icon: '🥧', color: '#ffd9a8', art: pie },
      bell: { name: 'Dinner bell', icon: '🔔', color: '#f5c542' },
      candy: { name: 'Cranberry', icon: '🍒', color: '#ffb3c1', art: cranberry },
      crystal: { name: 'Gravy', icon: '🍲', color: '#e6c7a0', art: gravy },
      bone: { name: 'Wishbone', icon: '🦴', color: '#e9e3d0', art: wishbone },
      herb: { name: 'Leaf', icon: '🍁', color: '#ffc28a', art: leaf },
      star: { name: 'Acorn', icon: '🌰', color: '#e6c08a', art: acorn },
    },
    nights: [
      { title: 'Harvest Eve', blurb: 'Critters are coming for the feast. Shout out what they need and throw the right charms!' },
      { title: 'Foggy Fields', blurb: 'Foggy critters hide what they need. One of you sees it on your phone. Call it out!' },
      { title: 'Turkey Time', blurb: 'The Giant Gobbler is coming. When he shows up, everyone hit GOBBLE at the same time!' },
    ],
    text: { foe: 'critter', foes: 'critters', soul: 'GOBBLE', spooked: 'OOPS!' },
  },
  christmas: {
    hall: { title: 'Workshop Hallway', place: "Santa's workshop", wall: ['#123a28', '#0f3020', '#d33b3b'], symbols: [['tree', 'a tree', '🎄'], ['gift', 'a present', '🎁'], ['snow', 'a snowflake', '❄️'], ['star', 'a star', '⭐'], ['bell', 'a bell', '🔔']].map(([id, name, icon]) => ({ id, name, icon })) },
    yard: { skies: [['#0a1430', '#1f3a6a', '#3a5a8a', '#8fa3c2', '#7f94b4', '#a9bad4', '#fff8e0', '#e8dcb0'], ['#0e1420', '#2b3448', '#4a5468', '#7f8ea6', '#72829c', '#98a6bc', '#e8ecf2', '#c9d0dc'], ['#08081a', '#1a1f45', '#2e3a6e', '#7486a8', '#66789a', '#8c9cba', '#fff1c1', '#efdca0']], prop: () => path('M0 -110 L-36 -20 L36 -20 Z', '#2f9e44') + path('M0 -80 L-44 0 L44 0 Z', '#2f9e44') + path('M-6 0 L6 0 L6 12 L-6 12 Z', '#6b4226', 3) + dot(-14, -30, 5, '#e0302e') + dot(12, -50, 5, '#ffd84a') + dot(4, -16, 5, '#2f80ed') },
    monsters: {
      ghost: { name: 'Sneaky Snowman', art: snowman },
      bat: { name: 'Snowy Owl', art: owl },
      skeleton: { name: 'Nutcracker', art: nutcracker },
      zombie: { name: 'Gingerbread Man', art: gingerbread },
      spider: { name: 'Penguin', art: penguin },
      witch: { name: 'Naughty Elf', art: elf },
      king: { name: 'Abominable Snowbeast', art: yeti },
    },
    charms: {
      garlic: { name: 'Candy cane', icon: '🍬', color: '#ffd6d6', art: candyCane },
      salt: { name: 'Cookie', icon: '🍪', color: '#f3d2a2', art: cookie },
      bell: { name: 'Jingle bell', icon: '🔔', color: '#f5c542' },
      candy: { name: 'Ornament', icon: '🔴', color: '#ffc2c2', art: ornament },
      crystal: { name: 'Cocoa', icon: '☕', color: '#e6c7a0', art: cocoa },
      bone: { name: 'Mitten', icon: '🧤', color: '#bfe0ff', art: mitten },
      herb: { name: 'Holly', icon: '🌿', color: '#c8f0c0' , art: holly },
      star: { name: 'Star', icon: '⭐', color: '#ffd84a' },
    },
    nights: [
      { title: 'Snowfall', blurb: 'Mischief-makers are sneaking up to the house. Shout out what they need and throw the right charms!' },
      { title: 'Blizzard', blurb: 'The snow hides what some need. One of you sees it on your phone. Call it out!' },
      { title: 'Christmas Eve', blurb: 'The Abominable Snowbeast is coming. When it shows up, everyone hit JINGLE at the same time!' },
    ],
    text: { foe: 'troublemaker', foes: 'troublemakers', soul: 'JINGLE', spooked: 'OOPS!' },
  },
  newyear: {
    hall: { title: 'Party Hallway', place: "the party tower", wall: ['#1b1f45', '#14183a', '#ffd36e'], symbols: [['star', 'a star', '⭐'], ['balloon', 'a balloon', '🎈'], ['clock', 'a clock', '⏰'], ['gift', 'a present', '🎁'], ['moon', 'a moon', '🌙']].map(([id, name, icon]) => ({ id, name, icon })) },
    yard: { skies: [['#05060f', '#1b1f45', '#2b2f6e', '#1a1a2a', '#24243a', '#3a3a58', '#fff1a8', '#e8d880'], ['#05060f', '#1b1f45', '#3a3f80', '#1a1a2a', '#24243a', '#3a3a58', '#e8ecf2', '#c9d0dc'], ['#020208', '#14183a', '#2b2f6e', '#14141f', '#1e1e30', '#30304a', '#ffe066', '#f5c542']], prop: () => line('M-14 0 Q-20 -40 -24 -70 M0 0 L0 -80 M14 0 Q20 -40 26 -66', INK, 3) + ell(-24, -84, 14, 18, '#ff5fa2') + ell(0, -96, 14, 18, '#ffe066') + ell(26, -80, 14, 18, '#2f80ed') },
    monsters: {
      ghost: { name: 'Party Balloon', art: balloonGuy },
      bat: { name: 'Disco Ball', art: disco },
      skeleton: { name: 'Rocket', art: rocket },
      zombie: { name: 'Party Popper', art: popper },
      spider: { name: 'Confetti Cloud', art: confettiCloud },
      witch: { name: 'Tick-Tock', art: () => clock() },
      king: { name: 'The Midnight Clock', art: () => clock(true) },
    },
    charms: {
      garlic: { name: 'Party hat', icon: '🥳', color: '#e3d6ff', art: partyHat },
      salt: { name: 'Confetti', icon: '🎊', color: '#fff3b0', art: confetti },
      bell: { name: 'Bell', icon: '🔔', color: '#f5c542' },
      candy: { name: 'Sparkler', icon: '✨', color: '#c7e3ff', art: sparkler },
      crystal: { name: 'Balloon', icon: '🎈', color: '#ffc2c2', art: balloon },
      bone: { name: 'Horn', icon: '📯', color: '#c8f0c0', art: horn },
      herb: { name: 'Streamer', icon: '🎗️', color: '#c7e3ff', art: streamer },
      star: { name: 'Gold star', icon: '⭐', color: '#ffd84a', art: goldStar },
    },
    nights: [
      { title: 'Party Time', blurb: 'The party is getting out of hand! Shout out what they need and throw the right charms!' },
      { title: 'Fog Machine', blurb: 'The fog machine hides what some need. One of you sees it on your phone. Call it out!' },
      { title: 'Countdown', blurb: 'The Midnight Clock is coming. When it shows up, everyone hit CHEER at the same time!' },
    ],
    text: { foe: 'party crasher', foes: 'party crashers', soul: 'CHEER', spooked: 'OOPS!' },
  },
  valentines: {
    hall: { title: 'Heart Hallway', place: "the candy castle", wall: ['#5a1030', '#4a0c26', '#ff6fa5'], symbols: [['heart', 'a heart', '❤️'], ['rose', 'a rose', '🌹'], ['letter', 'a letter', '💌'], ['ring', 'a ring', '💍'], ['bear', 'a teddy bear', '🧸']].map(([id, name, icon]) => ({ id, name, icon })) },
    yard: { skies: [['#2a0718', '#6b1238', '#a8325a', '#3a1a2a', '#4e2438', '#6e3a52', '#ffe0ef', '#f0b8d0'], ['#1e0a18', '#4a1f3a', '#6a3a5a', '#2c1a28', '#402838', '#5a3e52', '#f4e6f0', '#d8c0d0'], ['#1a0410', '#5a0f2a', '#8e1d4a', '#2a1020', '#3e1a30', '#5e2c48', '#ff8ab0', '#e05a88']], prop: () => ell(0, -30, 40, 32, '#2f9e44') + [[-20, -40], [14, -48], [0, -22], [24, -24], [-26, -18]].map(([x, y]) => path(heartPath(x, y, 0.3), '#ff4f8b', 2.5)).join('') },
    monsters: {
      ghost: { name: 'Grumpy Cloud', art: grumpCloud },
      bat: { name: 'Love Bug', art: loveBug },
      skeleton: { name: 'Broken Heart', art: brokenHeart },
      zombie: { name: 'Teddy Bear', art: teddy },
      spider: { name: 'Chocolate Box', art: chocoBox },
      witch: { name: 'Cupid Imp', art: imp },
      king: { name: 'The Heartbreaker', art: heartbreaker },
    },
    charms: {
      garlic: { name: 'Rose', icon: '🌹', color: '#ffc2c2', art: rose },
      salt: { name: 'Heart', icon: '❤️', color: '#ffd1e3', art: heartCharm },
      bell: { name: 'Bell', icon: '🔔', color: '#f5c542' },
      candy: { name: 'Chocolate', icon: '🍫', color: '#e6c7a0', art: choco },
      crystal: { name: 'Love letter', icon: '💌', color: '#fff3e0', art: letter },
      bone: { name: 'Ring', icon: '💍', color: '#c7e3ff', art: ring },
      herb: { name: 'Candy heart', icon: '💗', color: '#ffe0ef', art: candyHeart },
      star: { name: 'Arrow', icon: '💘', color: '#ffd84a', art: arrow },
    },
    nights: [
      { title: 'Sweet Dreams', blurb: 'Love-struck pests are coming! Shout out what they need and throw the right charms!' },
      { title: 'Lovesick Fog', blurb: 'Foggy pests hide what they need. One of you sees it on your phone. Call it out!' },
      { title: 'Midnight Kiss', blurb: 'The Heartbreaker is coming. When it shows up, everyone hit LOVE at the same time!' },
    ],
    text: { foe: 'pest', foes: 'pests', soul: 'LOVE', spooked: 'OOPS!' },
  },
  stpatricks: {
    hall: { title: 'Lucky Hallway', place: "the leprechaun's tower", wall: ['#0e3d21', '#0a3018', '#ffd84a'], symbols: [['clover', 'a clover', '🍀'], ['rainbow', 'a rainbow', '🌈'], ['coin', 'a coin', '🪙'], ['hat', 'a hat', '🎩'], ['star', 'a star', '⭐']].map(([id, name, icon]) => ({ id, name, icon })) },
    yard: { skies: [['#04170c', '#0e3d21', '#2a6a40', '#1d3a2a', '#26492f', '#3e5e3a', '#fff1c1', '#efdca0'], ['#0a1814', '#24382e', '#3e5a48', '#22302c', '#2c3b35', '#47534a', '#e8ecf2', '#c9d0dc'], ['#020e06', '#0a3018', '#146b35', '#1a3424', '#22442e', '#38583a', '#ffd84a', '#e8b82a']], prop: () => path('M-30 -36 Q-34 0 0 0 Q34 0 30 -36 Z', '#2b2b33') + ell(0, -36, 32, 9, '#ffd84a') + [-14, 0, 14].map((x) => dot(x, -44, 7, '#ffd84a')).join('') },
    monsters: {
      ghost: { name: 'Snake', art: snake },
      bat: { name: 'Magpie', art: magpie },
      skeleton: { name: 'Leprechaun', art: () => leprechaun() },
      zombie: { name: 'Billy Goat', art: goat },
      spider: { name: 'Black Cat', art: blackCat },
      witch: { name: 'Pot Mimic', art: potMimic },
      king: { name: 'Leprechaun King', art: () => leprechaun(true) },
    },
    charms: {
      garlic: { name: 'Shamrock', icon: '☘️', color: '#c8f0c0', art: shamrock },
      salt: { name: 'Horseshoe', icon: '🧲', color: '#e0e4ea', art: horseshoe },
      bell: { name: 'Bell', icon: '🔔', color: '#f5c542' },
      candy: { name: 'Gold coin', icon: '🪙', color: '#fff3b0', art: coin },
      crystal: { name: 'Rainbow', icon: '🌈', color: '#c7e3ff', art: rainbow },
      bone: { name: 'Harp', icon: '🎵', color: '#ffe9b0', art: harp },
      herb: { name: 'Four-leaf clover', icon: '🍀', color: '#c8f0c0', art: clover4 },
      star: { name: 'Green hat', icon: '🎩', color: '#a8e6b0', art: hatCharm },
    },
    nights: [
      { title: 'Lucky Night', blurb: 'Tricksters want the gold! Shout out what they need and throw the right charms!' },
      { title: 'Misty Hills', blurb: 'The mist hides what some need. One of you sees it on your phone. Call it out!' },
      { title: 'End of the Rainbow', blurb: 'The Leprechaun King is coming. When he shows up, everyone hit LUCK at the same time!' },
    ],
    text: { foe: 'trickster', foes: 'tricksters', soul: 'LUCK', spooked: 'OOPS!' },
  },
  easter: {
    hall: { title: 'Egg Hunt Hallway', place: "the bunny burrow", wall: ['#4b3f8f', '#3f3478', '#ff9ad5'], symbols: [['egg', 'an egg', '🥚'], ['bunny', 'a bunny', '🐰'], ['tulip', 'a tulip', '🌷'], ['chick', 'a chick', '🐣'], ['carrot', 'a carrot', '🥕']].map(([id, name, icon]) => ({ id, name, icon })) },
    yard: { skies: [['#1b1640', '#4b3f8f', '#8a6fc7', '#2a4a2e', '#3a6a3a', '#5a8a4a', '#fff6e0', '#f0dcb0'], ['#141a30', '#3a4468', '#5a6a8a', '#22382c', '#2c4a35', '#47634a', '#e8ecf2', '#c9d0dc'], ['#1a1030', '#5a3f8f', '#c78ad5', '#2a4a2e', '#3a6a3a', '#5a8a4a', '#ffe0a8', '#f5c070']], prop: () => ell(0, -24, 18, 24, '#9ed3ff') + line('M-16 -28 Q0 -36 16 -28', '#2f80ed', 3) + [[-30, '#ff9ad5'], [30, '#ffe066']].map(([x, c]) => line(`M${x} 0 L${x} -26`, '#2f9e44', 4) + ell(x, -32, 9, 9, c, 3)).join('') },
    monsters: {
      ghost: { name: 'Bumblebee', art: () => wasp() },
      bat: { name: 'Crow', art: crow },
      skeleton: { name: 'Bunny Bandit', art: bunnyThief },
      zombie: { name: 'Frog', art: frog },
      spider: { name: 'Grumpy Chick', art: chickBully },
      witch: { name: 'Sneaky Fox', art: sneakyFox },
      king: { name: 'The Egg Snatcher', art: eggSnatcher },
    },
    charms: {
      garlic: { name: 'Blue egg', icon: '🥚', color: '#c7e3ff', art: egg('#9ed3ff', '#2f80ed') },
      salt: { name: 'Carrot', icon: '🥕', color: '#ffd9a8', art: carrot },
      bell: { name: 'Bell', icon: '🔔', color: '#f5c542' },
      candy: { name: 'Pink egg', icon: '🥚', color: '#ffd1e3', art: egg('#ff9ad5', '#d1237a') },
      crystal: { name: 'Tulip', icon: '🌷', color: '#c8f0c0', art: tulip },
      bone: { name: 'Choc bunny', icon: '🐰', color: '#e6c7a0', art: chocBunny },
      herb: { name: 'Basket', icon: '🧺', color: '#f3e2b8', art: basket },
      star: { name: 'Jelly beans', icon: '🍬', color: '#fff3b0', art: jellyBeans },
    },
    nights: [
      { title: 'Egg Hunt', blurb: 'Pests are after the eggs! Shout out what they need and throw the right charms!' },
      { title: 'Spring Showers', blurb: 'The rain hides what some need. One of you sees it on your phone. Call it out!' },
      { title: 'Easter Dawn', blurb: 'The Egg Snatcher is coming. When it shows up, everyone hit HOP at the same time!' },
    ],
    text: { foe: 'pest', foes: 'pests', soul: 'HOP', spooked: 'OOPS!' },
  },
  july4: {
    hall: { title: 'Firework Hallway', place: "the clubhouse", wall: ['#1f2f7a', '#18266a', '#e0302e'], symbols: [['star', 'a star', '⭐'], ['flag', 'a flag', '🇺🇸'], ['firework', 'a firework', '🎆'], ['eagle', 'an eagle', '🦅'], ['sun', 'a sun', '☀️']].map(([id, name, icon]) => ({ id, name, icon })) },
    yard: { skies: [['#0a1030', '#1f2f7a', '#3a4aa0', '#1d3a2a', '#26492f', '#3e5e3a', '#fff1c1', '#efdca0'], ['#0e1420', '#2b3448', '#4a5468', '#22302c', '#2c3b35', '#47534a', '#e8ecf2', '#c9d0dc'], ['#060a20', '#14205a', '#2340c8', '#1a3424', '#22442e', '#38583a', '#ffffff', '#c9ced6']], prop: () => line('M-24 0 L-24 -90', INK, 6) + path('M-24 -88 L30 -88 L30 -54 L-24 -54 Z', '#fff') + line('M-4 -80 L30 -80 M-4 -70 L30 -70 M-24 -60 L30 -60', '#e0302e', 4) + path('M-24 -88 L-4 -88 L-4 -70 L-24 -70 Z', '#2340c8', 3) },
    monsters: {
      ghost: { name: 'Mosquito', art: mosquito },
      bat: { name: 'Seagull', art: seagull },
      skeleton: { name: 'Ant', art: ant },
      zombie: { name: 'Raccoon', art: raccoonJ },
      spider: { name: 'Wasp', art: () => wasp() },
      witch: { name: 'Grill Bot', art: grillBot },
      king: { name: 'The Thunderstorm', art: () => stormCloud(true) },
    },
    charms: {
      garlic: { name: 'Bug spray', icon: '🧴', color: '#c8f0c0', art: bugSpray },
      salt: { name: 'Lemonade', icon: '🍋', color: '#fff6a8', art: lemonade },
      bell: { name: 'Bell', icon: '🔔', color: '#f5c542' },
      candy: { name: 'Flag', icon: '🇺🇸', color: '#c7d6ff', art: flag },
      crystal: { name: 'Watermelon', icon: '🍉', color: '#ffc2c2', art: watermelon },
      bone: { name: 'Hot dog', icon: '🌭', color: '#ffd9a8', art: hotdog },
      herb: { name: 'Fan', icon: '🪭', color: '#e3d6ff', art: fan },
      star: { name: 'Shades', icon: '🕶️', color: '#ffd84a', art: shades },
    },
    nights: [
      { title: 'Cookout', blurb: 'Pests want the cookout! Shout out what they need and throw the right charms!' },
      { title: 'Smoky Grill', blurb: 'Grill smoke hides what some need. One of you sees it on your phone. Call it out!' },
      { title: 'Fireworks', blurb: 'The Thunderstorm is rolling in. When it shows up, everyone hit BOOM at the same time!' },
    ],
    text: { foe: 'pest', foes: 'pests', soul: 'BOOM', spooked: 'OOPS!' },
  },
};

const HALLOWEEN = { text: { foe: 'monster', foes: 'monsters', soul: 'SOUL', spooked: 'SPOOKED!' } };

export const CANDLE_SKINS = SKINS;

/** The Last Candle skin for the theme on now. Halloween and the everyday set play the original. */
export const candleSkin = () => SKINS[season()] || HALLOWEEN;
