// TV remote support: the arrow keys move a highlight between buttons and
// links, and OK/Enter presses the highlighted one (the browser already
// clicks a focused button or link on Enter).
//
// The highlight only shows after an arrow key is pressed, so mouse and
// touch users never see it. Styles live in TvScreen.css.

const DIRECTIONS = {
  ArrowUp: 'up', Up: 'up', 38: 'up',
  ArrowDown: 'down', Down: 'down', 40: 'down',
  ArrowLeft: 'left', Left: 'left', 37: 'left',
  ArrowRight: 'right', Right: 'right', 39: 'right',
};

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Arcade games use the arrow keys themselves.
const GAME_SELECTOR = '.game-hud, .race-game, .climb-stage, .fg-stage';

const KEYS_CLASS = 'tv-keys';

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
}

function candidates() {
  return Array.prototype.filter.call(document.querySelectorAll(FOCUSABLE), isVisible);
}

function center(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// Best next element in a direction: mostly ahead, and as close to the
// current row or column as possible.
export function pickNext(fromRect, rects, direction) {
  const from = center(fromRect);
  let best = -1;
  let bestScore = Infinity;
  rects.forEach((rect, index) => {
    const to = center(rect);
    let ahead;
    let across;
    if (direction === 'up') { ahead = from.y - to.y; across = to.x - from.x; }
    else if (direction === 'down') { ahead = to.y - from.y; across = to.x - from.x; }
    else if (direction === 'left') { ahead = from.x - to.x; across = to.y - from.y; }
    else { ahead = to.x - from.x; across = to.y - from.y; }
    if (ahead <= 1) return;
    const score = ahead + Math.abs(across) * 2;
    if (score < bestScore) { bestScore = score; best = index; }
  });
  return best;
}

function isTyping(el, direction) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    const textLike = ['text', 'search', 'email', 'url', 'tel', 'password', 'number', ''].indexOf(type) >= 0;
    // Up/down still leave a text box; left/right move the caret.
    return textLike && (direction === 'left' || direction === 'right');
  }
  return el.isContentEditable;
}

function focusEl(el) {
  try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  if (el.scrollIntoView) {
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { el.scrollIntoView(false); }
  }
}

function onKeyDown(event) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  const direction = DIRECTIONS[event.key] || DIRECTIONS[event.keyCode];
  if (!direction) return;
  if (document.querySelector(GAME_SELECTOR)) return;
  const active = document.activeElement;
  if (isTyping(active, direction)) return;

  const list = candidates();
  if (!list.length) return;
  document.documentElement.classList.add(KEYS_CLASS);

  const hasFocus = active && active !== document.body && list.indexOf(active) >= 0;
  if (!hasFocus) {
    // First press: start on the first thing on screen.
    const onScreen = list.filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    });
    event.preventDefault();
    focusEl(onScreen[0] || list[0]);
    return;
  }

  const others = list.filter((el) => el !== active);
  const index = pickNext(active.getBoundingClientRect(), others.map((el) => el.getBoundingClientRect()), direction);
  if (index < 0) return; // nothing that way: let the page scroll as normal
  event.preventDefault();
  focusEl(others[index]);
}

function onPointer() {
  document.documentElement.classList.remove(KEYS_CLASS);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('mousedown', onPointer, true);
  window.addEventListener('touchstart', onPointer, { capture: true, passive: true });
}
