// Display capitalization. Stored names stay as typed (matching and aisle lookup don't care);
// screens show them with proper capitals.

const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'n']);

const upper = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** "chicken and broccoli stir-fry" -> "Chicken and Broccoli Stir-Fry". Words already capitalized (BLT, iPhone) are kept. */
export function titleCase(s: string): string {
  let first = true;
  return s.replace(/[A-Za-z][\w']*/g, (w, at: number) => {
    const afterHyphen = at > 0 && s[at - 1] === '-';
    const keep = !first && !afterHyphen && SMALL.has(w.toLowerCase());
    first = false;
    if (/[A-Z]/.test(w)) return w; // keep BLT, McCormick
    return keep ? w : upper(w);
  });
}

/** "olive oil" -> "Olive oil": a capital to start, the rest as typed. */
export const capFirst = (s: string) =>
  properNouns(s).replace(/^(\W*)([a-z])(\w*)/, (m, pre: string, c: string, rest: string) => (/[A-Z]/.test(rest) ? m : pre + c.toUpperCase() + rest));

// Names that keep a capital anywhere in a sentence ("caesar dressing" -> "Caesar dressing").
const PROPER: [RegExp, string][] = [
  'Caesar', 'Parmesan', 'Parmigiano', 'Reggiano', 'Romano', 'Greek', 'Italian', 'Dijon', 'Cajun', 'Worcestershire', 'Mexican',
  'Thai', 'Swiss', 'Monterey Jack', 'Colby', 'Gruyere', 'Tuscan', 'French', 'Asian', 'Sriracha', 'Tabasco', 'Old Bay', 'Kalamata',
  'Yukon', 'Granny Smith', 'Cheerios',
].map((w) => [new RegExp(`\\b${w.toLowerCase()}\\b`, 'g'), w]);

/** Capitalizes names like Caesar, Parmesan and Dijon wherever they appear. */
export function properNouns(s: string): string {
  let out = s;
  for (const [re, w] of PROPER) out = out.replace(re, w);
  return out;
}
