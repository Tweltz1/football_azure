// Recognizer benchmark: number accuracy for every bid $1-$200, and a per-digit confusion matrix from
// isolated digits, on the clean (handwriting.mjs) and messy (messyHandwriting.mjs) writers.
// Print a report: `node frontend/tests/benchmark.mjs`
import { readNumber } from '../src/whiteboard/recognizer.js';
import { rng, writeNumber } from './handwriting.mjs';
import { writeMessy } from './messyHandwriting.mjs';

export const WRITERS = {
  clean: (value, random) => writeNumber(value, random),
  messy: (value, random) => writeMessy(value, random),
};

export function numberAccuracy(write, { trials = 3, seed = 1234, read = readNumber } = {}) {
  const random = rng(seed);
  let correct = 0;
  let total = 0;
  const misses = {};
  for (let trial = 0; trial < trials; trial += 1) {
    for (let value = 1; value <= 200; value += 1) {
      const { amount } = read(write(value, random));
      total += 1;
      if (amount === value) correct += 1;
      else misses[`${value}->${amount}`] = (misses[`${value}->${amount}`] || 0) + 1;
    }
  }
  return { accuracy: correct / total, correct, total, misses };
}

/** Isolated digits: rows are the written digit, columns what was read ('x' = not one digit). */
export function confusion(write, { perDigit = 100, seed = 99, read = readNumber } = {}) {
  const random = rng(seed);
  const matrix = Array.from({ length: 10 }, () => ({}));
  let correct = 0;
  for (let digit = 0; digit <= 9; digit += 1) {
    for (let i = 0; i < perDigit; i += 1) {
      const { amount, digits } = read(write(digit, random));
      const got = digits.length === 1 ? String(amount) : 'x';
      matrix[digit][got] = (matrix[digit][got] || 0) + 1;
      if (got === String(digit)) correct += 1;
    }
  }
  return { matrix, accuracy: correct / (perDigit * 10), perDigit };
}

export function formatConfusion({ matrix, perDigit }) {
  const cols = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'x'];
  const lines = [`      ${cols.map((c) => c.padStart(4)).join('')}   acc`];
  matrix.forEach((row, digit) => {
    const cells = cols.map((c) => String(row[c] || '.').padStart(4)).join('');
    lines.push(`  ${digit} | ${cells}  ${(((row[String(digit)] || 0) / perDigit) * 100).toFixed(0).padStart(3)}%`);
  });
  return lines.join('\n');
}

const topMisses = (misses, n = 14) => Object.entries(misses).sort((a, b) => b[1] - a[1]).slice(0, n)
  .map(([k, c]) => `${k}${c > 1 ? `x${c}` : ''}`).join(', ');

export function report(label, write, opts = {}) {
  const numbers = numberAccuracy(write, opts);
  const digits = confusion(write, opts);
  return [
    `${label}: numbers $1-$200 x${opts.trials || 3}: ${(numbers.accuracy * 100).toFixed(1)}% (${numbers.correct}/${numbers.total})`,
    `  misses e.g. ${topMisses(numbers.misses) || 'none'}`,
    `${label}: isolated digits: ${(digits.accuracy * 100).toFixed(1)}%`,
    formatConfusion(digits),
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const started = Date.now();
  console.log(report('clean', WRITERS.clean));
  console.log(report('messy', WRITERS.messy));
  console.log(`(${((Date.now() - started) / 1000).toFixed(1)}s)`);
}
