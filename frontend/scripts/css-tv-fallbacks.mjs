// Adds fallbacks to the built CSS for old smart-TV browsers (Samsung Tizen
// 4/5 runs Chrome 56-63). Those browsers drop any declaration that uses
// min(), max() or clamp() (Chrome 79+) or `inset` (Chrome 87+), which breaks
// layouts that are sized with them, like the /party TV screen.
//
// For each such declaration this puts a plain version just before it. Old
// browsers keep the plain one; modern browsers read both and use the second.
// Fallbacks pick the value a big landscape screen would get: the upper bound
// of clamp() and the fixed length in min().
//
// Runs after `react-scripts build` (see package.json).
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const postcss = require('postcss');

const MATH_FN = /(^|[^\w-])(min|max|clamp)\(/i;
const FIXED_LENGTH = /^-?[\d.]+(px|rem|em)$/i;

// Split a function's argument text on top-level commas.
function splitArgs(text) {
  const args = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      args.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  args.push(text.slice(start).trim());
  return args;
}

// Bare math such as `100% - 24px` is only valid inside calc().
const asValue = (arg) => (/\s[-+*/]\s/.test(arg) && !/^calc\(/i.test(arg) ? `calc(${arg})` : arg);

function pick(name, args) {
  const fn = name.toLowerCase();
  if (fn === 'clamp') return asValue(args[2] || args[args.length - 1]);
  const fixed = args.find((arg) => FIXED_LENGTH.test(arg));
  return asValue(fixed || args[0]);
}

// Replace every min()/max()/clamp() in a value with one of its arguments.
export function fallbackValue(value) {
  let out = value;
  for (let guard = 0; guard < 50; guard += 1) {
    const match = MATH_FN.exec(out);
    if (!match) return out;
    const nameStart = match.index + match[1].length;
    const open = nameStart + match[2].length;
    let depth = 0;
    let close = -1;
    for (let i = open; i < out.length; i += 1) {
      if (out[i] === '(') depth += 1;
      else if (out[i] === ')') {
        depth -= 1;
        if (depth === 0) { close = i; break; }
      }
    }
    if (close < 0) return out;
    // Resolve nested functions in the arguments first.
    const args = splitArgs(fallbackValue(out.slice(open + 1, close)));
    out = out.slice(0, nameStart) + pick(match[2], args) + out.slice(close + 1);
  }
  return out;
}

function insetSides(value) {
  const parts = postcss.list.space(value);
  if (parts.length < 1 || parts.length > 4) return null;
  const [top, right = top, bottom = top, left = right] = parts;
  return { top, right, bottom, left };
}

export function addFallbacks(css) {
  const root = postcss.parse(css);
  root.walkDecls((decl) => {
    if (decl.parent.type !== 'rule') return;
    const usesMath = MATH_FN.test(decl.value);

    if (decl.prop.startsWith('--')) {
      // Custom properties never fail to parse, so a plain copy before them
      // would always lose. Override them in old browsers with @supports.
      if (!usesMath) return;
      const rule = decl.parent;
      const supports = postcss.atRule({ name: 'supports', params: 'not (width: min(1px, 2px))' });
      supports.append(postcss.rule({ selector: rule.selector }).append({ prop: decl.prop, value: fallbackValue(decl.value) }));
      rule.after(supports);
      return;
    }

    const value = usesMath ? fallbackValue(decl.value) : decl.value;
    if (decl.prop.toLowerCase() === 'inset') {
      const sides = insetSides(value);
      if (!sides) return;
      Object.keys(sides).forEach((side) => decl.cloneBefore({ prop: side, value: sides[side] }));
    } else if (usesMath && value !== decl.value) {
      decl.cloneBefore({ value });
    }
  });
  return root.toString();
}

function main() {
  const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../build/static/css');
  if (!fs.existsSync(dir)) {
    console.log('css-tv-fallbacks: no build/static/css, skipping');
    return;
  }
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.css'));
  files.forEach((name) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, addFallbacks(fs.readFileSync(file, 'utf8')));
  });
  console.log(`css-tv-fallbacks: updated ${files.length} CSS file(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
