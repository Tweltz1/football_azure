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
export const setMuted = (value) => {
  muted = value;
  if (musicBus && ctx) musicBus.gain.setTargetAtTime(value ? 0 : MUSIC_LEVEL, ctx.currentTime, 0.4);
};
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
  whoosh: () => { tone(300, 0, 0.45, { type: 'sawtooth', gain: 0.03, slide: 500 }); tone(900, 0.1, 0.35, { type: 'triangle', gain: 0.03, slide: -600 }); },
  tick: () => tone(1320, 0, 0.05, { type: 'square', gain: 0.04 }),
};

// Background music: a slow, soft, spooky pad that's made up as it plays, so it never loops.
// Minor chords drift by every few seconds, a music-box melody wanders on top now and then, and a
// low bell tolls once in a while. Everything goes through a gentle low-pass and an echo.
const MUSIC_LEVEL = 0.05;
let musicBus = null;
let musicTimer = null;
let nextChordAt = 0;
let nextNoteAt = 0;
let nextBellAt = 0;
let chordIndex = 0;
let progression = [];

const midi = (n) => 440 * 2 ** ((n - 69) / 12);
// D harmonic minor, plus the chords it moves through (as MIDI root + quality).
const SCALE = [62, 64, 65, 67, 69, 70, 73, 74, 76, 77];
const PROGRESSIONS = [
  [[50, 'm'], [46, 'M'], [43, 'm'], [45, 'M']],
  [[50, 'm'], [43, 'm'], [46, 'M'], [45, 'M']],
  [[50, 'm'], [48, 'M'], [46, 'M'], [45, 'M']],
  [[43, 'm'], [50, 'm'], [45, 'M'], [50, 'm']],
];
const chordNotes = ([root, q]) => [root, root + (q === 'm' ? 3 : 4), root + 7, root + 12];

const voice = (freq, at, length, { type = 'sine', gain = 0.2, attack = 1.5, detune = 0 } = {}) => {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  osc.detune.setValueAtTime(detune, at);
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + attack);
  amp.gain.setValueAtTime(gain, at + Math.max(attack, length - 2));
  amp.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(amp).connect(musicBus);
  osc.start(at);
  osc.stop(at + length + 0.1);
};

const scheduleMusic = () => {
  if (!ctx || !musicBus) return;
  const now = ctx.currentTime;
  const ahead = now + 1.5;
  while (nextChordAt < ahead) {
    if (chordIndex % 4 === 0) progression = PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)];
    const chord = progression[chordIndex % 4];
    const len = 7 + Math.random() * 3;
    const at = nextChordAt;
    chordNotes(chord).forEach((n, i) => {
      voice(midi(n), at, len + 2, { type: i === 0 ? 'triangle' : 'sine', gain: i === 0 ? 0.22 : 0.12, attack: 2.2, detune: (Math.random() - 0.5) * 12 });
    });
    voice(midi(chord[0] - 12), nextChordAt, len + 2, { type: 'sine', gain: 0.18, attack: 2.5 });
    nextChordAt += len;
    chordIndex += 1;
  }
  while (nextNoteAt < ahead) {
    if (Math.random() < 0.55) {
      const n = SCALE[Math.floor(Math.random() * SCALE.length)] + (Math.random() < 0.3 ? 12 : 0);
      voice(midi(n), nextNoteAt, 2.6, { type: 'triangle', gain: 0.07, attack: 0.02 });
      voice(midi(n + 12), nextNoteAt, 1.4, { type: 'sine', gain: 0.025, attack: 0.02 });
    }
    nextNoteAt += [0.9, 1.2, 1.8, 2.4][Math.floor(Math.random() * 4)];
  }
  if (nextBellAt < ahead) {
    voice(midi(38), nextBellAt, 6, { type: 'sine', gain: 0.16, attack: 0.01 });
    voice(midi(38) * 2.76, nextBellAt, 3, { type: 'sine', gain: 0.03, attack: 0.01 });
    nextBellAt += 18 + Math.random() * 20;
  }
};

export const startMusic = () => {
  try {
    unlockSound();
    if (!ctx || musicBus) return;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.42;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    const wet = ctx.createGain();
    wet.gain.value = 0.4;
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(filter);
    filter.connect(ctx.destination);
    filter.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(ctx.destination);
    musicBus.gain.setTargetAtTime(muted ? 0 : MUSIC_LEVEL, ctx.currentTime, 1.5);
    nextChordAt = ctx.currentTime + 0.2;
    nextNoteAt = ctx.currentTime + 4;
    nextBellAt = ctx.currentTime + 10;
    chordIndex = 0;
    scheduleMusic();
    musicTimer = window.setInterval(scheduleMusic, 500);
  } catch (error) {
    musicBus = null;
  }
};

export const stopMusic = () => {
  if (musicTimer) window.clearInterval(musicTimer);
  musicTimer = null;
  if (musicBus && ctx) {
    const bus = musicBus;
    bus.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    window.setTimeout(() => { try { bus.disconnect(); } catch (error) { /* gone */ } }, 1500);
  }
  musicBus = null;
};
