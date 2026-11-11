// Synthetic handwriting for the whiteboard recognizer test: a separate set of "writer" glyphs (not the
// recognizer's templates) with random slant, rotation, scale, spacing and pointer-like sampling.

// Small seeded PRNG so runs are repeatable.
export const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Writer glyphs: key points in a 0-100 box. S = smooth stroke, L = sharp polyline.
const S = (...pts) => ({ smooth: true, pts });
const L = (...pts) => ({ smooth: false, pts });
const ring = (cx, cy, rx, ry, from, to, steps = 10) => Array.from({ length: steps + 1 }, (_, i) => {
  const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
  return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
});

const GLYPHS = {
  0: [[S(...ring(50, 50, 28, 44, -95, 268))], [S(...ring(50, 52, 24, 42, -80, 290))]],
  1: [[L([50, 6], [49, 94])], [L([36, 22], [51, 6], [50, 94])], [L([38, 20], [52, 6], [52, 94]), L([36, 94], [68, 94])]],
  2: [
    [S([25, 26], [40, 8], [62, 8], [72, 26], [62, 48], [40, 70], [24, 91]), L([24, 91], [78, 91])],
    [S([22, 24], [42, 6], [68, 12], [70, 36], [48, 62], [24, 90], [50, 88], [80, 90])],
  ],
  3: [
    [S([26, 16], [48, 5], [68, 16], [64, 36], [46, 48], [66, 56], [74, 76], [58, 94], [36, 95], [22, 84])],
    [L([26, 6], [72, 6], [46, 40]), S([46, 40], [66, 48], [74, 70], [60, 92], [38, 94], [24, 84])],
  ],
  4: [
    [L([56, 6], [20, 64], [82, 64]), L([64, 30], [64, 94])],
    [L([30, 6], [24, 54], [78, 54]), L([66, 10], [66, 94])],
    [L([62, 94], [62, 6], [18, 64], [82, 64])],
  ],
  5: [
    [S([30, 8], [28, 44], [50, 38], [70, 50], [72, 74], [56, 92], [26, 88]), L([30, 8], [72, 8])],
    [S([72, 7], [32, 8], [29, 44], [52, 38], [72, 54], [70, 80], [50, 94], [24, 86])],
  ],
  6: [
    [S([68, 8], [44, 18], [30, 44], [28, 72], [42, 93], [62, 90], [70, 72], [60, 56], [42, 56], [30, 70])],
    [S([62, 6], [42, 30], [30, 60], [36, 88], [56, 94], [70, 78], [62, 60], [42, 58], [32, 72])],
  ],
  7: [
    [L([22, 8], [78, 8], [46, 94])],
    [L([22, 8], [78, 8], [46, 94]), L([36, 50], [70, 50])],
    [L([22, 8], [78, 8]), S([78, 8], [64, 38], [54, 66], [50, 94])],
  ],
  8: [
    [S([64, 16], [50, 6], [34, 14], [36, 34], [52, 48], [68, 62], [66, 84], [50, 94], [33, 84], [34, 62], [52, 48], [64, 34], [64, 16])],
    [S(...ring(50, 28, 19, 20, 0, 360, 10)), S(...ring(50, 71, 24, 23, -90, 270, 10))],
  ],
  9: [
    [S([68, 26], [54, 8], [36, 12], [32, 32], [46, 44], [64, 38], [68, 26], [68, 60], [66, 94])],
    [S(...ring(50, 28, 21, 21, 5, 365, 10)), L([71, 30], [70, 94])],
  ],
};

const catmull = (keys) => {
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

// Pointer-event-like sampling: irregular spacing along the path.
const sample = (path, random) => {
  const out = [path[0]];
  let carry = 0;
  for (let i = 1; i < path.length; i += 1) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const d = Math.hypot(bx - ax, by - ay);
    let t = carry;
    while (t < d) {
      out.push([ax + ((bx - ax) * t) / d, ay + ((by - ay) * t) / d]);
      t += 2 + random() * 5;
    }
    carry = t - d;
  }
  out.push(path[path.length - 1]);
  return out;
};

export const writeNumber = (value, random, { rotation = 7, slant = 0.15, jitter = 0.9 } = {}) => {
  const strokes = [];
  const height = 70 + random() * 50;
  let cursor = 20;
  const lineTilt = (random() - 0.5) * 0.08;
  for (const char of String(value)) {
    const styles = GLYPHS[char];
    const glyph = styles[Math.floor(random() * styles.length)];
    const aspect = 0.8 + random() * 0.4;
    const angle = (((random() - 0.5) * 2 * rotation) * Math.PI) / 180;
    const shear = (random() - 0.5) * 2 * slant;
    const scale = (height / 100) * (0.9 + random() * 0.2);
    const wobble = () => (random() - 0.5) * 6;
    const placed = glyph.map((stroke) => {
      const keys = stroke.pts.map(([x, y]) => [x + wobble(), y + wobble()]);
      const path = stroke.smooth ? catmull(keys) : keys;
      return path.map(([x, y]) => {
        const lx = (x - 50) * aspect - shear * (y - 50);
        const ly = y - 50;
        return [lx * Math.cos(angle) - ly * Math.sin(angle), lx * Math.sin(angle) + ly * Math.cos(angle)];
      }).map(([x, y]) => [x * scale, y * scale]);
    });
    const minX = Math.min(...placed.flat().map(([x]) => x));
    const maxX = Math.max(...placed.flat().map(([x]) => x));
    const dy = 100 + cursor * lineTilt + (random() - 0.5) * height * 0.08;
    placed.forEach((path) => {
      strokes.push(sample(path, random).map(([x, y]) => ({
        x: x - minX + cursor + (random() - 0.5) * 2 * jitter,
        y: y + dy + (random() - 0.5) * 2 * jitter,
      })));
    });
    cursor += maxX - minX + height * (0.12 + random() * 0.2);
  }
  return strokes;
};

