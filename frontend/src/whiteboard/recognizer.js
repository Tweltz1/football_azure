// Client-side handwritten number reader for whiteboard bids. No network, no dependencies.
//
// 1. Features: each candidate digit is scaled into a unit box (keeping its shape) and described by where
//    its ink runs in each of 4 directions (a 7x7 grid x 4 orientations, blurred). Direction is undirected,
//    so stroke order and direction don't matter.
// 2. Classify: nearest neighbour against the templates in templates.js, each expanded at load time into
//    rotated, slanted and stretched copies, plus the writer's own past digits (personal templates).
// 3. Second look: when the two best digits are close, simple geometry decides the usual mix-ups (does it
//    enclose a loop? is that a 1's flag or a 7's bar?).
// 4. Segment: strokes are sorted left to right and split into digits by dynamic programming, scoring each
//    possible run of strokes as one digit. So touching or overlapping digits still split, and a 4, 5 or 7
//    written in two strokes stays one digit.
// 5. Optionally, a reading above the bidder's max bid gives way to a close runner-up that fits.
//
// Benchmark (`node frontend/tests/benchmark.mjs`: every bid $1-$200, three writers each): 99.8% on neat
// writing and 95.3% on the messy set (rotated, slanted, shaky, touching, finger-sized digits), 96.7% on
// messy with the max-bid hint; isolated digits 99.9% neat, 99.1% messy.
//
// Strokes are arrays of {x, y} points (any units, y down). The read is a hint: in the auto-read style the
// commissioner sees every board and confirms the amount before anything is awarded.

import { DIGIT_TEMPLATES } from './templates.js';

const GRID = 7;
const PLANES = 4;
const DIM = GRID * GRID * PLANES;
const STEP = 0.035;

// ---- Features ------------------------------------------------------------------------------------

const boundsOf = (strokes) => {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const stroke of strokes) {
    for (const p of stroke) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, minY, maxX, maxY };
};

const deposit = (f, plane, gx, gy, w) => {
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  for (let dy = 0; dy <= 1; dy += 1) {
    const cy = Math.min(GRID - 1, Math.max(0, y0 + dy));
    const wy = dy ? fy : 1 - fy;
    for (let dx = 0; dx <= 1; dx += 1) {
      const cx = Math.min(GRID - 1, Math.max(0, x0 + dx));
      const wx = dx ? fx : 1 - fx;
      f[(plane * GRID + cy) * GRID + cx] += w * wx * wy;
    }
  }
};

const blur = (f) => {
  const out = new Float32Array(DIM);
  const k = [0.25, 0.5, 0.25];
  const tmp = new Float32Array(DIM);
  for (let p = 0; p < PLANES; p += 1) {
    for (let y = 0; y < GRID; y += 1) {
      for (let x = 0; x < GRID; x += 1) {
        let s = 0;
        for (let d = -1; d <= 1; d += 1) s += k[d + 1] * f[(p * GRID + y) * GRID + Math.min(GRID - 1, Math.max(0, x + d))];
        tmp[(p * GRID + y) * GRID + x] = s;
      }
    }
    for (let y = 0; y < GRID; y += 1) {
      for (let x = 0; x < GRID; x += 1) {
        let s = 0;
        for (let d = -1; d <= 1; d += 1) s += k[d + 1] * tmp[(p * GRID + Math.min(GRID - 1, Math.max(0, y + d))) * GRID + x];
        out[(p * GRID + y) * GRID + x] = s;
      }
    }
  }
  return out;
};

/** Direction-feature vector for one digit (strokes of {x, y}). Null when there is no ink. */
export const featureVector = (strokes) => {
  const usable = strokes.filter((s) => s.length > 0);
  if (usable.length === 0) return null;
  const { minX, minY, maxX, maxY } = boundsOf(usable);
  const w = maxX - minX;
  const h = maxY - minY;
  const size = Math.max(w, h) || 1;
  const scale = 0.92 / size;
  const ox = (1 - w * scale) / 2;
  const oy = (1 - h * scale) / 2;
  const f = new Float32Array(DIM);
  let ink = 0;
  for (const stroke of usable) {
    if (stroke.length === 1) {
      const gx = ((stroke[0].x - minX) * scale + ox) * GRID - 0.5;
      const gy = ((stroke[0].y - minY) * scale + oy) * GRID - 0.5;
      for (let p = 0; p < PLANES; p += 1) deposit(f, p, gx, gy, STEP / 2);
      ink += STEP;
      continue;
    }
    for (let i = 1; i < stroke.length; i += 1) {
      const ax = (stroke[i - 1].x - minX) * scale + ox;
      const ay = (stroke[i - 1].y - minY) * scale + oy;
      const bx = (stroke[i].x - minX) * scale + ox;
      const by = (stroke[i].y - minY) * scale + oy;
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1e-9) continue;
      let theta = Math.atan2(by - ay, bx - ax);
      if (theta < 0) theta += Math.PI;
      const bin = (theta / (Math.PI / 4)) % PLANES;
      const b0 = Math.floor(bin) % PLANES;
      const frac = bin - Math.floor(bin);
      const b1 = (b0 + 1) % PLANES;
      const n = Math.max(1, Math.ceil(len / STEP));
      const piece = len / n;
      for (let k = 0; k < n; k += 1) {
        const t = (k + 0.5) / n;
        const gx = (ax + (bx - ax) * t) * GRID - 0.5;
        const gy = (ay + (by - ay) * t) * GRID - 0.5;
        deposit(f, b0, gx, gy, piece * (1 - frac));
        deposit(f, b1, gx, gy, piece * frac);
      }
      ink += len;
    }
  }
  if (ink === 0) return null;
  const out = blur(f);
  let norm = 0;
  for (let i = 0; i < DIM; i += 1) norm += out[i] * out[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i += 1) out[i] /= norm;
  return out;
};

// ---- Templates -----------------------------------------------------------------------------------

const transform = (strokes, { rotate = 0, shear = 0, stretch = 1 }) => {
  const a = (rotate * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return strokes.map((stroke) => stroke.map(({ x, y }) => {
    const lx = (x - 50) * stretch - shear * (y - 50);
    const ly = y - 50;
    return { x: lx * cos - ly * sin, y: lx * sin + ly * cos };
  }));
};

// Every template is also matched rotated (+-16 deg), slanted (shear +-0.5) and narrower or wider.
const AUGMENT = [];
for (const rotate of [-16, -8, 0, 8, 16]) {
  for (const shear of [-0.5, -0.25, 0, 0.25, 0.5]) {
    for (const stretch of [0.8, 1, 1.25]) AUGMENT.push({ rotate, shear, stretch });
  }
}
const PERSONAL_AUGMENT = [];
for (const rotate of [-8, 0, 8]) {
  for (const shear of [-0.25, 0, 0.25]) PERSONAL_AUGMENT.push({ rotate, shear, stretch: 1 });
}

const toPoints = (strokes) => strokes.map((stroke) => stroke.map(([x, y]) => ({ x, y })));

/** Packs feature vectors of (augmented) templates for fast nearest-neighbour search. */
const buildBank = (entries, augment) => {
  const vectors = [];
  const digits = [];
  for (const { digit, strokes } of entries) {
    for (const variant of augment) {
      const v = featureVector(transform(strokes, variant));
      if (v) {
        vectors.push(v);
        digits.push(digit);
      }
    }
  }
  const data = new Float32Array(vectors.length * DIM);
  vectors.forEach((v, i) => data.set(v, i * DIM));
  return { data, digits, count: vectors.length };
};

let generic = null;
const genericBank = () => {
  if (!generic) {
    const entries = Object.entries(DIGIT_TEMPLATES).flatMap(([digit, variants]) => variants.map((strokes) => ({
      digit: Number(digit), strokes: toPoints(strokes),
    })));
    generic = buildBank(entries, AUGMENT);
  }
  return generic;
};

/** Board-style examples ({ '4': [[[x, y, x, y...], ...], ...] }) to {x, y} strokes. */
const decodeExample = (example) => (Array.isArray(example) ? example : []).map((stroke) => {
  const points = [];
  for (let i = 0; i + 1 < (stroke?.length || 0); i += 2) points.push({ x: stroke[i], y: stroke[i + 1] });
  return points;
}).filter((s) => s.length > 0);

const personalCache = new WeakMap();
const personalBank = (personal) => {
  if (!personal || typeof personal !== 'object') return null;
  if (personalCache.has(personal)) return personalCache.get(personal);
  const entries = [];
  Object.entries(personal).forEach(([digit, examples]) => {
    if (!/^[0-9]$/.test(digit) || !Array.isArray(examples)) return;
    examples.forEach((example) => {
      const strokes = decodeExample(example);
      if (strokes.length) entries.push({ digit: Number(digit), strokes });
    });
  });
  const bank = entries.length ? buildBank(entries, PERSONAL_AUGMENT) : null;
  personalCache.set(personal, bank);
  return bank;
};

// The writer's own past digits count for more than the generic templates.
const PERSONAL_WEIGHT = 0.8;

const nearest = (bank, v, best, weight) => {
  if (!bank) return;
  const { data, digits, count } = bank;
  for (let t = 0; t < count; t += 1) {
    let d = 0;
    const base = t * DIM;
    for (let i = 0; i < DIM; i += 1) {
      const diff = data[base + i] - v[i];
      d += diff * diff;
    }
    d *= weight;
    if (d < best[digits[t]]) best[digits[t]] = d;
  }
};

/** Scores one group of strokes against every digit. Lower is closer. */
export const recognizeDigit = (strokes, { personal = null } = {}) => {
  const v = featureVector(strokes);
  if (!v) return null;
  const best = new Array(10).fill(Infinity);
  nearest(genericBank(), v, best, 1);
  nearest(personalBank(personal), v, best, PERSONAL_WEIGHT);
  const ranked = secondStage(strokes, best.map((score, digit) => ({ digit, score })).sort((a, b) => a.score - b.score));
  return { digit: ranked[0].digit, score: ranked[0].score, ranked };
};

// ---- Second stage --------------------------------------------------------------------------------
// When the two best digits are close, simple geometry settles the pairs the matcher tends to mix up:
// whether the digit encloses a loop (9/6/8/0 do; 1/7/3/5/2 don't), and how long the flag of a 1 is
// next to the bar of a 7.

const LOOPED = new Set([0, 6, 8, 9]);
const OPEN = new Set([1, 2, 3, 5, 7]);
const HOLE_GRID = 28;

/** Enclosed background regions of the digit drawn with a thick pen (so near-closed loops count). */
const countLoops = (strokes) => {
  const { minX, minY, maxX, maxY } = boundsOf(strokes);
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  const pad = 2;
  const scale = (HOLE_GRID - 2 * pad - 1) / size;
  const W = Math.ceil((maxX - minX) * scale) + 2 * pad + 1;
  const H = Math.ceil((maxY - minY) * scale) + 2 * pad + 1;
  const ink = new Uint8Array(W * H);
  const r = 0.07 * (HOLE_GRID - 2 * pad);
  const stamp = (gx, gy) => {
    for (let y = Math.max(0, Math.floor(gy - r)); y <= Math.min(H - 1, Math.ceil(gy + r)); y += 1) {
      for (let x = Math.max(0, Math.floor(gx - r)); x <= Math.min(W - 1, Math.ceil(gx + r)); x += 1) {
        if ((x - gx) ** 2 + (y - gy) ** 2 <= r * r) ink[y * W + x] = 1;
      }
    }
  };
  for (const stroke of strokes) {
    for (let i = 0; i < stroke.length; i += 1) {
      const ax = (stroke[i].x - minX) * scale + pad;
      const ay = (stroke[i].y - minY) * scale + pad;
      if (i === 0) {
        stamp(ax, ay);
      } else {
        const bx = (stroke[i - 1].x - minX) * scale + pad;
        const by = (stroke[i - 1].y - minY) * scale + pad;
        const n = Math.max(1, Math.ceil(Math.hypot(ax - bx, ay - by) * 2));
        for (let k = 1; k <= n; k += 1) stamp(bx + ((ax - bx) * k) / n, by + ((ay - by) * k) / n);
      }
    }
  }
  // Flood the background from the edges; whatever background is left over is a loop.
  const seen = ink.slice();
  const flood = (start) => {
    const stack = [start];
    seen[start] = 1;
    let area = 0;
    while (stack.length) {
      const c = stack.pop();
      area += 1;
      const x = c % W;
      const y = (c - x) / W;
      if (x > 0 && !seen[c - 1]) { seen[c - 1] = 1; stack.push(c - 1); }
      if (x < W - 1 && !seen[c + 1]) { seen[c + 1] = 1; stack.push(c + 1); }
      if (y > 0 && !seen[c - W]) { seen[c - W] = 1; stack.push(c - W); }
      if (y < H - 1 && !seen[c + W]) { seen[c + W] = 1; stack.push(c + W); }
    }
    return area;
  };
  for (let x = 0; x < W; x += 1) {
    if (!seen[x]) flood(x);
    if (!seen[(H - 1) * W + x]) flood((H - 1) * W + x);
  }
  for (let y = 0; y < H; y += 1) {
    if (!seen[y * W]) flood(y * W);
    if (!seen[y * W + W - 1]) flood(y * W + W - 1);
  }
  const minArea = 0.01 * (H - 2 * pad) ** 2;
  let loops = 0;
  for (let c = 0; c < W * H; c += 1) if (!seen[c] && flood(c) > minArea) loops += 1;
  return loops;
};

const pathLength = (stroke, from, to) => {
  let length = 0;
  for (let i = from + 1; i <= to; i += 1) length += Math.hypot(stroke[i].x - stroke[i - 1].x, stroke[i].y - stroke[i - 1].y);
  return length;
};

/**
 * One-stroke 1 or 7: how much it looks like a 7. A 7's bar is long next to its stem and roughly level;
 * a 1's flag is short and drops away from the top. Positive leans 7, negative leans 1 (as does a stroke
 * with no clear bend).
 */
const sevenness = (stroke) => {
  const a = stroke[0];
  const b = stroke[stroke.length - 1];
  const chord = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let far = -1;
  let at = 0;
  for (let i = 1; i < stroke.length - 1; i += 1) {
    const d = Math.abs((b.x - a.x) * (a.y - stroke[i].y) - (a.x - stroke[i].x) * (b.y - a.y)) / chord;
    if (d > far) { far = d; at = i; }
  }
  if (far < 0.08 * pathLength(stroke, 0, stroke.length - 1)) return -1;
  const first = pathLength(stroke, 0, at);
  const second = pathLength(stroke, at, stroke.length - 1);
  const ratio = Math.min(first, second) / Math.max(first, second, 1e-9);
  const corner = stroke[at];
  const end = first < second ? a : b;
  const drop = (Math.atan2(end.y - corner.y, Math.abs(end.x - corner.x)) * 180) / Math.PI;
  return (ratio - 0.42) * 10 + (20 - drop) / 15;
};

const CLOSE = 0.4; // the runner-up's score is within 40% of the best
const VERY_CLOSE = 0.2;

const secondStage = (strokes, ranked) => {
  const [first, second] = ranked;
  if (!second || second.score > first.score * (1 + CLOSE)) return ranked;
  const swapped = [second, first, ...ranked.slice(2)];
  const pair = new Set([first.digit, second.digit]);
  if (pair.has(1) && pair.has(7)) {
    if (strokes.length !== 1) return ranked;
    const lean = sevenness(strokes[0]);
    const want = lean < -0.5 ? 1 : lean > 0.5 ? 7 : first.digit;
    return want === first.digit ? ranked : swapped;
  }
  if (OPEN.has(first.digit) && LOOPED.has(second.digit)) {
    return countLoops(strokes) > 0 ? swapped : ranked;
  }
  if (LOOPED.has(first.digit) && OPEN.has(second.digit) && second.score <= first.score * (1 + VERY_CLOSE)) {
    return countLoops(strokes) === 0 ? swapped : ranked;
  }
  return ranked;
};

// ---- Segmentation ----------------------------------------------------------------------------------

const MAX_STROKES_PER_DIGIT = 5;

/**
 * Splits strokes into digits, left to right. Every run of strokes (in left-edge order) that has no
 * clear horizontal gap inside it is a candidate digit; dynamic programming picks the runs whose digit
 * scores add up best. Returns { groups, digits }.
 */
const segmentAndRead = (strokes, personal) => {
  const items = strokes
    .filter((stroke) => stroke.length > 0)
    .map((stroke) => ({ stroke, ...boundsOf([stroke]), upright: isUpright(stroke) }))
    .sort((a, b) => a.minX - b.minX);
  const n = items.length;
  if (n === 0) return { groups: [], digits: [] };
  const top = Math.min(...items.map((s) => s.minY));
  const height = Math.max(Math.max(...items.map((s) => s.maxY)) - top, 1e-6);
  const gapLimit = height * 0.1;

  const cache = new Map();
  const scoreRun = (i, j) => {
    const key = `${i}:${j}`;
    if (!cache.has(key)) {
      const run = items.slice(i, j + 1).map((item) => item.stroke);
      const result = recognizeDigit(run, { personal });
      const b = boundsOf(run);
      // A digit is rarely much wider than it is tall; very wide runs are probably two digits.
      const aspect = (b.maxX - b.minX) / Math.max(b.maxY - b.minY, height * 0.25);
      const widePenalty = aspect > 1.15 ? (aspect - 1.15) * 0.6 : 0;
      // Two separate long upright strokes side by side are two 1s, not one digit.
      let uprights = 0;
      for (let k = i; k <= j; k += 1) {
        if (items[k].upright && items[k].maxY - items[k].minY > 0.6 * (b.maxY - b.minY)) uprights += 1;
      }
      const pairPenalty = uprights >= 2 ? 0.5 : 0;
      // Squaring the match distance makes one poor fit cost more than two good ones, so a run that only
      // matches loosely as one digit gets split.
      cache.set(key, { result, cost: 3 * result.score * result.score + widePenalty + pairPenalty });
    }
    return cache.get(key);
  };

  // A run can't hold a clear horizontal gap.
  const connected = (i, j) => {
    let right = items[i].maxX;
    for (let k = i + 1; k <= j; k += 1) {
      if (items[k].minX > right + gapLimit) return false;
      right = Math.max(right, items[k].maxX);
    }
    return true;
  };

  const best = new Array(n + 1).fill(Infinity);
  const from = new Array(n + 1).fill(-1);
  best[0] = 0;
  for (let j = 1; j <= n; j += 1) {
    for (let i = Math.max(0, j - MAX_STROKES_PER_DIGIT); i < j; i += 1) {
      if (best[i] === Infinity || !connected(i, j - 1)) continue;
      // Strokes that sit mostly inside the run's own x-range belong together; don't cut through them.
      if (i > 0 && cutsThrough(items, i)) continue;
      const total = best[i] + scoreRun(i, j - 1).cost;
      if (total < best[j]) {
        best[j] = total;
        from[j] = i;
      }
    }
    if (best[j] === Infinity) {
      // No valid split ends here (e.g. the cut rule refused all); fall back to joining with the previous run.
      const i = Math.max(0, j - 1);
      best[j] = best[i] + scoreRun(i, j - 1).cost;
      from[j] = i;
    }
  }

  const groups = [];
  const digits = [];
  for (let j = n; j > 0; j = from[j]) {
    const i = from[j];
    groups.unshift(items.slice(i, j).map((item) => item.stroke));
    digits.unshift(scoreRun(i, j - 1).result);
  }
  return { groups, digits };
};

// True when the stroke at `index` is mostly inside the x-range of the stroke before it, so a digit
// boundary between them would cut one digit in two (the upright of a 4, the bar of a 5).
const cutsThrough = (items, index) => {
  const prev = items[index - 1];
  const cur = items[index];
  const width = Math.max(cur.maxX - cur.minX, 1e-6);
  const overlap = Math.min(prev.maxX, cur.maxX) - cur.minX;
  return overlap / width > 0.75 && cur.maxX <= prev.maxX + width * 0.25;
};

// A long, nearly straight stroke within 35 degrees of vertical: the body of a 1.
const isUpright = (stroke) => {
  if (stroke.length < 2) return false;
  const a = stroke[0];
  const b = stroke[stroke.length - 1];
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  return chord > 0.9 * pathLength(stroke, 0, stroke.length - 1) && Math.abs(b.x - a.x) < Math.abs(b.y - a.y) * 0.7;
};

/** Groups strokes into digits, left to right. */
export const segmentStrokes = (strokes, options = {}) => segmentAndRead(strokes, options.personal).groups;

// A read above the bidder's max bid can't be a real bid. When it is, a close runner-up for one or two
// of the digits that brings the amount within reach is the likelier reading ("713" -> "113").
const ALT_RANGE = 1; // runner-ups up to twice the best digit's score

const fitUnderMax = (digits, max) => {
  let beam = [{ picks: [], cost: 0 }];
  for (const d of digits) {
    const options = d.ranked.filter((r) => r.score <= d.score * (1 + ALT_RANGE)).slice(0, 3);
    beam = beam
      .flatMap((b) => options.map((o) => ({ picks: [...b.picks, o], cost: b.cost + (o.score - d.score) })))
      .sort((a, b) => a.cost - b.cost)
      .slice(0, 60);
  }
  const fit = beam.find((b) => {
    const amount = Number(b.picks.map((o) => o.digit).join(''));
    return amount >= 1 && amount <= max;
  });
  if (!fit) return null;
  return digits.map((d, i) => (fit.picks[i].digit === d.digit ? d : { ...d, digit: fit.picks[i].digit, score: fit.picks[i].score }));
};

/**
 * Reads a handwritten number. Returns { amount, digits, groups } where amount is null when nothing was
 * drawn. `personal` is the writer's own labelled digits ({ '4': [example, ...] }), which count for more.
 * `max` (optional) is the most the writer can bid; a reading above it is swapped for the closest one
 * within it when a near runner-up allows. Leading zeros are dropped ("034" reads as 34).
 */
export const readNumber = (strokes, { personal = null, max = null } = {}) => {
  const usable = (strokes || []).filter((stroke) => stroke && stroke.length > 0);
  if (usable.length === 0) return { amount: null, digits: [], groups: [] };
  const read = segmentAndRead(usable, personal);
  const { groups } = read;
  let { digits } = read;
  const value = (list) => Number(list.map((d) => d.digit).join(''));
  if (Number.isFinite(max) && max >= 1 && value(digits) > max) digits = fitUnderMax(digits, max) || digits;
  const amount = value(digits);
  return { amount: Number.isFinite(amount) ? amount : null, digits, groups };
};
