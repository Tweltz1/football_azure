// Accuracy check for the whiteboard number reader: `node --test frontend/tests/whiteboardRecognizer.test.mjs`
// Synthesises handwriting for every bid from $1 to $200 (see handwriting.mjs), then reads it back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNumber, segmentStrokes } from '../src/whiteboard/recognizer.js';
import { encodeBoard, decodeBoard, BOARD_LIMITS } from '../src/whiteboard/boardCodec.js';
import { rng, writeNumber } from './handwriting.mjs';

const measure = (trials, options = {}, throughBoard = false) => {
  const random = rng(1234);
  let correct = 0;
  let total = 0;
  const misses = {};
  for (let trial = 0; trial < trials; trial += 1) {
    for (let value = 1; value <= 200; value += 1) {
      let strokes = writeNumber(value, random, options);
      if (throughBoard) strokes = decodeBoard(encodeBoard(strokes));
      const { amount } = readNumber(strokes);
      total += 1;
      if (amount === value) correct += 1;
      else misses[`${value}->${amount}`] = (misses[`${value}->${amount}`] || 0) + 1;
    }
  }
  return { accuracy: correct / total, correct, total, misses };
};

const report = (label, result) => {
  const worst = Object.entries(result.misses).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}${n > 1 ? `x${n}` : ''}`);
  console.log(`${label}: ${(result.accuracy * 100).toFixed(1)}% (${result.correct}/${result.total})${worst.length ? `; misses e.g. ${worst.join(', ')}` : ''}`);
};

test('reads synthetic handwritten bids $1-$200 at 95% or better', () => {
  const result = measure(3);
  report('raw strokes, 3 writers per bid', result);
  assert.ok(result.accuracy >= 0.95, `accuracy ${(result.accuracy * 100).toFixed(1)}%`);
});

test('reads boards after compression to the stored 0-100 format', () => {
  const result = measure(1, {}, true);
  report('compressed boards', result);
  assert.ok(result.accuracy >= 0.93, `accuracy ${(result.accuracy * 100).toFixed(1)}%`);
});

test('messier writing (more slant and rotation) still mostly reads', () => {
  const result = measure(1, { rotation: 12, slant: 0.3, jitter: 1.6 });
  report('messy (+-12 deg, slant 0.3)', result);
  assert.ok(result.accuracy >= 0.8);
});

test('two-stroke 4, 5 and 7 stay one digit each', () => {
  const random = rng(7);
  for (const value of [4, 5, 7, 47, 75, 145]) {
    const strokes = writeNumber(value, random);
    assert.equal(segmentStrokes(strokes).length, String(value).length, `${value}`);
  }
  assert.deepEqual(readNumber([]), { amount: null, digits: [] });
});

test('encoded boards are small and inside the server caps', () => {
  const random = rng(99);
  let largest = 0;
  for (const value of [8, 88, 188, 200]) {
    const board = encodeBoard(writeNumber(value, random));
    const size = JSON.stringify(board).length;
    largest = Math.max(largest, size);
    assert.ok(board.length <= BOARD_LIMITS.strokes);
    assert.ok(board.every((stroke) => stroke.every((n) => Number.isInteger(n) && n >= 0 && n <= 100)));
  }
  console.log(`largest encoded board: ${largest} bytes`);
  assert.ok(largest < 2000);
  // A scribble far past the caps is simplified until it fits.
  const scribble = [Array.from({ length: 20000 }, (_, i) => ({ x: Math.sin(i) * 500, y: Math.cos(i * 1.3) * 500 }))];
  const capped = encodeBoard(scribble);
  assert.ok(JSON.stringify(capped).length <= BOARD_LIMITS.bytes);
});
