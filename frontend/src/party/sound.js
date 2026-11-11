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
let intensity = 0;
let musicFilter = null;
let nextBeatAt = 0;
let nextCreepAt = 0;

/**
 * How tense the game is, 0 (calm lobby) to 1 (the final stretch). The music slowly speeds up,
 * a soft heartbeat creeps in, and spooky noises (wind, creaks, an owl, a far-off cackle) turn up
 * a little more often. Changes are eased so nothing jumps.
 */
export const setMusicIntensity = (k) => {
  const target = Math.max(0, Math.min(1, Number(k) || 0));
  intensity += (target - intensity) * 0.02;
  if (Math.abs(target - intensity) < 0.002) intensity = target;
  if (musicFilter && ctx) musicFilter.frequency.setTargetAtTime(1400 + 1100 * intensity, ctx.currentTime, 2);
};

let noiseBuffer = null;
const noise = () => {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  return src;
};

// One spooky sound, quiet and far away.
const CREEPS = [
  (at) => { // wind gust
    const src = noise();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(300, at);
    band.frequency.linearRampToValueAtTime(900, at + 2);
    band.frequency.linearRampToValueAtTime(350, at + 4.5);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(0.5, at + 1.8);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + 4.5);
    src.connect(band).connect(amp).connect(musicBus);
    src.start(at);
    src.stop(at + 4.6);
  },
  (at) => { // door creak
    [0, 0.35].forEach((d, i) => voice(140 + i * 30, at + d, 0.9, { type: 'sawtooth', gain: 0.05, attack: 0.15, detune: i ? 300 : -200 }));
  },
  (at) => { // owl: hoo, hoo-hoo
    [0, 0.55, 0.8].forEach((d) => voice(midi(64), at + d, 0.45, { type: 'sine', gain: 0.12, attack: 0.08 }));
  },
  (at) => { // far-off cackle
    [0, 0.13, 0.26, 0.39, 0.52].forEach((d, i) => voice(midi(79 - i), at + d, 0.16, { type: 'triangle', gain: 0.05, attack: 0.02 }));
  },
  (at) => { // chains / distant clank
    [0, 0.21, 0.5].forEach((d) => { voice(midi(86), at + d, 0.5, { type: 'square', gain: 0.012, attack: 0.005 }); voice(midi(81), at + d, 0.4, { type: 'sine', gain: 0.03, attack: 0.005 }); });
  },
];

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
    const len = (7 + Math.random() * 3) * (1 - 0.45 * intensity);
    const at = nextChordAt;
    chordNotes(chord).forEach((n, i) => {
      voice(midi(n), at, len + 2, { type: i === 0 ? 'triangle' : 'sine', gain: i === 0 ? 0.22 : 0.12, attack: 2.2, detune: (Math.random() - 0.5) * 12 });
    });
    voice(midi(chord[0] - 12), nextChordAt, len + 2, { type: 'sine', gain: 0.18, attack: 2.5 });
    nextChordAt += len;
    chordIndex += 1;
  }
  while (nextNoteAt < ahead) {
    if (Math.random() < 0.55 + 0.25 * intensity) {
      const n = SCALE[Math.floor(Math.random() * SCALE.length)] + (Math.random() < 0.3 ? 12 : 0);
      voice(midi(n), nextNoteAt, 2.6, { type: 'triangle', gain: 0.07, attack: 0.02 });
      voice(midi(n + 12), nextNoteAt, 1.4, { type: 'sine', gain: 0.025, attack: 0.02 });
    }
    nextNoteAt += [0.9, 1.2, 1.8, 2.4][Math.floor(Math.random() * 4)] * (1 - 0.45 * intensity);
  }
  if (nextBellAt < ahead) {
    voice(midi(38), nextBellAt, 6, { type: 'sine', gain: 0.16, attack: 0.01 });
    voice(midi(38) * 2.76, nextBellAt, 3, { type: 'sine', gain: 0.03, attack: 0.01 });
    nextBellAt += (18 + Math.random() * 20) * (1 - 0.4 * intensity);
  }
  // A soft heartbeat once things get tense, quickening toward the end.
  if (intensity < 0.35) nextBeatAt = Math.max(nextBeatAt, now + 1);
  while (intensity >= 0.35 && nextBeatAt < ahead) {
    const g = 0.12 + 0.18 * (intensity - 0.35);
    voice(midi(31), nextBeatAt, 0.35, { type: 'sine', gain: g, attack: 0.01 });
    voice(midi(31), nextBeatAt + 0.22, 0.3, { type: 'sine', gain: g * 0.7, attack: 0.01 });
    nextBeatAt += 1.5 - 0.6 * intensity;
  }
  if (intensity >= 0.15 && nextCreepAt < ahead) {
    if (nextCreepAt > now - 5) CREEPS[Math.floor(Math.random() * CREEPS.length)](Math.max(now + 0.1, nextCreepAt));
    nextCreepAt = Math.max(now, nextCreepAt) + (26 + Math.random() * 20) * (1 - 0.5 * intensity);
  }
};

export const startMusic = () => {
  try {
    unlockSound();
    if (!ctx || musicBus) return;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    musicFilter = filter;
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
    nextBeatAt = ctx.currentTime + 1;
    nextCreepAt = ctx.currentTime + 20;
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
