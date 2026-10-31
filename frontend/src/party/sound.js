// Tiny synth for the TV. Browsers only allow sound after a tap or click, which "Open a room" is.
let ctx = null;
let muted = false;

export const unlockSound = () => {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch (error) {
    ctx = null;
  }
};
export const setMuted = (value) => { muted = value; };
export const isMuted = () => muted;

const tone = (freq, at, length, { type = 'sine', gain = 0.12, slide = 0 } = {}) => {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + length);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length + 0.05);
};

export const sfx = {
  join: () => { tone(523, 0, 0.12, { type: 'triangle' }); tone(784, 0.08, 0.18, { type: 'triangle' }); },
  spawn: () => tone(180, 0, 0.5, { type: 'sawtooth', gain: 0.04, slide: -90 }),
  hit: () => tone(660, 0, 0.12, { type: 'triangle', gain: 0.08, slide: 200 }),
  banish: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.06, 0.18, { type: 'triangle', gain: 0.08 })),
  fizzle: () => tone(140, 0, 0.3, { type: 'square', gain: 0.05, slide: -60 }),
  candle: () => { tone(110, 0, 0.6, { type: 'sine', gain: 0.25, slide: -50 }); tone(70, 0.05, 0.7, { type: 'triangle', gain: 0.15 }); },
  boss: () => [110, 104, 98, 92].forEach((f, i) => tone(f, i * 0.35, 0.5, { type: 'sawtooth', gain: 0.08 })),
  soul: () => tone(440, 0, 0.4, { type: 'sine', gain: 0.1, slide: 440 }),
  soulDone: () => [523, 659, 784, 1047].forEach((f) => tone(f, 0, 1.2, { type: 'sine', gain: 0.06 })),
  night: () => [196, 233, 294, 277].forEach((f, i) => tone(f, i * 0.28, 0.5, { type: 'triangle', gain: 0.1 })),
  won: () => [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.14, 0.3, { type: 'triangle', gain: 0.1 })),
  lost: () => [392, 349, 311, 262].forEach((f, i) => tone(f, i * 0.3, 0.5, { type: 'sawtooth', gain: 0.06 })),
  tick: () => tone(1320, 0, 0.05, { type: 'square', gain: 0.04 }),
};
