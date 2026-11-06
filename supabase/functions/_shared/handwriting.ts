// Personal handwriting for whiteboard auto-read. When the commissioner awards a revealed board, the
// winner's drawing is split into digits; if the split has exactly as many digits as the awarded amount,
// each digit is saved to the winner's profile as a labelled example. The bidder's own device then reads
// their boards against these examples as well as the built-in templates (frontend/src/whiteboard/recognizer.js).
//
// Stored on the profile as `handwriting: { '4': [example, ...], ... }`, newest last, at most
// PER_DIGIT examples per digit. An example is a list of strokes, each a flat [x, y, x, y, ...] list of
// integers in a 0-100 box (the digit scaled uniformly so its larger side spans 0-100), like a board.

export type Handwriting = Record<string, number[][][]>;

export const HANDWRITING_LIMITS = { perDigit: 6, strokes: 8, points: 60 };

type Box = { minX: number; minY: number; maxX: number; maxY: number };

const boxOf = (strokes: number[][]): Box => {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const stroke of strokes) {
    for (let i = 0; i + 1 < stroke.length; i += 2) {
      box.minX = Math.min(box.minX, stroke[i]);
      box.maxX = Math.max(box.maxX, stroke[i]);
      box.minY = Math.min(box.minY, stroke[i + 1]);
      box.maxY = Math.max(box.maxY, stroke[i + 1]);
    }
  }
  return box;
};

/**
 * Splits a board into digits, left to right: strokes whose left-to-right extents overlap or touch
 * belong to the same digit. Deliberately cautious: touching digits come out as one group, which makes
 * the count disagree with the amount, and then nothing is learned from that board.
 */
export function splitBoardDigits(board: number[][]): number[][][] {
  const items = board
    .filter((stroke) => Array.isArray(stroke) && stroke.length >= 2)
    .map((stroke) => ({ stroke, ...boxOf([stroke]) }))
    .sort((a, b) => a.minX - b.minX);
  const groups: number[][][] = [];
  let right = -Infinity;
  for (const item of items) {
    if (groups.length === 0 || item.minX > right) {
      groups.push([item.stroke]);
      right = item.maxX;
    } else {
      groups[groups.length - 1].push(item.stroke);
      right = Math.max(right, item.maxX);
    }
  }
  return groups;
}

/** Keeps at most `limit` points of a flat stroke, always keeping both ends. */
const thin = (stroke: number[], limit: number): number[] => {
  const count = stroke.length / 2;
  if (count <= limit) return stroke;
  const out: number[] = [];
  for (let k = 0; k < limit; k += 1) {
    const i = Math.round((k * (count - 1)) / (limit - 1));
    out.push(stroke[i * 2], stroke[i * 2 + 1]);
  }
  return out;
};

/** One digit's strokes, rescaled to its own 0-100 box, rounded and thinned to fit the caps. */
export function toExample(strokes: number[][]): number[][] | null {
  const usable = strokes.filter((stroke) => stroke.length >= 2).slice(0, HANDWRITING_LIMITS.strokes);
  if (usable.length === 0) return null;
  const { minX, minY, maxX, maxY } = boxOf(usable);
  const size = Math.max(maxX - minX, maxY - minY);
  if (!(size > 0)) return null;
  const totalPoints = usable.reduce((sum, stroke) => sum + stroke.length / 2, 0);
  // Over the cap, every stroke gets an equal share of the points.
  const share = Math.max(2, Math.floor(HANDWRITING_LIMITS.points / usable.length));
  return usable.map((stroke) => {
    const scaled: number[] = [];
    for (let i = 0; i + 1 < stroke.length; i += 2) {
      const x = Math.round(((stroke[i] - minX) / size) * 100);
      const y = Math.round(((stroke[i + 1] - minY) / size) * 100);
      const n = scaled.length;
      if (n >= 2 && scaled[n - 2] === x && scaled[n - 1] === y) continue;
      scaled.push(x, y);
    }
    return totalPoints > HANDWRITING_LIMITS.points ? thin(scaled, share) : scaled;
  });
}

const isExample = (value: unknown): value is number[][] => Array.isArray(value)
  && value.length > 0
  && value.length <= HANDWRITING_LIMITS.strokes
  && value.reduce((sum: number, stroke: unknown) => sum + (Array.isArray(stroke) ? stroke.length / 2 : Infinity), 0) <= HANDWRITING_LIMITS.points
  && value.every((stroke) => Array.isArray(stroke) && stroke.length >= 2 && stroke.length % 2 === 0
    && stroke.every((n) => Number.isInteger(n) && n >= 0 && n <= 100));

/** Whatever is stored, keep only well-formed examples under the caps (newest kept). */
export function sanitizeHandwriting(value: unknown): Handwriting {
  const out: Handwriting = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [digit, examples] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[0-9]$/.test(digit) || !Array.isArray(examples)) continue;
    const kept = examples.filter(isExample).slice(-HANDWRITING_LIMITS.perDigit);
    if (kept.length) out[digit] = kept;
  }
  return out;
}

/**
 * Adds the digits of a revealed, awarded board to a writer's handwriting. Returns the updated
 * handwriting, or null when the board doesn't split into exactly one group per digit of the amount.
 */
export function learnFromBoard(current: unknown, board: number[][], amount: number): Handwriting | null {
  if (!Array.isArray(board) || !Number.isInteger(amount) || amount < 1) return null;
  const digits = String(amount);
  const groups = splitBoardDigits(board);
  if (groups.length !== digits.length) return null;
  const examples = groups.map(toExample);
  if (examples.some((example) => !example || !isExample(example))) return null;
  const next = sanitizeHandwriting(current);
  examples.forEach((example, i) => {
    const digit = digits[i];
    next[digit] = [...(next[digit] ?? []), example as number[][]].slice(-HANDWRITING_LIMITS.perDigit);
  });
  return next;
}
