// Turns pad strokes into the compact `board` stored with a whiteboard bid, and back into SVG paths.
// A board is a list of strokes, each a flat [x, y, x, y, ...] list of integers in a 0-100 box (the drawing
// scaled uniformly so its larger side spans 0-100), simplified with Ramer-Douglas-Peucker.
// The server caps boards at 30 strokes, 2,000 points and ~6 KB; encodeBoard stays well inside that.

export const BOARD_LIMITS = { strokes: 30, points: 2000, bytes: 6000 };

const perpendicularDistance = (p, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / length;
};

export const simplify = (points, epsilon) => {
  if (points.length < 3) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let index = -1;
    let max = epsilon;
    for (let i = start + 1; i < end; i += 1) {
      const d = perpendicularDistance(points[i], points[start], points[end]);
      if (d > max) { max = d; index = i; }
    }
    if (index !== -1) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
};

/** Pad strokes ({x, y} points, any units) to the compact board format. Returns null for an empty pad. */
export const encodeBoard = (strokes) => {
  const usable = (strokes || []).filter((stroke) => stroke && stroke.length > 0).slice(-BOARD_LIMITS.strokes);
  if (usable.length === 0) return null;
  const all = usable.flat();
  const minX = Math.min(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const size = Math.max(Math.max(...all.map((p) => p.x)) - minX, Math.max(...all.map((p) => p.y)) - minY) || 1;
  const scaled = usable.map((stroke) => stroke.map((p) => ({ x: ((p.x - minX) / size) * 100, y: ((p.y - minY) / size) * 100 })));

  const fits = (board) => board.reduce((sum, stroke) => sum + stroke.length / 2, 0) <= BOARD_LIMITS.points
    && JSON.stringify(board).length <= BOARD_LIMITS.bytes;
  const encode = (epsilon, stride = 1) => scaled.map((stroke) => {
    const thinned = stride > 1 ? stroke.filter((_, i) => i % stride === 0 || i === stroke.length - 1) : stroke;
    const flat = [];
    simplify(thinned, epsilon).forEach((p) => {
      const x = Math.max(0, Math.min(100, Math.round(p.x)));
      const y = Math.max(0, Math.min(100, Math.round(p.y)));
      const n = flat.length;
      if (n >= 2 && flat[n - 2] === x && flat[n - 1] === y) return;
      flat.push(x, y);
    });
    return flat;
  });

  for (let epsilon = 0.6; epsilon < 12; epsilon *= 1.6) {
    const board = encode(epsilon);
    if (fits(board)) return board;
  }
  // Pathological input (a dense scribble): thin the points until it fits.
  for (let stride = 2; ; stride *= 2) {
    const board = encode(12, stride);
    if (fits(board) || stride > 4096) return board;
  }
};

/** Board back to {x, y} strokes (0-100 units), e.g. to re-read it. */
export const decodeBoard = (board) => (Array.isArray(board) ? board : []).map((stroke) => {
  const points = [];
  for (let i = 0; i + 1 < stroke.length; i += 2) points.push({ x: stroke[i], y: stroke[i + 1] });
  return points;
});

/** SVG path data and a padded viewBox that frames the drawing. */
export const boardToSvg = (board) => {
  const strokes = decodeBoard(board).filter((stroke) => stroke.length > 0);
  if (strokes.length === 0) return null;
  const all = strokes.flat();
  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxY = Math.max(...all.map((p) => p.y));
  const pad = 12;
  const paths = strokes.map((stroke) => (stroke.length === 1
    ? `M${stroke[0].x} ${stroke[0].y}h0.01`
    : `M${stroke.map((p) => `${p.x} ${p.y}`).join('L')}`));
  return {
    paths,
    viewBox: `${minX - pad} ${minY - pad} ${Math.max(maxX - minX, 10) + pad * 2} ${Math.max(maxY - minY, 10) + pad * 2}`,
  };
};
