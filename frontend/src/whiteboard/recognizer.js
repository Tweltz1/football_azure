// Client-side handwritten number reader for whiteboard bids. No network, no dependencies.
//
// 1. Segment: strokes whose x-ranges overlap belong to the same digit (a 4, 5 or 7 is often two strokes).
// 2. Recognise each group with the $P point-cloud recognizer (Vatavu, Anthony & Wobbrock, 2012) against
//    the templates in templates.js. $P ignores stroke order and direction, which suits handwriting.
// 3. Join the digits left to right.
//
// Strokes are arrays of {x, y} points (any units, y down). The read is a hint, not a ruling: in the
// auto-read style the commissioner sees the boards and confirms the amount before anything is awarded.

import { DIGIT_TEMPLATES } from './templates.js';

const N = 32;

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---- $P ------------------------------------------------------------------------------------

const toCloud = (strokes) => {
  const points = [];
  strokes.forEach((stroke, id) => {
    stroke.forEach((p) => points.push({ x: p.x, y: p.y, id }));
  });
  return points;
};

const pathLength = (points) => {
  let d = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].id === points[i - 1].id) d += distance(points[i - 1], points[i]);
  }
  return d;
};

const resample = (input, n) => {
  const points = input.map((p) => ({ ...p }));
  const length = pathLength(points);
  if (length < 1e-6) return Array.from({ length: n }, () => ({ ...points[0] }));
  const interval = length / (n - 1);
  let D = 0;
  const out = [{ ...points[0] }];
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].id !== points[i - 1].id) continue;
    const d = distance(points[i - 1], points[i]);
    if (D + d >= interval && d > 0) {
      const t = (interval - D) / d;
      const q = {
        x: points[i - 1].x + t * (points[i].x - points[i - 1].x),
        y: points[i - 1].y + t * (points[i].y - points[i - 1].y),
        id: points[i].id,
      };
      out.push(q);
      points.splice(i, 0, q);
      D = 0;
    } else {
      D += d;
    }
  }
  while (out.length < n) out.push({ ...points[points.length - 1] });
  return out.slice(0, n);
};

const scaleAndCenter = (points) => {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  points.forEach((p) => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  });
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  const scaled = points.map((p) => ({ x: (p.x - minX) / size, y: (p.y - minY) / size, id: p.id }));
  const cx = scaled.reduce((sum, p) => sum + p.x, 0) / scaled.length;
  const cy = scaled.reduce((sum, p) => sum + p.y, 0) / scaled.length;
  return scaled.map((p) => ({ x: p.x - cx, y: p.y - cy, id: p.id }));
};

const normalize = (strokes) => scaleAndCenter(resample(toCloud(strokes), N));

const cloudDistance = (a, b, start) => {
  const matched = new Array(a.length).fill(false);
  let sum = 0;
  let i = start;
  do {
    let index = -1;
    let min = Infinity;
    for (let j = 0; j < b.length; j += 1) {
      if (matched[j]) continue;
      const d = distance(a[i], b[j]);
      if (d < min) { min = d; index = j; }
    }
    matched[index] = true;
    sum += (1 - ((i - start + a.length) % a.length) / a.length) * min;
    i = (i + 1) % a.length;
  } while (i !== start);
  return sum;
};

const greedyCloudMatch = (points, template) => {
  const step = Math.floor(Math.sqrt(points.length));
  let min = Infinity;
  for (let i = 0; i < points.length; i += step) {
    min = Math.min(min, cloudDistance(points, template, i), cloudDistance(template, points, i));
  }
  return min;
};

const TEMPLATES = Object.entries(DIGIT_TEMPLATES).flatMap(([digit, variants]) => variants.map((strokes) => ({
  digit: Number(digit),
  points: normalize(strokes.map((stroke) => stroke.map(([x, y]) => ({ x, y })))),
})));

/** Best digit for one group of strokes, with the runner-up scores (lower is closer). */
export const recognizeDigit = (strokes) => {
  const points = normalize(strokes);
  const best = new Map();
  TEMPLATES.forEach((template) => {
    const score = greedyCloudMatch(points, template.points);
    if (!best.has(template.digit) || score < best.get(template.digit)) best.set(template.digit, score);
  });
  const ranked = [...best.entries()].sort((a, b) => a[1] - b[1]).map(([digit, score]) => ({ digit, score }));
  return { digit: ranked[0].digit, score: ranked[0].score, ranked };
};

// ---- Segmentation ------------------------------------------------------------------------------

const bounds = (points) => {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  points.forEach((p) => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  });
  return { minX, minY, maxX, maxY };
};

const nearestGap = (stroke, strokes) => {
  let min = Infinity;
  const step = Math.max(1, Math.floor(stroke.length / 40));
  for (let i = 0; i < stroke.length; i += step) {
    for (let k = 0; k < strokes.length; k += 1) {
      const other = strokes[k];
      const otherStep = Math.max(1, Math.floor(other.length / 40));
      for (let j = 0; j < other.length; j += otherStep) min = Math.min(min, distance(stroke[i], other[j]));
    }
  }
  return min;
};

/** Groups strokes into digits, left to right: strokes whose x-ranges overlap are one digit. */
export const segmentStrokes = (strokes) => {
  const items = strokes
    .filter((stroke) => stroke.length > 0)
    .map((stroke) => ({ stroke, ...bounds(stroke) }))
    .sort((a, b) => a.minX - b.minX);
  if (items.length === 0) return [];

  const height = Math.max(...items.map((s) => s.maxY)) - Math.min(...items.map((s) => s.minY));
  const groups = [];
  items.forEach((item) => {
    const group = groups[groups.length - 1];
    if (group) {
      const overlap = Math.min(group.maxX, item.maxX) - Math.max(group.minX, item.minX);
      const centerInGroup = (item.minX + item.maxX) / 2 <= group.maxX;
      const narrowest = Math.max(Math.min(group.maxX - group.minX, item.maxX - item.minX), height * 0.12);
      // A stem drawn onto a loop (a 9's tail, a 4's upright) touches it even when the ranges barely overlap.
      const touches = overlap > -height * 0.06 && nearestGap(item.stroke, group.strokes) < height * 0.09;
      if (centerInGroup || overlap > narrowest * 0.4 || touches) {
        group.strokes.push(item.stroke);
        group.maxX = Math.max(group.maxX, item.maxX);
        return;
      }
    }
    groups.push({ strokes: [item.stroke], minX: item.minX, maxX: item.maxX });
  });
  return groups.map((group) => group.strokes);
};

/**
 * Reads a handwritten number. Returns { amount, digits } where amount is null when nothing was drawn.
 * Leading zeros are dropped ("034" reads as 34).
 */
export const readNumber = (strokes) => {
  const usable = (strokes || []).filter((stroke) => stroke && stroke.length > 0);
  if (usable.length === 0) return { amount: null, digits: [] };
  const digits = segmentStrokes(usable).map((group) => recognizeDigit(group));
  const amount = Number(digits.map((d) => d.digit).join(''));
  return { amount: Number.isFinite(amount) ? amount : null, digits };
};
