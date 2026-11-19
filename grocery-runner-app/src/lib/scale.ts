// Scaling a recipe's amounts when the shopper changes the number of servings. Pure logic, no React.

const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

/** "4 servings", "Serves 6", "5", "8-10" → 4, 6, 5, 8. Null when there's no number. */
export function baseServings(servings: string | undefined): number | null {
  const n = Number(servings?.match(/\d+/)?.[0]);
  return n > 0 && n <= 100 ? n : null;
}

const parseNum = (s: string): number => {
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return Number(s);
};

/** 1.5 → "1 1/2", 0.333 → "1/3", 2.2 → "2.2". Rounds to kitchen fractions where close. */
export function niceNumber(x: number): string {
  if (x <= 0) return '0';
  const whole = Math.floor(x + 1e-9);
  const rest = x - whole;
  const fracs: [number, string][] = [[0, ''], [1 / 8, '1/8'], [1 / 4, '1/4'], [1 / 3, '1/3'], [1 / 2, '1/2'], [2 / 3, '2/3'], [3 / 4, '3/4'], [1, '']];
  const [value, text] = fracs.reduce((best, f) => (Math.abs(f[0] - rest) < Math.abs(best[0] - rest) ? f : best));
  if (Math.abs(value - rest) > 0.06 && x < 10) return String(Math.round(x * 10) / 10);
  const w = value === 1 ? whole + 1 : whole;
  if (!text) return String(w);
  return w ? `${w} ${text}` : text;
}

const NUM = String.raw`\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?`;
const LEAD = new RegExp(String.raw`^(?:(${NUM})(?:\s*(-|–|to)\s*(${NUM}))?|(a|an|one|two|three|four|five|six)\b)`, 'i');

/** Multiplies the amount at the start ("2 (15 oz) cans" × 2 → "4 (15 oz) cans"); package sizes and units stay. */
export function scaleAmount(amount: string, factor: number): string {
  if (!amount || factor === 1) return amount;
  const m = amount.match(LEAD);
  if (!m) return amount;
  const rest = amount.slice(m[0].length);
  if (m[4]) return `${niceNumber(WORDS[m[4].toLowerCase()] * factor)}${rest}`;
  const low = niceNumber(parseNum(m[1]) * factor);
  return m[3] ? `${low}${m[2] === 'to' ? ' to ' : '-'}${niceNumber(parseNum(m[3]) * factor)}${rest}` : `${low}${rest}`;
}
