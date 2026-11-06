// Hand-drawn charm pictures, the same on the TV and the phones. Emoji like 🧄 are missing on some
// older TV browsers, so the charms are drawn instead. Each fits a 100 x 100 box centered on 0,0.
const INK = 'stroke="#16122b" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"';

export const CHARM_ART = {
  garlic: `<path d="M0 -36 C6 -26 8 -20 16 -14 C34 -4 36 22 22 32 C12 39 -12 39 -22 32 C-36 22 -34 -4 -16 -14 C-8 -20 -6 -26 0 -36 Z" fill="#fbf6e6" ${INK}/>
    <path d="M0 -14 C-6 4 -6 22 0 36 M-14 -8 C-22 8 -20 24 -12 34 M14 -8 C22 8 20 24 12 34" fill="none" stroke="#c9bfa0" stroke-width="4"/>
    <path d="M-4 -36 L0 -44 L4 -36" fill="#9a8a6a" ${INK}/>`,
  salt: `<path d="M-20 -10 L20 -10 L24 36 L-24 36 Z" fill="#eef6ff" ${INK}/>
    <path d="M-20 -10 C-20 -34 20 -34 20 -10 Z" fill="#b9c3cf" ${INK}/>
    <circle cx="-7" cy="-22" r="3" fill="#16122b"/><circle cx="7" cy="-22" r="3" fill="#16122b"/><circle cx="0" cy="-28" r="3" fill="#16122b"/>
    <rect x="-17" y="8" width="34" height="14" rx="3" fill="#9ed3ff" stroke="#16122b" stroke-width="3"/>`,
  bell: `<path d="M0 -34 C-20 -34 -24 -12 -24 6 C-24 18 -32 22 -32 28 L32 28 C32 22 24 18 24 6 C24 -12 20 -34 0 -34 Z" fill="#f5c542" ${INK}/>
    <circle cx="0" cy="34" r="8" fill="#c9952a" ${INK}/>
    <circle cx="0" cy="-38" r="5" fill="#c9952a" ${INK}/>
    <path d="M-12 -18 C-16 -8 -16 4 -16 10" fill="none" stroke="#fff3c4" stroke-width="5" stroke-linecap="round"/>`,
  candy: `<path d="M-20 0 L-40 -16 L-36 0 L-40 16 Z M20 0 L40 -16 L36 0 L40 16 Z" fill="#ff5fa2" ${INK}/>
    <ellipse cx="0" cy="0" rx="22" ry="18" fill="#ff8bd0" ${INK}/>
    <path d="M-12 -12 L4 16 M2 -16 L14 8" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`,
  crystal: `<rect x="-22" y="22" width="44" height="14" rx="4" fill="#6b4a2b" ${INK}/>
    <circle cx="0" cy="-4" r="28" fill="#b48cff" ${INK}/>
    <circle cx="-10" cy="-14" r="8" fill="#e7dbff"/>
    <path d="M6 4 L10 -4 L14 4 L10 12 Z" fill="#fff" opacity="0.8"/>`,
  bone: `<path d="M-26 -8 C-38 -22 -48 -6 -36 0 C-48 6 -38 22 -26 8 L26 8 C38 22 48 6 36 0 C48 -6 38 -22 26 -8 Z" fill="#f4eedc" ${INK} transform="rotate(-30)"/>`,
  herb: `<path d="M0 38 C-2 18 -2 0 0 -36" fill="none" ${INK}/>
    <path d="M0 10 C-26 8 -34 -12 -26 -24 C-12 -20 -2 -8 0 10 Z" fill="#6fdc8c" ${INK}/>
    <path d="M0 -6 C24 -8 32 -26 26 -38 C12 -34 2 -22 0 -6 Z" fill="#4fbf6c" ${INK}/>
    <path d="M0 26 C20 26 30 12 28 2 C14 4 4 12 0 26 Z" fill="#6fdc8c" ${INK}/>`,
  star: `<path d="M0 -38 L11 -12 L38 -10 L17 8 L24 36 L0 21 L-24 36 L-17 8 L-38 -10 L-11 -12 Z" fill="#ffd84a" ${INK}/>
    <path d="M-8 -6 L-4 -2" stroke="#fff6c4" stroke-width="5" stroke-linecap="round"/>`,
};

/** SVG markup for a charm, or null when there's no drawing (junk uses its emoji). */
export const charmArt = (id) => CHARM_ART[id] || null;
