// Gift Wrap Rush art, as SVG strings (shared by the TV, the intro and the phone buttons).
// Presents stand with their bottom at 0,0.
import { dot, ell, line, path } from '../inkArt';
import { INK } from '../cartoon';
import { OPTIONS } from './giftRush';

const hexOf = (job, id) => OPTIONS[job].find((o) => o.id === id)?.hex || '#ccc';

export const toyArt = (toy) => {
  switch (toy) {
    case 'bear': return ell(0, -26, 26, 24, '#a86b3c') + ell(-20, -64, 9, 9, '#a86b3c') + ell(20, -64, 9, 9, '#a86b3c') + ell(0, -52, 22, 20, '#b97a48') + dot(-8, -56, 3.5, INK) + dot(8, -56, 3.5, INK) + ell(0, -46, 7, 5, '#e9c9a0', 3) + dot(0, -48, 2.5, INK);
    case 'train': return path('M-40 -10 L-40 -46 L4 -46 L4 -30 L36 -30 L36 -10 Z', '#d33b3b') + path('M-36 -46 L-36 -66 L-6 -66 L-6 -46 Z', '#2f6bff') + path('M14 -30 L14 -52 L26 -52 L26 -30 Z', INK, 0) + ell(-24, -8, 10, 10, '#333') + ell(18, -8, 10, 10, '#333') + dot(-24, -8, 3, '#f2b632') + dot(18, -8, 3, '#f2b632');
    case 'ball': return ell(0, -32, 30, 30, '#ff5a4e') + line('M-30 -32 Q0 -14 30 -32 M0 -62 Q-14 -32 0 -2', '#fff', 7) + line('M-30 -32 Q0 -14 30 -32 M0 -62 Q-14 -32 0 -2', INK, 2);
    case 'robot': return path('M-24 -4 L-24 -44 L24 -44 L24 -4 Z', '#b8c4d6') + path('M-18 -48 L-18 -76 L18 -76 L18 -48 Z', '#d6dee8') + dot(-8, -62, 5, '#4ea8ff') + dot(8, -62, 5, '#4ea8ff') + line('M0 -76 L0 -88', INK, 4) + dot(0, -90, 5, '#ff5a4e') + line('M-12 -26 L12 -26', INK, 4);
    case 'duck': return ell(0, -24, 30, 20, '#ffd23f') + ell(16, -52, 16, 16, '#ffd23f') + path('M30 -54 L46 -50 L30 -44 Z', '#f5a623', 3) + dot(20, -56, 3.5, INK);
    default: return ell(0, -8, 30, 10, '#d33b3b') + path('M-30 -8 L-30 -48 L30 -48 L30 -8 Z', '#d33b3b', 0) + line('M-30 -8 L-30 -48 M30 -8 L30 -48', INK, 5) + ell(0, -48, 30, 10, '#f4ead2') + line('M-30 -14 L-14 -42 L0 -14 L14 -42 L30 -14', '#f2b632', 4) + line('M-10 -54 L-30 -80 M10 -54 L30 -80', '#8b5a2b', 5);
  }
};

const SIZES = { cube: [104, 96], tall: [78, 140], long: [150, 74], round: [112, 92] };
export const boxSize = (box) => SIZES[box] || SIZES.cube;

// Paper patterns, one per color, so the colors read even for color-blind players.
const pattern = (wrap, w, h) => {
  const out = [];
  if (wrap === 'red') for (let x = -w / 2 - h; x < w / 2; x += 22) out.push(line(`M${x} 0 L${x + h} ${-h}`, '#fff', 7));
  if (wrap === 'green') for (let y = -h + 14; y < -6; y += 24) for (let x = -w / 2 + 12; x < w / 2 - 6; x += 24) out.push(dot(x + ((y / 24) % 2 ? 12 : 0), y, 4.5, '#e9f7ec'));
  if (wrap === 'blue') for (let y = -h + 20; y < -10; y += 34) for (let x = -w / 2 + 18; x < w / 2 - 10; x += 34) out.push(line(`M${x - 8} ${y} L${x + 8} ${y} M${x} ${y - 8} L${x} ${y + 8} M${x - 6} ${y - 6} L${x + 6} ${y + 6} M${x + 6} ${y - 6} L${x - 6} ${y + 6}`, '#dbe8ff', 3));
  if (wrap === 'gold') {
    for (let x = -w / 2 + 16; x < w / 2; x += 26) out.push(line(`M${x} ${-h} L${x} 0`, '#c98a12', 4));
    for (let y = -h + 16; y < 0; y += 26) out.push(line(`M${-w / 2} ${y} L${w / 2} ${y}`, '#c98a12', 4));
  }
  return out.join('');
};

/** A present at any stage. done: { box, wrap, bow, tag } (the choices made so far). */
export const presentArt = (toy, done) => {
  if (!done.box) return toyArt(toy);
  const [w, h] = boxSize(done.box);
  const fill = done.wrap ? hexOf('wrap', done.wrap) : '#c8935a';
  const clip = `gp-${done.box}-${done.wrap || 'x'}`;
  let out = '';
  if (done.box === 'round') {
    out += `<clipPath id="${clip}"><path d="M${-w / 2} ${-h + 14} L${-w / 2} -14 A${w / 2} 14 0 0 0 ${w / 2} -14 L${w / 2} ${-h + 14} Z"/></clipPath>`;
    out += path(`M${-w / 2} ${-h + 14} L${-w / 2} -14 A${w / 2} 14 0 0 0 ${w / 2} -14 L${w / 2} ${-h + 14} Z`, fill);
    out += `<g clip-path="url(#${clip})">${done.wrap ? pattern(done.wrap, w, h) : ''}</g>`;
    out += ell(0, -h + 14, w / 2, 14, done.wrap ? fill : '#d9a56a');
  } else {
    out += `<clipPath id="${clip}"><rect x="${-w / 2}" y="${-h}" width="${w}" height="${h}"/></clipPath>`;
    out += path(`M${-w / 2} 0 L${-w / 2} ${-h} L${w / 2} ${-h} L${w / 2} 0 Z`, fill);
    out += `<g clip-path="url(#${clip})">${done.wrap ? pattern(done.wrap, w, h) : line(`M${-w / 2} ${-h + 18} L${w / 2} ${-h + 18}`, '#a8703a', 4) + line(`M0 ${-h} L0 ${-h + 18}`, '#a8703a', 4)}</g>`;
    out += path(`M${-w / 2} 0 L${-w / 2} ${-h} L${w / 2} ${-h} L${w / 2} 0 Z`, 'none');
  }
  if (done.bow) {
    const b = hexOf('bow', done.bow);
    out += `<rect x="-8" y="${-h + (done.box === 'round' ? 14 : 0)}" width="16" height="${h - (done.box === 'round' ? 14 : 0)}" fill="${b}" stroke="${INK}" stroke-width="3"/>`;
    if (done.box !== 'round') out += `<rect x="${-w / 2}" y="${-h / 2 - 8}" width="${w}" height="16" fill="${b}" stroke="${INK}" stroke-width="3"/>`;
    out += path(`M0 ${-h} Q-34 ${-h - 34} -34 ${-h - 8} Q-20 ${-h + 4} 0 ${-h} Z`, b, 4) + path(`M0 ${-h} Q34 ${-h - 34} 34 ${-h - 8} Q20 ${-h + 4} 0 ${-h} Z`, b, 4)
      + line(`M-2 ${-h + 2} L-14 ${-h + 24} M2 ${-h + 2} L14 ${-h + 24}`, b, 6) + ell(0, -h, 9, 8, b, 4);
  }
  if (done.tag) {
    const name = OPTIONS.tag.find((o) => o.id === done.tag)?.name || '';
    const tx = w / 2 - 6;
    const ty = -h + 26;
    out += line(`M6 ${-h + 2} Q${tx - 10} ${-h} ${tx} ${ty - 8}`, INK, 2);
    out += `<g transform="translate(${tx} ${ty}) rotate(12)">${path('M-4 -12 L44 -12 L44 14 L-4 14 L-14 1 Z', '#fff6e3', 3)}<text x="16" y="2" font-size="15" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${INK}">${name}</text></g>`;
  }
  return out;
};

/** Small icons for the order card and phone buttons, about 60 wide, centered on 0,0. */
export const choiceArt = (job, id) => {
  if (job === 'box') {
    const h = boxSize(id)[1];
    const k = 0.5;
    return `<g transform="translate(0 ${(h * k) / 2}) scale(${k})">${presentArt('ball', { box: id })}</g>`;
  }
  if (job === 'wrap') return `<g transform="translate(0 30) scale(0.55)">${presentArt('ball', { box: 'cube', wrap: id })}</g>`;
  if (job === 'bow') {
    const b = hexOf('bow', id);
    return path('M0 4 Q-38 -32 -36 -2 Q-26 16 0 4 Z', b, 4) + path('M0 4 Q38 -32 36 -2 Q26 16 0 4 Z', b, 4) + line('M-3 6 L-16 30 M3 6 L16 30', INK, 10) + line('M-3 6 L-16 30 M3 6 L16 30', b, 5) + ell(0, 4, 9, 8, b, 4);
  }
  const name = OPTIONS.tag.find((o) => o.id === id)?.name || '';
  return path('M-24 -16 L38 -16 L38 16 L-24 16 L-38 0 Z', '#fff6e3', 4) + dot(-26, 0, 4, INK) + `<text x="6" y="1" font-size="20" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${INK}">${name}</text>`;
};

const rnd = (i) => { const x = Math.sin(i * 91.7 + 13.3) * 43758.5453; return x - Math.floor(x); };

/** The workshop: plank walls, frosty windows, garland and the tree. Static, so built once. */
export const workshopArt = (() => {
  let out = '';
  out += '<rect width="1920" height="1080" fill="#7a3f22"/>';
  for (let x = 0; x < 1920; x += 96) out += `<rect x="${x}" y="0" width="96" height="700" fill="${x % 192 ? '#83472a' : '#77401f'}"/>${line(`M${x} 0 L${x} 700`, '#5a2e16', 4)}`;
  // windows with snow falling outside
  [[300, 250], [960, 230], [1560, 250]].forEach(([cx, cy], k) => {
    out += `<rect x="${cx - 150}" y="${cy - 110}" width="300" height="220" rx="16" fill="#1a2a5a" stroke="${INK}" stroke-width="8"/>`;
    out += `<path d="M${cx - 146} ${cy + 106} Q${cx - 60} ${cy + 70} ${cx} ${cy + 92} Q${cx + 80} ${cy + 66} ${cx + 146} ${cy + 100} L${cx + 146} ${cy + 106} Z" fill="#eef4ff"/>`;
    for (let i = 0; i < 16; i += 1) out += `<circle class="gr-snow" style="animation-delay:${(-rnd(i + k * 20) * 4).toFixed(2)}s" cx="${cx - 140 + rnd(i + k * 50) * 280}" cy="${cy - 100 + rnd(i + k * 70) * 120}" r="${2 + rnd(i) * 3}" fill="#fff"/>`;
    out += line(`M${cx} ${cy - 110} L${cx} ${cy + 110} M${cx - 150} ${cy} L${cx + 150} ${cy}`, '#5a2e16', 10);
    out += `<rect x="${cx - 150}" y="${cy - 110}" width="300" height="220" rx="16" fill="none" stroke="${INK}" stroke-width="8"/>`;
    out += path(`M${cx - 170} ${cy + 110} L${cx + 170} ${cy + 110} L${cx + 160} ${cy + 130} L${cx - 160} ${cy + 130} Z`, '#f4f4f8');
  });
  // garland with lights along the top
  out += line('M0 40 Q160 110 320 40 Q480 110 640 40 Q800 110 960 40 Q1120 110 1280 40 Q1440 110 1600 40 Q1760 110 1920 40', '#1f5a32', 26);
  out += line('M0 40 Q160 110 320 40 Q480 110 640 40 Q800 110 960 40 Q1120 110 1280 40 Q1440 110 1600 40 Q1760 110 1920 40', '#2f7a46', 14);
  for (let i = 0; i < 24; i += 1) {
    const x = 40 + i * 80;
    const u = ((x % 320) / 320);
    const y = 40 + 70 * 4 * u * (1 - u) * 0.75 + 10;
    out += `<circle class="gr-bulb gr-b${i % 3}" cx="${x}" cy="${y}" r="10" fill="${['#ff5a4e', '#ffd23f', '#4ea8ff', '#3ddc97'][i % 4]}" stroke="${INK}" stroke-width="3"/>`;
  }
  // floor
  out += '<rect y="700" width="1920" height="380" fill="#5a3418"/>';
  for (let y = 720; y < 1080; y += 44) out += line(`M0 ${y} L1920 ${y}`, '#4a2a12', 4);
  // the toy chute on the left
  out += path('M30 0 L190 0 L190 560 L150 640 L70 640 L30 560 Z', '#9a9fb0', 7) + line('M50 40 L50 540 M170 40 L170 540', '#7a7f90', 6) + path('M60 600 L160 600 L150 640 L70 640 Z', '#d33b3b', 5);
  return out;
})();

export const sleighArt = (() => path('M-120 -10 L130 -10 Q190 -20 196 -90 L170 -90 Q160 -50 120 -50 L-80 -50 Q-120 -50 -120 -10 Z', '#d33b3b', 7)
  + path('M-110 -50 L-110 -150 Q-110 -170 -90 -170 L-60 -170 L-60 -50 Z', '#b82a2a', 7)
  + line('M-130 20 L170 20 Q210 20 214 -10', INK, 14) + line('M-130 20 L170 20 Q210 20 214 -10', '#f2b632', 7)
  + line('M-80 -10 L-80 20 M80 -10 L80 20', INK, 8)
  + line('M-100 -110 L-70 -110', '#f2b632', 6) + dot(-40, -76, 8, '#f2b632') + dot(40, -76, 8, '#f2b632') + dot(110, -76, 8, '#f2b632'))();
