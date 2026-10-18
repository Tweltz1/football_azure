import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CREW } from '../data/crew';
import { blip, guySound, taDa } from '../sound/crewSound';
import { SHRED, shredDetail, shredGround, shredScore, shredStart, shredStep } from './sim.generated';
import { readClimber, saveClimber, useFixedLoop } from './gameRunners';
import { drawBackdrop, THEMES } from './race/raceArt';

// A sunny day on the slopes: the summit's peaks and pines with a daytime sky.
const SNOW = {
  ...THEMES.summit,
  sky: ['#5fb4f5', '#dff2ff'],
  sun: { x: 0.8, y: 0.16, r: 24, color: '#fff7c4' },
  far: '#b8cde6',
  mid: '#8eb0cf',
  snow: false,
};

/** How much of the world fits across the screen (less on a phone, so the rider isn't tiny). */
const viewWidth = (canvas) => (canvas.width / Math.min(2, window.devicePixelRatio || 1) < 520 ? 560 : 760);

const hitLine = (s) => {
  switch (s.hitBy) {
    case 'rock': return 'Caught an edge on a rock!';
    case 'stump': return 'Tripped on a stump!';
    case 'tree': return 'Hugged a tree!';
    case 'snowman': return 'Wiped out the snowman (and yourself)!';
    case 'snowball': return 'Flattened by a giant snowball!';
    case 'hotdog': return 'Blown up by a hot dog!';
    case 'gap': return 'Down the crevasse!';
    case 'cliff': return 'Face-first into the cliff!';
    default: return 'Ten minutes on the mountain. Legend!';
  }
};

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

function drawFootball(ctx, x, y, r, spin) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.fillStyle = '#8a4b22';
  ctx.strokeStyle = '#3d1d0a';
  ctx.lineWidth = Math.max(1, r * 0.15);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.25, r * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, r * 0.13);
  ctx.beginPath();
  ctx.moveTo(-r * 0.45, 0);
  ctx.lineTo(r * 0.45, 0);
  for (let i = -2; i <= 2; i += 1) {
    ctx.moveTo(i * r * 0.18, -r * 0.2);
    ctx.lineTo(i * r * 0.18, r * 0.2);
  }
  ctx.stroke();
  ctx.restore();
}

function drawObstacle(ctx, o, sx, sy, k, tick) {
  const x = sx(o.x);
  const y = sy(o.y);
  const w = o.w * k;
  const h = o.h * k;
  if (o.kind === 'rock') {
    ctx.fillStyle = '#7d8696';
    ctx.beginPath();
    ctx.moveTo(x - w * 0.6, y + 2);
    ctx.lineTo(x - w * 0.4, y - h * 0.8);
    ctx.lineTo(x + w * 0.05, y - h);
    ctx.lineTo(x + w * 0.5, y - h * 0.6);
    ctx.lineTo(x + w * 0.6, y + 2);
    ctx.fill();
    ctx.fillStyle = '#f4f8ff';
    ctx.beginPath();
    ctx.moveTo(x - w * 0.4, y - h * 0.8);
    ctx.lineTo(x + w * 0.05, y - h);
    ctx.lineTo(x + w * 0.3, y - h * 0.75);
    ctx.lineTo(x - w * 0.1, y - h * 0.68);
    ctx.fill();
  } else if (o.kind === 'tree') {
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(x - w * 0.12, y - h * 0.25, w * 0.24, h * 0.27);
    for (let i = 0; i < 3; i += 1) {
      ctx.fillStyle = i % 2 ? '#2f7a45' : '#276b3b';
      ctx.beginPath();
      ctx.moveTo(x, y - h - 4 * k + i * h * 0.22);
      ctx.lineTo(x - w * (0.55 + i * 0.15), y - h * (0.42 - i * 0.12));
      ctx.lineTo(x + w * (0.55 + i * 0.15), y - h * (0.42 - i * 0.12));
      ctx.fill();
    }
    ctx.fillStyle = '#f4f8ff';
    ctx.beginPath();
    ctx.moveTo(x, y - h - 4 * k);
    ctx.lineTo(x - w * 0.25, y - h * 0.8);
    ctx.lineTo(x + w * 0.25, y - h * 0.8);
    ctx.fill();
  } else if (o.kind === 'snowman') {
    ctx.fillStyle = '#fbfdff';
    ctx.strokeStyle = '#b9c8dc';
    ctx.lineWidth = 1.5;
    [[0.24, 0.5], [0.62, 0.36], [0.88, 0.26]].forEach(([at, r]) => {
      ctx.beginPath();
      ctx.arc(x, y - h * at, w * r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    // Chrome's pink scarf.
    ctx.fillStyle = '#ff5fa2';
    ctx.fillRect(x - w * 0.3, y - h * 0.76, w * 0.6, h * 0.07);
    ctx.fillStyle = '#ff8a1f';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.1, y - h * 0.88);
    ctx.lineTo(x + w * 0.5, y - h * 0.86);
    ctx.lineTo(x + w * 0.1, y - h * 0.83);
    ctx.fill();
  } else if (o.kind === 'stump') {
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(x - w * 0.4, y - h, w * 0.8, h + 2);
    ctx.fillStyle = '#5a3a1f';
    ctx.fillRect(x - w * 0.4, y - h * 0.5, w * 0.8, 2 * k);
    ctx.fillStyle = '#d9b07a';
    ctx.beginPath();
    ctx.ellipse(x, y - h, w * 0.4, 5 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#a9773f';
    ctx.lineWidth = 1.2 * k;
    ctx.beginPath();
    ctx.ellipse(x, y - h, w * 0.2, 2.5 * k, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#f7fbff';
    ctx.beginPath();
    ctx.ellipse(x - w * 0.08, y - h - 2 * k, w * 0.26, 3 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (o.kind === 'sled' || o.kind === 'launcher') {
    // A red sled, with a gift box riding in it (the launcher's box shakes before it fires).
    ctx.strokeStyle = '#4b3a2a';
    ctx.lineWidth = 2.5 * k;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.55, y - 2 * k);
    ctx.lineTo(x + w * 0.4, y - 2 * k);
    ctx.quadraticCurveTo(x + w * 0.58, y - 2 * k, x + w * 0.56, y - 12 * k);
    ctx.stroke();
    ctx.fillStyle = '#d63a2f';
    ctx.fillRect(x - w * 0.5, y - 14 * k, w, 9 * k);
    ctx.fillStyle = '#a82820';
    ctx.fillRect(x - w * 0.5, y - 7 * k, w, 2 * k);
    if (o.gift || o.kind === 'launcher') {
      const big = o.kind === 'launcher';
      const bw = w * (big ? 0.62 : 0.5);
      const bh = h - 14 * k - (big ? 0 : 4 * k);
      const shake = big && o.shot - tick < 12 ? Math.sin(tick * 2) * 2 * k : 0;
      const bx = x - bw / 2 + shake;
      const by = y - 14 * k - bh;
      ctx.fillStyle = big ? '#7b4fe0' : '#2f9e5b';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(bx + bw * 0.42, by, bw * 0.16, bh);
      ctx.fillRect(bx, by + bh * 0.4, bw, bh * 0.16);
      ctx.beginPath();
      ctx.ellipse(bx + bw * 0.38, by - 3 * k, 6 * k, 4 * k, -0.5, 0, Math.PI * 2);
      ctx.ellipse(bx + bw * 0.62, by - 3 * k, 6 * k, 4 * k, 0.5, 0, Math.PI * 2);
      ctx.fill();
      if (big) {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(12 * k)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('?', bx + bw / 2, by + bh * 0.36);
      }
    }
  } else {
    const r = w / 2;
    ctx.fillStyle = '#f7fbff';
    ctx.strokeStyle = '#a9bdd6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - r, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const spin = -tick * 0.12;
    ctx.beginPath();
    ctx.arc(x, y - r, r * 0.6, spin, spin + 1.6);
    ctx.stroke();
  }
}

function hotDogShape(ctx, x, y, k, angle, tick) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#e8b064';
  ctx.beginPath();
  ctx.ellipse(0, 3 * k, 17 * k, 7 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c4452c';
  ctx.beginPath();
  ctx.ellipse(0, 0, 19 * k, 5 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 2 * k;
  ctx.beginPath();
  ctx.moveTo(-12 * k, -1 * k);
  for (let i = -8; i <= 12; i += 5) ctx.lineTo(i * k, (i % 2 ? -3 : 1) * k);
  ctx.stroke();
  // A lit fuse.
  ctx.fillStyle = tick % 4 < 2 ? '#ffef5a' : '#ff8a1f';
  ctx.beginPath();
  ctx.arc(18 * k, -6 * k, 3.5 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHotDog(ctx, d, sx, sy, k, tick) {
  const x = sx(d.x);
  if (d.boom === 0 && d.sky) {
    // Where it's going to land.
    const left = (d.ground - d.y) / 440;
    ctx.fillStyle = `rgba(220, 30, 30, ${0.25 + 0.35 * (1 - left)})`;
    ctx.beginPath();
    ctx.ellipse(x, sy(d.ground), SHRED.blastRadius * k * (1.1 - left * 0.5), 6 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    hotDogShape(ctx, x, sy(d.y), k, tick * 0.25, tick);
  } else if (d.boom === 0 && !d.landed) {
    hotDogShape(ctx, x, sy(d.y) - 6 * k, k, tick * 0.3, tick);
  } else if (d.boom === 0) {
    // Sitting on the snow, fuse burning down: blinks faster as it gets close.
    const urgent = d.fuse < SHRED.fuse / 3;
    const on = urgent ? tick % 4 < 2 : tick % 10 < 5;
    ctx.fillStyle = `rgba(220, 30, 30, ${on ? 0.45 : 0.2})`;
    ctx.beginPath();
    ctx.ellipse(x, sy(d.y), SHRED.blastRadius * k, 6 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    hotDogShape(ctx, x, sy(d.y) - 7 * k, k, 0, tick);
    ctx.fillStyle = on ? '#ff3d1f' : '#fff';
    ctx.font = `bold ${Math.round(13 * k)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3 * k;
    ctx.strokeStyle = '#16122b';
    ctx.strokeText(String(Math.ceil(d.fuse / 30) || '!'), x, sy(d.y) - 22 * k);
    ctx.fillText(String(Math.ceil(d.fuse / 30) || '!'), x, sy(d.y) - 22 * k);
  } else {
    const t = d.boom / (SHRED.blastTicks + 6);
    const y = sy(d.ground) - 10 * k;
    const r = SHRED.blastRadius * k * (0.6 + t * 0.7);
    ctx.globalAlpha = Math.max(0, 1 - t);
    [['#ff3d1f', 1], ['#ff9a1f', 0.72], ['#fff27a', 0.42]].forEach(([c, f]) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, r * f, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }
}

/** A fixed pseudo-random number 0-1 for an integer, so stones stay put as the camera moves. */
const hash = (n) => {
  let h = Math.imul(n ^ 0x5bd1e995, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x165667b1);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

/** The snow cap along a top edge, with little icicle scallops hanging under it. */
function snowCap(ctx, x0, y0, x1, y1, k) {
  const thick = 14 * k;
  ctx.fillStyle = '#f7fbff';
  ctx.beginPath();
  ctx.moveTo(x0, y0 - 2);
  ctx.lineTo(x1, y1 - 2);
  ctx.lineTo(x1, y1 + thick);
  const step = 16 * k;
  const n = Math.max(1, Math.round((x1 - x0) / step));
  for (let i = n; i >= 0; i -= 1) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t + thick;
    ctx.lineTo(x, y + (i % 2 ? 6 * k : 0));
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#c3d8ee';
  ctx.lineWidth = 1.5 * k;
  ctx.beginPath();
  ctx.moveTo(x0, y0 - 2);
  ctx.lineTo(x1, y1 - 2);
  ctx.stroke();
}

function drawSlope(ctx, g, sx, sy, k, height, rock) {
  const x0 = sx(g.x0);
  const x1 = sx(g.x1);
  ctx.fillStyle = rock;
  ctx.beginPath();
  ctx.moveTo(x0, sy(g.y0));
  ctx.lineTo(x1, sy(g.y1));
  ctx.lineTo(x1, height + 10);
  ctx.lineTo(x0, height + 10);
  ctx.fill();
  // Stones in the rock face, fixed to the world.
  ctx.save();
  ctx.clip();
  for (let n = Math.floor(g.x0 / 46); n * 46 < g.x1; n += 1) {
    for (let row = 0; row < 4; row += 1) {
      const wx = n * 46 + hash(n * 7 + row) * 30;
      const top = g.y0 + ((g.y1 - g.y0) * (wx - g.x0)) / (g.x1 - g.x0);
      const r = (6 + hash(n * 13 + row) * 7) * k;
      ctx.fillStyle = hash(n * 3 + row) < 0.5 ? '#a27a52' : '#5e4129';
      ctx.beginPath();
      ctx.ellipse(sx(wx), sy(top + 30 + row * 42 + hash(n + row * 5) * 20), r * 1.3, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  snowCap(ctx, x0, sy(g.y0), x1, sy(g.y1), k);
}

const WOOD = '#c98a4b';
const WOOD_DARK = '#7c4f26';

/** Cross-braced wooden legs from a deck down to `bottom` (pixels). */
function trestle(ctx, xa, ya, xb, yb, bottom, k) {
  ctx.strokeStyle = WOOD_DARK;
  ctx.lineWidth = 4 * k;
  ctx.beginPath();
  ctx.moveTo(xa, ya);
  ctx.lineTo(xa, bottom);
  ctx.moveTo(xb, yb);
  ctx.lineTo(xb, bottom);
  ctx.stroke();
  ctx.lineWidth = 2.5 * k;
  ctx.strokeStyle = WOOD;
  const step = 46 * k;
  for (let y = Math.min(ya, yb); y < bottom; y += step) {
    ctx.beginPath();
    ctx.moveTo(xa, Math.max(ya, y));
    ctx.lineTo(xb, Math.max(yb, y + step));
    ctx.moveTo(xb, Math.max(yb, y));
    ctx.lineTo(xa, Math.max(ya, y + step));
    ctx.moveTo(xa, Math.max(ya, y + step));
    ctx.lineTo(xb, Math.max(yb, y + step));
    ctx.stroke();
  }
}

function deck(ctx, x0, y0, x1, y1, k) {
  ctx.fillStyle = WOOD;
  ctx.strokeStyle = WOOD_DARK;
  ctx.lineWidth = 2 * k;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1, y1 + 10 * k);
  ctx.lineTo(x0, y0 + 10 * k);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawRamp(ctx, g, sx, sy, k, height, rock) {
  const x0 = sx(g.x0);
  const x1 = sx(g.x1);
  const base = sy(g.y0);
  // The ground under the ramp keeps going flat.
  drawSlope(ctx, { x0: g.x0, x1: g.x1, y0: g.y0, y1: g.y0 }, sx, sy, k, height, rock);
  const n = 3;
  for (let i = 0; i < n; i += 1) {
    const xa = x0 + ((x1 - x0) * (i + 0.6)) / n;
    const xb = x0 + ((x1 - x0) * (i + 1)) / n - 2 * k;
    const ya = sy(g.y0 + ((g.y1 - g.y0) * (i + 0.6)) / n) + 8 * k;
    const yb = sy(g.y0 + ((g.y1 - g.y0) * (i + 1)) / n) + 8 * k;
    trestle(ctx, xa, ya, xb, yb, base, k);
  }
  deck(ctx, x0, sy(g.y0), x1, sy(g.y1), k);
  // A flag at the lip.
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2 * k;
  ctx.beginPath();
  ctx.moveTo(x1 - 4 * k, sy(g.y1));
  ctx.lineTo(x1 - 4 * k, sy(g.y1) - 34 * k);
  ctx.stroke();
  ctx.fillStyle = '#e8343c';
  ctx.beginPath();
  ctx.moveTo(x1 - 4 * k, sy(g.y1) - 34 * k);
  ctx.lineTo(x1 + 14 * k, sy(g.y1) - 28 * k);
  ctx.lineTo(x1 - 4 * k, sy(g.y1) - 22 * k);
  ctx.fill();
}

function drawBridge(ctx, g, sx, sy, k, height) {
  const x0 = sx(g.x0);
  const x1 = sx(g.x1);
  const y = sy(g.y0);
  const towers = Math.max(1, Math.round((g.x1 - g.x0) / 130));
  for (let i = 0; i < towers; i += 1) {
    const mid = x0 + ((x1 - x0) * (i + 0.5)) / towers;
    trestle(ctx, mid - 26 * k, y + 8 * k, mid + 26 * k, y + 8 * k, height + 10, k);
  }
  deck(ctx, x0, y, x1, y, k);
  snowCap(ctx, x0, y - 2 * k, x1, y - 2 * k, k * 0.6);
}

function draw(canvas, s, rider, images, cam, popups) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const view = viewWidth(canvas);
  const k = width / view;
  // Keep the rider a third of the way across and a bit above the middle, easing up and down.
  // Frame the rider and the ground coming up, so big drops and high jumps both stay in view.
  const ahead = shredGround(s, s.x + 180) ?? shredGround(s, s.x + 320) ?? s.y;
  const viewH = height / k;
  let targetY = (s.y + ahead) / 2 - viewH * 0.5;
  targetY = Math.max(targetY, ahead - viewH * 0.85);
  targetY = Math.min(targetY, s.y - viewH * 0.2);
  cam.y = cam.y == null ? targetY : cam.y + (targetY - cam.y) * 0.15;
  const left = s.x - view * 0.3;
  const sx = (x) => (x - left) * k;
  const sy = (y) => (y - cam.y) * k;

  drawBackdrop(ctx, SNOW, width, height, height * 0.62, s.x * 0.5, k, s.tick);
  // The valley far below the slope.
  const valley = ctx.createLinearGradient(0, height * 0.62, 0, height);
  valley.addColorStop(0, '#9fbbd8');
  valley.addColorStop(1, '#6f8fb3');
  ctx.fillStyle = valley;
  ctx.fillRect(0, height * 0.62, width, height * 0.38);

  // The mountain: brown rock with a snow cap, plus wooden ramps and trestle bridges.
  const rock = ctx.createLinearGradient(0, height * 0.3, 0, height);
  rock.addColorStop(0, '#8c6440');
  rock.addColorStop(1, '#4a3120');
  for (const g of s.segments) {
    if (g.x1 < left - 20 || g.x0 > left + view + 20) continue;
    if (g.kind === 'bridge') drawBridge(ctx, g, sx, sy, k, height);
    else if (g.kind === 'ramp') drawRamp(ctx, g, sx, sy, k, height, rock);
    else drawSlope(ctx, g, sx, sy, k, height, rock);
  }

  s.obstacles.forEach((o) => drawObstacle(ctx, o, sx, sy, k, s.tick));
  const bob = (s.tick % 30) / 30;
  s.footballs.forEach((b) => (b.vy == null
    ? drawFootball(ctx, sx(b.x), sy(b.y) + (bob < 0.5 ? bob : 1 - bob) * 6 * k, SHRED.ballRadius * k, -0.5)
    : drawFootball(ctx, sx(b.x), sy(b.y), SHRED.ballRadius * k, s.tick * 0.3)));
  s.hotdogs.forEach((d) => drawHotDog(ctx, d, sx, sy, k, s.tick));

  // The rider on a board, tipped to the slope (or nose-up in the air).
  const px = sx(s.x);
  const py = sy(s.y);
  let tilt = 0;
  for (const g of s.segments) if (s.x >= g.x0 && s.x < g.x1) tilt = Math.atan2(g.y1 - g.y0, g.x1 - g.x0);
  if (!s.grounded) tilt = Math.max(-0.6, Math.min(0.6, s.vy * 0.04));
  ctx.save();
  ctx.translate(px, py);
  // A full spin on the double jump.
  const spin = s.doubleAt >= 0 && s.tick - s.doubleAt < 16 ? ((s.tick - s.doubleAt) / 16) * Math.PI * 2 : 0;
  ctx.rotate(s.alive ? tilt - spin : tilt + 1.2);
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = '#16122b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, -3 * k, 26 * k, 5 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const img = images[rider];
  const size = 62 * k;
  if (img && img.complete && img.naturalWidth) ctx.drawImage(img, -size / 2, -size - 4 * k, size, size);
  ctx.restore();
  // "+10" and "+5" floating up where points were won.
  ctx.textAlign = 'center';
  ctx.font = `900 ${Math.round(20 * k)}px system-ui, sans-serif`;
  ctx.lineWidth = 4 * k;
  ctx.strokeStyle = '#16122b';
  popups.forEach((p) => {
    const age = s.tick - p.tick;
    ctx.globalAlpha = Math.max(0, 1 - age / 30);
    ctx.fillStyle = p.text === '+5' ? '#7ef0a0' : '#ffd23f';
    ctx.strokeText(p.text, sx(p.x), sy(p.y) - age * 1.4 * k);
    ctx.fillText(p.text, sx(p.x), sy(p.y) - age * 1.4 * k);
  });
  ctx.globalAlpha = 1;
  // Snow spray while riding.
  if (s.grounded && s.alive) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 4; i += 1) {
      const a = ((s.tick * 7 + i * 13) % 20) / 20;
      ctx.beginPath();
      ctx.arc(px - (22 + a * 26) * k, py - a * 14 * k, (3 - a * 2) * k, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Shred the Summit. Tap (or space) to jump. The run is recorded as [tick, 1] taps; `onEnd(inputs, score,
 * detail)` gets them when the rider wipes out.
 */
const ShredGame = ({ seed, onEnd }) => {
  const [rider, setRider] = useState(readClimber);
  const [phase, setPhase] = useState('ready');
  const [countdown, setCountdown] = useState(3);
  const stateRef = useRef(null);
  const inputsRef = useRef([]);
  const tapRef = useRef(false);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const camRef = useRef({ y: null });
  const popupsRef = useRef([]);
  const images = useMemo(() => CREW.map((guy) => loadImage(guy.art)), []);
  const [, setSize] = useState(0);

  const begin = () => {
    // On a phone, bring the score bar, slope and Jump button into view together.
    wrapRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    stateRef.current = shredStart(seed);
    inputsRef.current = [];
    tapRef.current = false;
    camRef.current = { y: null };
    popupsRef.current = [];
    setCountdown(3);
    setPhase('countdown');
  };

  useEffect(() => {
    if (phase !== 'countdown') return undefined;
    if (countdown <= 0) { setPhase('playing'); return undefined; }
    const id = setTimeout(() => setCountdown((n) => n - 1), 700);
    return () => clearTimeout(id);
  }, [phase, countdown]);

  const jump = useCallback(() => {
    if (phase === 'playing') tapRef.current = true;
  }, [phase]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === ' ' || event.key === 'ArrowUp' || event.key === 'w') { event.preventDefault(); jump(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jump]);

  // Size the canvas to its box (sharp on phones), and keep it that way when the screen turns.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const fit = () => {
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(box.width * dpr);
      canvas.height = Math.round(box.height * dpr);
      setSize((n) => n + 1);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useFixedLoop(phase === 'playing', () => {
    const s = stateRef.current;
    const tap = tapRef.current;
    tapRef.current = false;
    if (tap) inputsRef.current.push([s.tick, 1]);
    const { balls, stomps } = s;
    shredStep(s, tap);
    const popAt = (text) => popupsRef.current.push({ text, x: s.x, y: s.y - 70, tick: s.tick });
    if (s.balls > balls) { blip(); popAt(`+${SHRED.ballPoints * (s.balls - balls)}`); }
    if (s.stomps > stomps) popAt(`+${SHRED.stompPoints}`);
    popupsRef.current = popupsRef.current.filter((p) => s.tick - p.tick < 30);
    if (!s.alive) {
      if (s.hitBy === 'time') taDa(); else guySound(rider);
      setPhase('over');
      onEnd(inputsRef.current, shredScore(s), shredDetail(s));
      return false;
    }
    return true;
  });

  const s = stateRef.current;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width) return;
    draw(canvas, s || shredStart(seed), rider, images, camRef.current, popupsRef.current);
  });

  const score = s ? shredScore(s) : 0;
  return (
    <div className="shred-game" ref={wrapRef}>
      <div className="game-hud">
        <span><strong>{s ? s.balls : 0}</strong> 🏈</span>
        <span><strong>{s ? s.stomps : 0}</strong> landings</span>
        <span>Score <strong>{score}</strong></span>
      </div>
      <div
        className="shred-stage"
        onPointerDown={jump}
        role="application"
        aria-label="Shred the Summit. Tap to jump."
      >
        <canvas ref={canvasRef} className="shred-canvas" />
        {phase === 'playing' && score >= SHRED.hotDogsFrom - 20 && score < SHRED.hotDogsFrom + 15 && (
          <div className="shred-warning">{score < SHRED.hotDogsFrom ? 'Hot dogs incoming...' : 'Watch the sky!'}</div>
        )}
        {phase === 'countdown' && <div className="game-overlay"><span className="game-countdown">{countdown || 'Go!'}</span></div>}
        {phase === 'over' && s && (
          <div className="game-overlay">
            <p className="game-over-line">{hitLine(s)}</p>
            <p className="game-over-score">{shredScore(s)} points</p>
          </div>
        )}
        {phase === 'ready' && (
          <div className="game-overlay is-setup" onPointerDown={(e) => e.stopPropagation()}>
            <p>Pick your rider</p>
            <div className="climber-picks">
              {CREW.map((guy, index) => (
                <button
                  key={guy.name}
                  type="button"
                  className={index === rider ? 'is-picked' : ''}
                  onClick={() => { setRider(index); saveClimber(index); }}
                  aria-pressed={index === rider}
                >
                  <img src={guy.art} alt="" />
                  <span>{guy.name}</span>
                </button>
              ))}
            </div>
            <button type="button" className="game-go" onClick={begin}>Drop in</button>
            <p className="game-hint">Tap anywhere (or space) to jump, and tap again in the air to double jump. Footballs are {SHRED.ballPoints} points, and landing on top of a rock, stump, tree or snowman is {SHRED.stompPoints}. Gift sleds hold a football, until later, when some toss out a hot dog on a fuse. Jump it before it pops!</p>
          </div>
        )}
      </div>
      <button type="button" className="shred-jump" onPointerDown={jump} aria-label="Jump">Jump</button>
    </div>
  );
};

export default ShredGame;
