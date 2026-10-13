// Accuracy checks for the whiteboard number reader: `node --test frontend/tests/whiteboardRecognizer.test.mjs`
// Synthesises handwriting for every bid from $1 to $200 and reads it back: neat writing (handwriting.mjs)
// and a much harder messy set (messyHandwriting.mjs). Neither shares shapes with the recognizer's
// templates. Full report with confusion matrices: `node frontend/tests/benchmark.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNumber, segmentStrokes } from '../src/whiteboard/recognizer.js';
import { encodeBoard, decodeBoard, BOARD_LIMITS } from '../src/whiteboard/boardCodec.js';
import { rng, writeNumber } from './handwriting.mjs';
import { WRITERS, confusion, formatConfusion, numberAccuracy } from './benchmark.mjs';

const summary = (label, result) => {
  const worst = Object.entries(result.misses).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}${n > 1 ? `x${n}` : ''}`);
  console.log(`${label}: ${(result.accuracy * 100).toFixed(1)}% (${result.correct}/${result.total})${worst.length ? `; misses e.g. ${worst.join(', ')}` : ''}`);
};

test('neat handwriting: bids $1-$200 read at 98% or better', () => {
  const result = numberAccuracy(WRITERS.clean, { trials: 3 });
  summary('neat, 3 writers per bid', result);
  assert.ok(result.accuracy >= 0.98, `accuracy ${(result.accuracy * 100).toFixed(1)}%`);
  const digits = confusion(WRITERS.clean);
  console.log(`neat, isolated digits ${(digits.accuracy * 100).toFixed(1)}%\n${formatConfusion(digits)}`);
  assert.ok(digits.accuracy >= 0.98);
});

test('reads boards after compression to the stored 0-100 format', () => {
  const read = (strokes) => readNumber(decodeBoard(encodeBoard(strokes)));
  const neat = numberAccuracy(WRITERS.clean, { trials: 1, read });
  summary('neat, compressed boards', neat);
  assert.ok(neat.accuracy >= 0.97);
  const messy = numberAccuracy(WRITERS.messy, { trials: 1, read });
  summary('messy, compressed boards', messy);
  assert.ok(messy.accuracy >= 0.9);
});

test('messy handwriting: rotated, slanted, shaky, touching and finger-sized bids still read', () => {
  const result = numberAccuracy(WRITERS.messy, { trials: 3 });
  summary('messy, 3 writers per bid', result);
  assert.ok(result.accuracy >= 0.94, `accuracy ${(result.accuracy * 100).toFixed(1)}%`);
  const digits = confusion(WRITERS.messy);
  console.log(`messy, isolated digits ${(digits.accuracy * 100).toFixed(1)}%\n${formatConfusion(digits)}`);
  assert.ok(digits.accuracy >= 0.97);
  digits.matrix.forEach((row, digit) => assert.ok((row[String(digit)] || 0) >= 90, `digit ${digit}`));
});

test('the max-bid hint turns impossible reads into the close runner-up', () => {
  const plain = numberAccuracy(WRITERS.messy, { trials: 3 });
  const hinted = numberAccuracy(WRITERS.messy, { trials: 3, read: (strokes) => readNumber(strokes, { max: 200 }) });
  summary('messy, max bid $200', hinted);
  assert.ok(hinted.accuracy >= plain.accuracy && hinted.accuracy >= 0.95, `accuracy ${(hinted.accuracy * 100).toFixed(1)}%`);
  // Never invents an amount over the max, and leaves a read alone when nothing close fits.
  const random = rng(5);
  for (const value of [7, 74, 177, 199]) {
    const strokes = writeNumber(value, random);
    const { amount } = readNumber(strokes, { max: 120 });
    assert.ok(amount === value || amount <= 120, `${value} -> ${amount}`);
  }
  assert.equal(readNumber(writeNumber(42, rng(1)), { max: 500 }).amount, 42);
});

test('segmentation: two-stroke 4, 5 and 7 stay one digit; side-by-side 1s split', () => {
  const random = rng(7);
  for (const value of [4, 5, 7, 47, 75, 145]) {
    const strokes = writeNumber(value, random);
    assert.equal(segmentStrokes(strokes).length, String(value).length, `${value}`);
  }
  // Two upright strokes side by side are 11, not a thick 1.
  assert.equal(readNumber([[{ x: 0, y: 0 }, { x: 1, y: 100 }], [{ x: 14, y: 0 }, { x: 15, y: 100 }]]).amount, 11);
  assert.deepEqual(readNumber([]), { amount: null, digits: [], groups: [] });
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
