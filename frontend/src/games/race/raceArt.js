// Crew Fun Run drawing: a 2.5D look (ground and rocks with a top, a front and a side) and one theme per
// map, with layered scenery that slides at different speeds. Drawing only; the rules are in raceSim.

/** How far "into the screen" the track goes, in world units: across and up. */
export const DEPTH_X = 12;
export const DEPTH_Y = 22;

export const THEMES = {
  woods: {
    sky: ['#6fc3ff', '#d9f2ff'],
    sun: { x: 0.82, y: 0.18, r: 26, color: '#fff6c2' },
    far: '#8fc7a0',
    mid: '#5aa16a',
    top: '#6ccf3f',
    topEdge: '#4aa82c',
    front: '#9b6a3e',
    frontDark: '#7a5030',
    stone: '#b98a5c',
    rockFront: '#8d7a66',
    rockTop: '#b7a58c',
    rockSide: '#6c5c4c',
    spike: '#d7dce6',
    pit: '#2a1a10',
    scenery: 'trees',
  },
  canyon: {
    sky: ['#ff9a5a', '#ffd7a0'],
    sun: { x: 0.2, y: 0.22, r: 34, color: '#ffef9a' },
    far: '#d9825a',
    mid: '#b8573a',
    top: '#e3a25c',
    topEdge: '#c9853f',
    front: '#b4512f',
    frontDark: '#8e3b22',
    stone: '#d0703f',
    rockFront: '#a8452a',
    rockTop: '#d77b4a',
    rockSide: '#7e3018',
    spike: '#f1e6c8',
    pit: '#3a140a',
    scenery: 'cacti',
  },
  summit: {
    sky: ['#1d2350', '#5b6aa8'],
    sun: { x: 0.78, y: 0.2, r: 20, color: '#f4f2ff' },
    far: '#8892c4',
    mid: '#55609a',
    top: '#f3f8ff',
    topEdge: '#cfdcf2',
    front: '#7b8bb0',
    frontDark: '#5e6d93',
    stone: '#9aa8c8',
    rockFront: '#8a98bd',
    rockTop: '#eef4ff',
    rockSide: '#647196',
    spike: '#bfe6ff',
    pit: '#121630',
    scenery: 'pines',
    snow: true,
  },
};

/** A fixed pseudo-random number 0-1 for an integer, so scenery stays put as the camera moves. */
const hash = (n) => {
  let h = Math.imul(n ^ 0x5bd1e995, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x165667b1);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

/** Sky, sun or moon, and two layers of far scenery that slide slower than the track. */
export function drawBackdrop(ctx, theme, width, height, groundY, camera, scale, tick) {
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, theme.sky[0]);
  sky.addColorStop(1, theme.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  if (theme.snow) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 40; i += 1) {
      const sx = ((hash(i) * width * 1.3 - camera * scale * 0.05) % width + width) % width;
      ctx.fillRect(sx, hash(i + 99) * groundY * 0.7, 1.5, 1.5);
    }
  }
  const { sun } = theme;
  ctx.fillStyle = sun.color;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(width * sun.x, groundY * sun.y * 2, sun.r * 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(width * sun.x, groundY * sun.y * 2, sun.r, 0, Math.PI * 2);
  ctx.fill();

  // Far layer.
  const farShift = camera * 0.15 * scale;
  ctx.fillStyle = theme.far;
  for (let i = -1; i < width / (260 * scale) + 2; i += 1) {
    const n = i + Math.floor(farShift / (260 * scale));
    const x = n * 260 * scale - farShift;
    const h = (120 + hash(n) * 110) * scale;
    const w = 260 * scale;
    ctx.beginPath();
    if (theme.scenery === 'cacti') {
      // Flat-topped mesas.
      ctx.moveTo(x - w * 0.1, groundY);
      ctx.lineTo(x + w * 0.15, groundY - h);
      ctx.lineTo(x + w * 0.7, groundY - h);
      ctx.lineTo(x + w * 1.05, groundY);
    } else {
      ctx.moveTo(x - w * 0.3, groundY);
      ctx.lineTo(x + w * 0.35, groundY - h);
      ctx.lineTo(x + w * 1.0, groundY);
    }
    ctx.fill();
    if (theme.scenery === 'pines') {
      // Snow caps.
      ctx.fillStyle = '#eef3ff';
      ctx.beginPath();
      ctx.moveTo(x + w * 0.35, groundY - h);
      ctx.lineTo(x + w * 0.35 - w * 0.13, groundY - h + h * 0.2);
      ctx.lineTo(x + w * 0.35 + w * 0.13, groundY - h + h * 0.2);
      ctx.fill();
      ctx.fillStyle = theme.far;
    }
  }

  // Middle layer: rolling ground with trees, cacti or pines on it.
  const midShift = camera * 0.4 * scale;
  ctx.fillStyle = theme.mid;
  ctx.fillRect(0, groundY - 34 * scale, width, 40 * scale);
  for (let i = -1; i < width / (110 * scale) + 2; i += 1) {
    const n = i + Math.floor(midShift / (110 * scale));
    const x = n * 110 * scale - midShift + hash(n + 7) * 40 * scale;
    const base = groundY - 30 * scale;
    const size = (0.7 + hash(n + 3) * 0.6) * scale;
    ctx.fillStyle = theme.mid;
    ctx.beginPath();
    ctx.ellipse(x, base + 6 * scale, 70 * scale, 22 * scale, 0, Math.PI, 0);
    ctx.fill();
    if (hash(n + 11) < 0.55) drawScenery(ctx, theme, x, base, size, tick, n);
  }
}

function drawScenery(ctx, theme, x, base, s, tick, n) {
  if (theme.scenery === 'trees') {
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(x - 4 * s, base - 30 * s, 8 * s, 30 * s);
    const sway = Math.sin((tick + n * 13) / 30) * 1.5 * s;
    [[0, -48, 22, '#3f8f45'], [-12, -38, 16, '#4ea653'], [12, -38, 16, '#368040']].forEach(([dx, dy, r, c]) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x + dx * s + sway, base + dy * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (theme.scenery === 'cacti') {
    ctx.fillStyle = '#4e8a3a';
    const r = 5 * s;
    ctx.fillRect(x - r, base - 46 * s, r * 2, 46 * s);
    ctx.fillRect(x - 16 * s, base - 32 * s, 6 * s, 16 * s);
    ctx.fillRect(x - 16 * s, base - 22 * s, 12 * s, 6 * s);
    ctx.fillRect(x + 10 * s, base - 38 * s, 6 * s, 14 * s);
    ctx.fillRect(x + 4 * s, base - 28 * s, 12 * s, 6 * s);
  } else {
    ctx.fillStyle = '#2d4a5e';
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x, base - (58 - i * 14) * s);
      ctx.lineTo(x - (14 + i * 5) * s, base - (30 - i * 12) * s);
      ctx.lineTo(x + (14 + i * 5) * s, base - (30 - i * 12) * s);
      ctx.fill();
    }
    ctx.fillStyle = '#f4f8ff';
    ctx.beginPath();
    ctx.moveTo(x, base - 58 * s);
    ctx.lineTo(x - 6 * s, base - 48 * s);
    ctx.lineTo(x + 6 * s, base - 48 * s);
    ctx.fill();
  }
}

/** A box with a front, a top and a right side. Front from (x, yTop) to (x + w, yBottom), in pixels. */
export function block(ctx, x, yTop, w, yBottom, dx, dy, front, top, side) {
  ctx.fillStyle = side;
  ctx.beginPath();
  ctx.moveTo(x + w, yTop);
  ctx.lineTo(x + w + dx, yTop - dy);
  ctx.lineTo(x + w + dx, yBottom - dy);
  ctx.lineTo(x + w, yBottom);
  ctx.fill();
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.moveTo(x, yTop);
  ctx.lineTo(x + dx, yTop - dy);
  ctx.lineTo(x + w + dx, yTop - dy);
  ctx.lineTo(x + w, yTop);
  ctx.fill();
  ctx.fillStyle = front;
  ctx.fillRect(x, yTop, w, yBottom - yTop);
}

/** Stones and darker streaks on a dirt or rock front, fixed to the world so they scroll with it. */
export function texture(ctx, theme, worldLeft, worldRight, sx, top, bottom, scale) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(sx(worldLeft), top, (worldRight - worldLeft) * scale, bottom - top);
  ctx.clip();
  const first = Math.floor(worldLeft / 40);
  for (let n = first; n * 40 < worldRight; n += 1) {
    const x = sx(n * 40 + hash(n) * 30);
    const y = top + (6 + hash(n + 5) * 0.8 * (bottom - top - 6));
    const r = (3 + hash(n + 9) * 5) * scale;
    ctx.fillStyle = hash(n + 2) < 0.5 ? theme.stone : theme.frontDark;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.4, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
