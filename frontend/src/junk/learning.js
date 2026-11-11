// Learning loop: when the phone guessed a name and the person changed it (or, if they share pictures, kept
// it), the guess and their final name are sent so the item recognition models can be retrained. A small
// picture of just that item goes along only when they said yes when agreeing to the rules, or turned on
// "Help improve item recognition" in the Me tab (off by default). The full photo, location and everything
// else stay on the phone.
import { sendLabelFix } from './junkApi';

const SHARE_KEY = 'jk-share-crops';
const CROP_PX = 299;

export function sharesCrops() {
  try { return window.localStorage.getItem(SHARE_KEY) === '1'; } catch (error) { return false; }
}
export function setSharesCrops(on) {
  try { window.localStorage.setItem(SHARE_KEY, on ? '1' : '0'); } catch (error) { /* private mode: stays off */ }
}

const norm = (s) => String(s || '').toLowerCase().replace(/\s+\d+$/, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Whether the person changed the guessed name or category (renumbering "Battery 1" doesn't count). */
export function wasFixed(guess, title, category) {
  if (!guess || !guess.title) return false;
  if (norm(guess.title) !== norm(title)) return !!norm(title);
  return !!guess.category && !!category && guess.category !== category;
}

// Learning on this phone: when someone renames the same guess to the same thing twice ("Suitcase" -> "Tool
// chest"), the phone uses their name for that guess from then on. Kept only on this phone, never sent.
const MINE_KEY = 'jk-my-names';
const MINE_MAX = 200;
export const MINE_AFTER = 2;

function readMine() {
  try { return JSON.parse(window.localStorage.getItem(MINE_KEY) || '{}') || {}; } catch (error) { return {}; }
}

/** Remembers the names this person changed (items: [{ guess, title, category }]). */
export function rememberNames(items) {
  const mine = readMine();
  for (const p of items) {
    if (!p.guess || !p.guess.title || !wasFixed(p.guess, p.title, p.category)) continue;
    const key = norm(p.guess.original || p.guess.title);
    const title = String(p.title).trim().replace(/\s+\d+$/, '');
    const was = mine[key];
    mine[key] = was && norm(was.title) === norm(title)
      ? { ...was, title, category: p.category || was.category, n: was.n + 1, at: Date.now() }
      : { title, category: p.category || 'other', n: 1, at: Date.now() };
  }
  const keys = Object.keys(mine).sort((a, b) => mine[b].at - mine[a].at).slice(0, MINE_MAX);
  try { window.localStorage.setItem(MINE_KEY, JSON.stringify(Object.fromEntries(keys.map((k) => [k, mine[k]])))); } catch (error) { /* private mode */ }
}

/** A guess with this person's own name for it, when they've given it that name often enough. */
export function myName(thing) {
  if (!thing || !thing.title) return thing;
  const m = readMine()[norm(thing.title)];
  if (!m || m.n < MINE_AFTER || norm(m.title) === norm(thing.title)) return thing;
  return { ...thing, original: thing.title, title: m.title, category: m.category || thing.category, source: 'you' };
}

/**
 * What to teach from a finished post: every name the person changed, and, when they share item pictures,
 * also every guess they kept (a picture with a name they confirmed teaches as much as a fix).
 * items: [{ guess, title, category }]
 */
export function namesToTeach(items, share = sharesCrops()) {
  return items
    .filter((p) => p.guess && p.guess.title && norm(p.title) && (wasFixed(p.guess, p.title, p.category) || share))
    .map((p) => ({ guess: p.guess, title: String(p.title).trim(), category: p.category }));
}

/** The part of a JPEG data URL inside box (0-1, top left), squared up with a little room, as a small JPEG. */
export function cropJpeg(dataUrl, box) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const W = img.naturalWidth, H = img.naturalHeight;
        const b = box || { x: 0, y: 0, w: 1, h: 1 };
        const side = Math.min(Math.max(b.w * W, b.h * H) * 1.1, Math.max(W, H));
        const cx = (b.x + b.w / 2) * W, cy = (b.y + b.h / 2) * H;
        const sx = Math.max(0, Math.min(W - side, cx - side / 2)), sy = Math.max(0, Math.min(H - side, cy - side / 2));
        const canvas = document.createElement('canvas');
        canvas.width = CROP_PX; canvas.height = CROP_PX;
        const g = canvas.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, CROP_PX, CROP_PX);
        g.drawImage(img, sx, sy, Math.min(side, W), Math.min(side, H), 0, 0, CROP_PX * Math.min(side, W) / side, CROP_PX * Math.min(side, H) / side);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } catch (error) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Sends each fix: [{ guess: { title, label, source, confidence, category, box }, title, category }]. Never throws
 * and never holds up posting.
 */
export async function sendFixes(fixes, photo) {
  const share = sharesCrops() && !!photo;
  for (const f of fixes.slice(0, 12)) {
    try {
      const crop = share ? await cropJpeg(photo, f.guess.box) : null;
      await sendLabelFix({
        app: 'curbsy',
        guess: { label: f.guess.label || '', title: f.guess.title, source: f.guess.source || '', confidence: f.guess.confidence },
        title: f.title, category: f.category, ...(crop ? { crop } : {}),
      });
    } catch (error) { /* best effort */ }
  }
}
