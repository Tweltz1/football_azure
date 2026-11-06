// Held-out MESSY handwriting for the whiteboard recognizer benchmark. Its own glyph set (not the
// recognizer's templates, not handwriting.mjs), written the way people scrawl on a phone:
// +-20 deg rotation, +-30 deg slant, uneven scaling, tremor, overshoot/undershoot at stroke ends,
// touching or overlapping digits, shuffled stroke order and direction, and small finger-sized writing.

import { rng } from './handwriting.mjs';

export { rng };

const S = (...pts) => ({ smooth: true, pts });
const L = (...pts) => ({ smooth: false, pts });
const oval = (cx, cy, rx, ry, from, to, steps = 12) => Array.from({ length: steps + 1 }, (_, i) => {
  const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
  return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
});

// Several ways to write each digit, including the multi-stroke and open/closed forms people use.
export const MESSY_GLYPHS = {
  0: [
    [S(...oval(50, 50, 27, 44, -90, 275))], // closed
    [S(...oval(50, 50, 26, 43, -55, 245))], // open top
    [S(...oval(52, 50, 20, 44, -80, 300))], // narrow with overlap
    [S([60, 8], [36, 14], [24, 48], [34, 86], [56, 93], [74, 66], [72, 26], [52, 6], [40, 14])],
  ],
  1: [
    [L([51, 5], [49, 95])],
    [L([33, 25], [52, 5], [50, 95])], // flag
    [L([33, 25], [52, 5], [50, 95]), L([30, 95], [70, 94])], // flag and base
    [S([46, 6], [50, 40], [52, 70], [50, 95])],
    [L([50, 95], [52, 5], [36, 22])], // drawn bottom-up
  ],
  2: [
    [S([24, 26], [38, 7], [60, 6], [73, 24], [64, 48], [40, 72], [22, 92]), L([22, 92], [80, 92])],
    [S([22, 26], [40, 6], [66, 10], [72, 32], [52, 58], [28, 82], [22, 92], [34, 84], [40, 92], [30, 96], [36, 88], [60, 90], [82, 92])], // loop at the bottom
    [L([22, 14], [48, 6], [74, 18], [24, 92], [80, 92])], // Z-like
    [S([26, 30], [36, 10], [58, 6], [72, 22], [66, 46], [42, 70], [26, 90], [52, 86], [78, 94])],
  ],
  3: [
    [S([24, 16], [46, 5], [68, 14], [66, 36], [46, 48], [68, 58], [74, 80], [56, 95], [32, 94], [20, 82])],
    [L([24, 6], [72, 6], [42, 42]), S([42, 42], [66, 50], [74, 72], [58, 93], [34, 94], [22, 82])], // flat top
    [S([24, 18], [44, 6], [66, 14], [64, 34], [44, 46]), S([44, 48], [68, 56], [74, 78], [56, 94], [24, 86])], // two strokes
  ],
  4: [
    [L([54, 6], [18, 64], [84, 64]), L([66, 32], [66, 96])], // open, 2 strokes
    [L([64, 6], [16, 66], [84, 66]), L([64, 6], [64, 96])], // closed, 2 strokes
    [L([64, 96], [64, 6], [16, 66], [86, 66])], // closed, 1 stroke
    [L([66, 10], [66, 96]), L([28, 6], [22, 58], [84, 58])], // upright first
    [L([30, 6], [22, 58], [82, 56]), L([64, 26], [62, 96])], // open L
  ],
  5: [
    [S([30, 9], [28, 44], [50, 37], [70, 50], [72, 74], [56, 93], [26, 88]), L([30, 9], [72, 8])], // separate top bar
    [L([73, 8], [30, 9]), S([30, 9], [28, 44], [52, 38], [72, 54], [70, 80], [48, 94], [22, 86])], // bar first
    [S([72, 7], [32, 8], [29, 44], [52, 38], [72, 54], [70, 80], [50, 94], [24, 86])], // one stroke
    [L([32, 8], [28, 46]), S([28, 46], [56, 40], [74, 62], [62, 90], [26, 90]), L([34, 8], [76, 10])],
  ],
  6: [
    [S([68, 8], [44, 18], [29, 44], [28, 72], [42, 93], [62, 90], [70, 72], [60, 56], [42, 56], [29, 70])],
    [S([66, 6], [42, 26], [30, 58], [36, 88], [56, 94], [70, 78], [62, 60], [44, 60])], // loop left open
    [L([58, 6], [32, 56]), S([32, 56], [30, 80], [48, 94], [68, 84], [66, 62], [46, 56], [32, 66])], // straight stem
  ],
  7: [
    [L([22, 8], [78, 8], [46, 94])],
    [L([22, 8], [78, 8], [46, 94]), L([34, 52], [72, 50])], // crossbar
    [L([22, 8], [78, 8]), S([78, 8], [62, 40], [52, 70], [50, 94])], // curved stem, 2 strokes
    [L([20, 20], [24, 8], [78, 8], [42, 94])], // hook on the left
  ],
  8: [
    [S([64, 16], [50, 6], [34, 14], [36, 34], [52, 48], [68, 62], [66, 84], [50, 94], [33, 84], [34, 62], [52, 48], [64, 34], [64, 16])], // figure eight
    [S(...oval(50, 27, 18, 20, -90, 270, 10)), S(...oval(50, 71, 23, 23, -90, 270, 10))], // two loops
    [S([40, 10], [60, 8], [64, 26], [40, 46], [30, 70], [46, 94], [68, 80], [62, 56], [38, 36], [34, 18], [42, 8])], // started top-left
  ],
  9: [
    [S(...oval(50, 28, 20, 20, 0, 365, 10)), L([70, 28], [69, 95])], // loop + straight tail
    [S([68, 26], [54, 8], [36, 12], [32, 32], [46, 44], [64, 38], [68, 26], [66, 62], [56, 88], [38, 95])], // curved tail
    [S([66, 18], [48, 6], [30, 16], [34, 38], [56, 40], [68, 22], [68, 60], [66, 95])],
    [S([70, 30], [54, 10], [34, 16], [34, 38], [54, 42], [70, 30]), L([70, 30], [70, 95])], // closed loop then tail
  ],
};

const catmull = (keys) => {
  if (keys.length < 3) return keys;
  const out = [];
  for (let i = 0; i < keys.length - 1; i += 1) {
    const [p0, p1, p2, p3] = [keys[Math.max(0, i - 1)], keys[i], keys[i + 1], keys[Math.min(keys.length - 1, i + 2)]];
    for (let s = 0; s < 8; s += 1) {
      const t = s / 8;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t
        + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t ** 3)));
    }
  }
  out.push(keys[keys.length - 1]);
  return out;
};

const densify = (path, step) => {
  const out = [path[0]];
  for (let i = 1; i < path.length; i += 1) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k += 1) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
};

// Extend (overshoot) or trim (undershoot) the ends of a stroke along its own direction.
const adjustEnds = (path, random) => {
  const ends = (points) => {
    const d = (random() - 0.4) * 16; // -6.4 .. +9.6 units
    if (points.length < 3) return points;
    const [x1, y1] = points[points.length - 1];
    const [x0, y0] = points[Math.max(0, points.length - 4)];
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    if (d >= 0) return [...points, [x1 + ((x1 - x0) / len) * d, y1 + ((y1 - y0) / len) * d]];
    let trim = -d;
    const out = [...points];
    while (out.length > 2 && trim > 0) {
      const [ax, ay] = out[out.length - 1];
      const [bx, by] = out[out.length - 2];
      trim -= Math.hypot(ax - bx, ay - by);
      out.pop();
    }
    return out;
  };
  return ends(ends(path).reverse()).reverse();
};

/**
 * Writes `value` the messy way. Returns pad strokes ({x, y} points, pixels, y down).
 * `glyphs` lets a test swap in its own shapes (e.g. a person's odd 4).
 */
export const writeMessy = (value, random, opts = {}) => {
  const {
    rotation = 20, slant = 30, finger = random() < 0.3, glyphs = MESSY_GLYPHS, choose = null,
  } = opts;
  const height = finger ? 22 + random() * 18 : 60 + random() * 70;
  const jitter = finger ? 1.1 : 0.5 + random() * 1.0;
  const strokes = [];
  let cursor = 20;
  let previousWidth = Infinity;
  const lineTilt = (random() - 0.5) * 0.12;
  String(value).split('').forEach((char, position) => {
    const styles = glyphs[char];
    const glyph = choose ? choose(char, position, styles) : styles[Math.floor(random() * styles.length)];
    const angle = (((random() - 0.5) * 2 * rotation) * Math.PI) / 180;
    const shear = Math.tan((((random() - 0.5) * 2 * slant) * Math.PI) / 180);
    const sx = 0.7 + random() * 0.6;
    const sy = 0.8 + random() * 0.4;
    const size = (height / 100) * (0.8 + random() * 0.4);
    const wobble = () => (random() - 0.5) * 12;
    const tremorAmp = random() * 2.2;
    const tremorFreq = 0.15 + random() * 0.35;
    const tremorPhase = random() * 6.28;
    let order = glyph.map((stroke, i) => i);
    if (order.length > 1 && random() < 0.5) order = order.reverse();
    const placed = order.map((index) => {
      const stroke = glyph[index];
      const keys = stroke.pts.map(([x, y]) => [x + wobble(), y + wobble()]);
      let path = densify(stroke.smooth ? catmull(keys) : keys, 2);
      path = adjustEnds(path, random);
      if (random() < 0.5) path = path.slice().reverse();
      return path.map(([x, y], i) => {
        const t = i * tremorFreq + tremorPhase;
        const tx = x + Math.sin(t) * tremorAmp;
        const ty = y + Math.cos(t * 1.3) * tremorAmp;
        const lx = (tx - 50) * sx - shear * (ty - 50);
        const ly = (ty - 50) * sy;
        return [
          (lx * Math.cos(angle) - ly * Math.sin(angle)) * size,
          (lx * Math.sin(angle) + ly * Math.cos(angle)) * size,
        ];
      });
    });
    const xs = placed.flat().map(([x]) => x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    // Touching or slightly overlapping the previous digit: at most a third of the narrower one.
    if (position > 0) {
      const gap = height * (-0.08 + random() * 0.3);
      cursor += Math.max(gap, -Math.min(previousWidth, maxX - minX) / 3);
    }
    previousWidth = maxX - minX;
    const dy = 100 + cursor * lineTilt + (random() - 0.5) * height * 0.2;
    placed.forEach((path) => {
      // Pointer sampling: coarser for a finger, then pixel rounding.
      const step = finger ? 3 + random() * 5 : 2 + random() * 4;
      const sampled = [];
      let travelled = step;
      for (let i = 0; i < path.length; i += 1) {
        if (i > 0) travelled += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
        if (travelled >= step || i === path.length - 1) {
          sampled.push(path[i]);
          travelled = 0;
        }
      }
      strokes.push(sampled.map(([x, y]) => ({
        x: Math.round((x - minX + cursor + (random() - 0.5) * 2 * jitter) * 2) / 2,
        y: Math.round((y + dy + (random() - 0.5) * 2 * jitter) * 2) / 2,
      })));
    });
    cursor += maxX - minX;
  });
  return strokes;
};
