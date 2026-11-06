// Last Candle monsters, drawn in the same ink-outline cartoon style as the crew. Feet at (0, 0),
// about 150 units tall (the Pumpkin King is drawn at the same size and scaled up by the scene).

import { INK } from './cartoon.js';

const st = (fill, w = 5) => `fill="${fill}" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const ell = (cx, cy, rx, ry, fill, w = 5) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${st(fill, w)}/>`;
const dot = (cx, cy, r, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
const path = (d, fill, w = 5) => `<path d="${d}" ${st(fill, w)}/>`;
const line = (d, color, w) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const eyes = (y, dx = 14, r = 7, fill = INK) => `<g class="lc-eyes">${dot(-dx, y, r, fill)}${dot(dx, y, r, fill)}${dot(-dx + 2, y - 2, r * 0.35, '#fff')}${dot(dx + 2, y - 2, r * 0.35, '#fff')}</g>`;
const shadow = (rx = 46) => `<ellipse cx="0" cy="0" rx="${rx}" ry="10" fill="#000" fill-opacity=".3"/>`;

const ART = {
  ghost: () => shadow(36)
    + `<g class="lc-float">${path('M-46 -40 Q-50 -150 0 -156 Q50 -150 46 -40 Q36 -26 26 -40 Q14 -26 2 -40 Q-10 -26 -22 -40 Q-34 -26 -46 -40 Z', '#f4f4fb')}`
    + `${eyes(-108, 15, 8)}${ell(0, -78, 10, 13, '#3a2a4a', 4)}`
    + `${line('M-46 -96 Q-70 -104 -76 -124', INK, 18)}${line('M-46 -96 Q-70 -104 -76 -124', '#f4f4fb', 10)}</g>`,
  bat: () => shadow(28)
    + `<g class="lc-float"><g class="lc-flap-l">${path('M-16 -96 Q-50 -130 -92 -112 Q-78 -100 -80 -86 Q-66 -94 -56 -80 Q-46 -92 -18 -80 Z', '#3b2a5a')}</g>`
    + `<g class="lc-flap-r">${path('M16 -96 Q50 -130 92 -112 Q78 -100 80 -86 Q66 -94 56 -80 Q46 -92 18 -80 Z', '#3b2a5a')}</g>`
    + `${path('M-14 -122 L-24 -144 L-4 -128 Z M14 -122 L24 -144 L4 -128 Z', '#3b2a5a', 4)}${ell(0, -96, 28, 30, '#4b3670')}`
    + `${dot(-10, -102, 6, '#ff3b3b')}${dot(10, -102, 6, '#ff3b3b')}`
    + `${path('M-8 -84 L-4 -76 L0 -84 L4 -76 L8 -84', '#fff', 3)}</g>`,
  skeleton: () => shadow()
    + `${line('M-12 -60 L-16 -6 M12 -60 L16 -6', INK, 14)}${line('M-12 -60 L-16 -6 M12 -60 L16 -6', '#f2efe6', 7)}`
    + `${ell(-18, -4, 14, 7, '#f2efe6', 4)}${ell(18, -4, 14, 7, '#f2efe6', 4)}`
    + `${line('M-26 -104 Q-44 -80 -58 -96 M26 -104 Q44 -80 58 -96', INK, 14)}${line('M-26 -104 Q-44 -80 -58 -96 M26 -104 Q44 -80 58 -96', '#f2efe6', 7)}`
    + `${path('M-26 -112 L26 -112 L20 -62 L-20 -62 Z', '#2b2433')}`
    + `${line('M0 -110 L0 -62 M-18 -102 Q-8 -96 0 -100 Q8 -96 18 -102 M-16 -90 Q-8 -84 0 -88 Q8 -84 16 -90 M-14 -78 Q-6 -72 0 -76 Q6 -72 14 -78', '#f2efe6', 4)}`
    + `${path('M-30 -150 Q-32 -176 0 -178 Q32 -176 30 -150 Q30 -132 18 -126 L18 -116 L-18 -116 L-18 -126 Q-30 -132 -30 -150 Z', '#f2efe6')}`
    + `${ell(-12, -150, 9, 10, INK, 0)}${ell(12, -150, 9, 10, INK, 0)}${path('M-3 -136 L0 -142 L3 -136 Z', INK, 2)}`
    + `${line('M-10 -122 L-10 -116 M-3 -122 L-3 -116 M4 -122 L4 -116 M11 -122 L11 -116', INK, 2.5)}`,
  zombie: () => shadow()
    + `${path('M-24 -64 L-20 -6 L-4 -6 L-6 -64 Z M24 -64 L20 -6 L4 -6 L6 -64 Z', '#4a5a7a')}${ell(-14, -4, 14, 7, '#6b4e3d', 4)}${ell(14, -4, 14, 7, '#6b4e3d', 4)}`
    + `${path('M-32 -122 L32 -122 L34 -64 L22 -56 L14 -66 L4 -56 L-6 -66 L-16 -56 L-26 -64 L-34 -60 Z', '#8a6f9e')}`
    + `${line('M-30 -114 L-80 -104 M30 -114 L-30 -98', INK, 20)}${line('M-30 -114 L-80 -104 M30 -114 L-30 -98', '#8a6f9e', 12)}`
    + `${ell(-84, -103, 10, 9, '#8fc27a', 4)}${ell(-34, -97, 10, 9, '#8fc27a', 4)}`
    + `${ell(0, -156, 34, 36, '#8fc27a')}${path('M-34 -160 Q-30 -196 0 -192 Q24 -196 34 -164 Q20 -176 4 -172 Q-14 -182 -34 -160 Z', '#3a2a20', 4)}`
    + `${dot(-12, -156, 9, '#fff6c8')}${dot(12, -152, 6, '#fff6c8')}${dot(-12, -156, 3, INK)}${dot(12, -152, 2.5, INK)}`
    + `${line('M-12 -134 L12 -136', INK, 4)}${line('M18 -170 L28 -162 M22 -172 L20 -164', INK, 2.5)}`,
  spider: () => shadow(56)
    + [-1, 1].map((s) => [0, 1, 2, 3].map((k) => {
      const y = -54 + k * 10;
      const d = `M${s * 20} ${y} Q${s * (54 + k * 4)} ${y - 44 + k * 8} ${s * (66 + k * 4)} ${-4}`;
      return line(d, INK, 9);
    }).join('')).join('')
    + `<g class="lc-float">${ell(0, -60, 38, 32, '#2b2433')}${ell(0, -102, 24, 20, '#3a2f48')}`
    + `${dot(-9, -106, 6, '#ff3b3b')}${dot(9, -106, 6, '#ff3b3b')}${dot(-16, -96, 3.5, '#ff3b3b')}${dot(16, -96, 3.5, '#ff3b3b')}${dot(0, -96, 3.5, '#ff3b3b')}`
    + `${path('M-6 -86 L-3 -78 L0 -86 Z M6 -86 L3 -78 L0 -86 Z', '#fff', 2)}`
    + `${path('M-12 -66 L0 -44 L12 -66 L0 -58 Z', '#d33b3b', 3)}</g>`,
  witch: () => shadow()
    + `${line('M-60 -40 L60 -76', '#8b5a2b', 9)}${path('M60 -76 L90 -98 L96 -70 L88 -62 Z', '#c9a227', 4)}`
    + `${path('M-30 -118 L30 -118 L44 -8 Q0 2 -44 -8 Z', '#5b2a86')}`
    + `${line('M-28 -110 Q-46 -84 -30 -64 M28 -110 Q46 -84 30 -66', INK, 18)}${line('M-28 -110 Q-46 -84 -30 -64 M28 -110 Q46 -84 30 -66', '#5b2a86', 11)}`
    + `${ell(-30, -62, 9, 9, '#7ccf6a', 4)}${ell(30, -64, 9, 9, '#7ccf6a', 4)}`
    + `${path('M-36 -150 Q-44 -110 -30 -96 L30 -96 Q44 -110 36 -150 Z', '#e85d1e', 4)}`
    + `${ell(0, -146, 30, 32, '#7ccf6a')}${path('M2 -150 L18 -136 L4 -132 Z', '#6ab95a', 3.5)}`
    + `${eyes(-152, 12, 6)}${line('M-12 -126 Q0 -118 12 -126', INK, 4)}`
    + `${path('M-72 -168 Q0 -186 72 -168 Q76 -158 0 -158 Q-76 -158 -72 -168 Z', '#1f1630')}`
    + `${path('M-30 -170 Q-14 -226 18 -250 Q40 -258 38 -238 Q20 -236 18 -220 Q22 -196 30 -170 Z', '#1f1630')}`
    + `<rect x="-28" y="-184" width="56" height="10" fill="#3ddc97"/>`,
  king: () => shadow(80)
    + `${path('M-62 -120 L62 -120 Q90 -60 80 -6 Q0 8 -80 -6 Q-90 -60 -62 -120 Z', '#2a1838')}`
    + `${path('M-40 -120 L40 -120 Q56 -70 50 -14 Q0 -6 -50 -14 Q-56 -70 -40 -120 Z', '#7a1f2e', 4)}`
    + `${line('M-60 -110 Q-100 -90 -108 -120 M60 -110 Q100 -90 108 -120', INK, 22)}${line('M-60 -110 Q-100 -90 -108 -120 M60 -110 Q100 -90 108 -120', '#2a1838', 14)}`
    + `${ell(-108, -124, 12, 12, '#3a5a2c', 4)}${ell(108, -124, 12, 12, '#3a5a2c', 4)}`
    + `${ell(-36, -180, 40, 58, '#e8701a')}${ell(36, -180, 40, 58, '#e8701a')}${ell(0, -182, 44, 62, '#ff8f1f')}`
    + `<g class="lc-glow">${path('M-46 -204 L-14 -204 L-30 -178 Z M14 -204 L46 -204 L30 -178 Z', '#ffe066', 4)}`
    + `${path('M-8 -174 L0 -162 L8 -174 Z', '#ffe066', 3)}`
    + `${path('M-52 -152 Q0 -118 52 -152 L42 -136 L30 -146 L20 -128 L8 -142 L-4 -126 L-16 -142 L-28 -128 L-40 -146 Z', '#ffe066', 4)}</g>`
    + `${path('M-40 -236 L-44 -282 L-22 -258 L0 -292 L22 -258 L44 -282 L40 -236 Z', '#f5c542')}`
    + `${dot(-22, -250, 5, '#d33b3b')}${dot(0, -258, 6, '#3ddc97')}${dot(22, -250, 5, '#2f80ed')}`,
};

/** SVG markup (no wrapper) for a monster kind. */
export const monsterMarkup = (kind) => (ART[kind] || ART.ghost)();
