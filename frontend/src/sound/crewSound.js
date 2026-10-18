// Cartoon music and sound effects for the signed-out screen, made live with Web Audio (no sound files).
// Intro: a drum-roll build-up, a bouncy theme under the guys, one sound per guy, and a ta-da on the lineup.
// Login page: a soft, quiet loop. Browsers keep sound off until the first tap or key press, so
// everything waits for that; a speaker button turns it all off and the choice is remembered.

const OFF_KEY = 'hoodLeague.soundOff';

let ctx = null;
let master = null;
let musicBus = null;
let sfxBus = null;
let song = null;
let nextTime = 0;
let stepIndex = 0;
let timer = null;
let unlockedAt = -Infinity;
const listeners = new Set();

export const soundOff = () => {
  try { return localStorage.getItem(OFF_KEY) === '1'; } catch (e) { return false; }
};

export const setSoundOff = (off) => {
  try { localStorage.setItem(OFF_KEY, off ? '1' : '0'); } catch (e) { /* private mode */ }
  if (master) master.gain.setTargetAtTime(off ? 0 : 0.6, ctx.currentTime, 0.05);
  if (!off) unlock();
  listeners.forEach((fn) => fn(off));
};

export const onSoundOffChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const AudioCtor = () => (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null;

const setup = () => {
  if (ctx) return ctx;
  const Ctor = AudioCtor();
  if (!Ctor) return null;
  // iPhone: play like a music app, so the ring/silent switch doesn't mute it (the speaker button still does).
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
  try { ctx = new Ctor(); } catch (e) { return null; }
  master = ctx.createGain();
  master.gain.value = soundOff() ? 0 : 0.6;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.9;
  musicBus.connect(master);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.9;
  sfxBus.connect(master);
  const wake = () => unlock();
  ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach((type) => window.addEventListener(type, wake, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ctx.suspend().catch(() => {});
    else if (song && unlockedAt > -Infinity) ctx.resume().catch(() => {});
  });
  return ctx;
};

function unlock() {
  if (!setup() || soundOff()) return;
  if (ctx.state !== 'running') {
    unlockedAt = performance.now();
    ctx.resume().catch(() => {});
    // Older iPhones also need a sound started inside the tap itself.
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, 22050);
    blip.connect(ctx.destination);
    blip.start(0);
  } else if (unlockedAt === -Infinity) {
    unlockedAt = performance.now();
  }
}

// Sounds are only queued while the browser lets them play (or a tap just asked it to),
// so nothing stacks up and blasts out later.
const ready = () => setup() && !soundOff() && (ctx.state === 'running' || performance.now() - unlockedAt < 1500);

/** True when sound is on but the browser is still waiting for a tap before it may play. */
export const soundLocked = () => Boolean(setup()) && !soundOff() && ctx.state !== 'running';

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function tone(bus, t, freq, dur, { type = 'triangle', gain = 0.2, to, attack = 0.005, filter } = {}) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = osc.connect(amp);
  if (filter) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = filter;
    node = node.connect(lp);
  }
  node.connect(bus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  return osc;
}

let noiseBuffer = null;
function noise(bus, t, dur, { gain = 0.2, type = 'bandpass', freq = 2000, to, q = 1 } = {}) {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.setValueAtTime(freq, t);
  if (to) filt.frequency.exponentialRampToValueAtTime(to, t + dur);
  filt.Q.value = q;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt).connect(amp).connect(bus);
  src.start(t);
  src.stop(t + dur + 0.05);
}

const kick = (t, g = 0.5) => tone(musicBus, t, 150, 0.14, { type: 'sine', gain: g, to: 45 });
const snare = (t, g = 0.18) => noise(musicBus, t, 0.12, { gain: g, freq: 1800 });
const hat = (t, g = 0.05) => noise(musicBus, t, 0.04, { gain: g, type: 'highpass', freq: 7000 });
const crash = (t, g = 0.22) => noise(sfxBus, t, 1.4, { gain: g, type: 'highpass', freq: 5000 });

// ----- songs: 8 eighth notes per bar, scheduled a little ahead of time -----

const C = [48, 64, 67, 72];
const F = [53, 65, 69, 72];
const G = [55, 62, 67, 71];

const SONGS = {
  // Bouncy cartoon theme under the guys.
  intro: {
    bpm: 136,
    bars: [
      { chord: C, tune: [72, null, 76, 79, 76, null, 72, 74] },
      { chord: F, tune: [77, null, 76, 74, 72, null, 69, null] },
      { chord: G, tune: [71, 74, 79, null, 77, 74, 71, null] },
      { chord: C, tune: [72, 76, 79, 84, null, 79, 72, null] },
    ],
    play(t, bar, i, eighth) {
      const [root, ...stab] = bar.chord;
      if (i % 2 === 0) tone(musicBus, t, hz(i % 4 === 0 ? root - 12 : root - 5), eighth * 0.9, { type: 'triangle', gain: 0.32 });
      else stab.forEach((n) => tone(musicBus, t, hz(n - 12), eighth * 0.5, { type: 'square', gain: 0.025, filter: 1800 }));
      const note = bar.tune[i];
      if (note) tone(musicBus, t, hz(note), eighth * 0.85, { type: 'square', gain: 0.06, filter: 3200 });
      if (i === 0 || i === 4) kick(t);
      if (i === 2 || i === 6) snare(t);
      hat(t);
    },
  },
  // Light background loop for the sign-in page.
  login: {
    bpm: 84,
    bars: [
      { chord: [48, 64, 67, 71] },
      { chord: [45, 60, 64, 67] },
      { chord: [41, 60, 64, 69] },
      { chord: [43, 62, 67, 71] },
    ],
    play(t, bar, i, eighth) {
      const [root, ...rest] = bar.chord;
      if (i === 0) {
        tone(musicBus, t, hz(root), eighth * 8, { type: 'sine', gain: 0.18, attack: 0.3 });
        rest.forEach((n) => tone(musicBus, t, hz(n), eighth * 8, { type: 'triangle', gain: 0.06, attack: 0.8 }));
      }
      const arp = [rest[0], rest[1], rest[2], rest[1] + 12, rest[2], rest[1], rest[0] + 12, rest[2]];
      tone(musicBus, t, hz(arp[i] + 12), eighth * 1.6, { type: 'triangle', gain: i % 2 ? 0.07 : 0.1 });
      if (i === 4) tone(musicBus, t, hz(root + 12), eighth * 3, { type: 'triangle', gain: 0.07, attack: 0.05 });
    },
  },
};

function tick() {
  if (!song || !ctx) return;
  if (ctx.state !== 'running') {
    nextTime = ctx.currentTime + 0.05;
    return;
  }
  const def = SONGS[song];
  const eighth = 60 / def.bpm / 2;
  if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
  while (nextTime < ctx.currentTime + 0.25) {
    const bar = def.bars[Math.floor(stepIndex / 8) % def.bars.length];
    def.play(nextTime, bar, stepIndex % 8, eighth);
    nextTime += eighth;
    stepIndex += 1;
  }
}

/** Starts the given song ('intro' or 'login') from the top, or stops music with null. */
export function playSong(name) {
  if (!setup()) return;
  if (song === name) return;
  song = name;
  stepIndex = 0;
  nextTime = ctx.currentTime + 0.05;
  if (name && !timer) timer = setInterval(tick, 40);
  if (!name && timer) {
    clearInterval(timer);
    timer = null;
  }
}

// ----- one-off sounds -----

/** Drum roll and rising whoosh under the title card, ending in a crash. */
export function buildUp(ms = 1600) {
  if (!ready()) return;
  const t0 = ctx.currentTime + 0.02;
  const end = t0 + ms / 1000 - 0.1;
  let t = t0;
  let gap = 0.12;
  while (t < end) {
    const g = 0.04 + 0.16 * ((t - t0) / (end - t0));
    noise(sfxBus, t, 0.06, { gain: g, freq: 1800 });
    t += gap;
    gap = Math.max(0.035, gap * 0.9);
  }
  tone(sfxBus, t0, 160, end - t0, { type: 'sawtooth', gain: 0.06, to: 900, attack: end - t0 - 0.05, filter: 1400 });
  crash(end);
  [60, 64, 67, 72].forEach((n) => tone(sfxBus, end, hz(n), 0.6, { type: 'square', gain: 0.05, filter: 2600 }));
  kick(end, 0.6);
}

const GUY_SOUNDS = [
  // John: Colts fanfare
  (t) => [67, 72, 76, 79].forEach((n, i) => tone(sfxBus, t + i * 0.1, hz(n), i === 3 ? 0.5 : 0.12, { type: 'sawtooth', gain: 0.09, filter: 2200 })),
  // Evan: robot 010101 beeps
  (t) => [0, 1, 0, 1, 0, 1].forEach((b, i) => tone(sfxBus, t + i * 0.09, b ? 1320 : 660, 0.07, { type: 'square', gain: 0.06 })),
  // Bush: uh-oh
  (t) => {
    tone(sfxBus, t, 520, 0.18, { type: 'sine', gain: 0.25, to: 480 });
    tone(sfxBus, t + 0.22, 400, 0.4, { type: 'sine', gain: 0.25, to: 260 });
  },
  // Pat: slide whistle up and down, then a toot
  (t) => {
    tone(sfxBus, t, 500, 0.35, { type: 'sine', gain: 0.2, to: 1600 });
    tone(sfxBus, t + 0.35, 1600, 0.35, { type: 'sine', gain: 0.2, to: 400 });
    tone(sfxBus, t + 0.8, 95, 0.35, { type: 'sawtooth', gain: 0.12, to: 70, filter: 500 });
  },
  // Michael: auction gavel and ka-ching
  (t) => {
    noise(sfxBus, t, 0.05, { gain: 0.5, freq: 900, q: 3 });
    noise(sfxBus, t + 0.16, 0.05, { gain: 0.5, freq: 900, q: 3 });
    tone(sfxBus, t + 0.4, 2093, 0.4, { type: 'triangle', gain: 0.12 });
    tone(sfxBus, t + 0.48, 2637, 0.6, { type: 'triangle', gain: 0.12 });
  },
  // Chrome: a shower of coins
  (t) => {
    for (let i = 0; i < 10; i += 1) tone(sfxBus, t + i * 0.06, 1800 + Math.random() * 1600, 0.12, { type: 'triangle', gain: 0.06 });
  },
  // Connor: ah-ooga horn
  (t) => [0, 0.5].forEach((d) => tone(sfxBus, t + d, 260, 0.4, { type: 'sawtooth', gain: 0.1, to: 440, filter: 1600 })),
  // Ben: ptooey
  (t) => {
    noise(sfxBus, t, 0.08, { gain: 0.3, freq: 600, q: 2 });
    noise(sfxBus, t + 0.12, 0.3, { gain: 0.25, freq: 3000, to: 400, q: 2 });
  },
  // Weltz: beaver boing and an OIP honk
  (t) => {
    const osc = tone(sfxBus, t, 180, 0.5, { type: 'sine', gain: 0.25, to: 520 });
    const wob = ctx.createOscillator();
    const depth = ctx.createGain();
    wob.frequency.value = 18;
    depth.gain.value = 40;
    wob.connect(depth).connect(osc.frequency);
    wob.start(t);
    wob.stop(t + 0.55);
    tone(sfxBus, t + 0.6, hz(76), 0.14, { type: 'square', gain: 0.07, filter: 2000 });
    tone(sfxBus, t + 0.76, hz(72), 0.22, { type: 'square', gain: 0.07, filter: 2000 });
  },
  // Logan: squeaky wipes
  (t) => [0, 0.16, 0.32].forEach((d) => tone(sfxBus, t + d, 1300, 0.12, { type: 'sine', gain: 0.1, to: 1900 })),
];

/** The sound for the guy at this spot in the intro. */
export function guySound(index) {
  if (!ready()) return;
  const play = GUY_SOUNDS[index % GUY_SOUNDS.length];
  play(ctx.currentTime + 0.25);
  tone(sfxBus, ctx.currentTime + 0.02, 300, 0.2, { type: 'sine', gain: 0.12, to: 900 });
}

/** A short coin-style ping (grabbing a football). */
export function blip() {
  if (!ready()) return;
  const t = ctx.currentTime + 0.01;
  tone(sfxBus, t, 988, 0.06, { type: 'square', gain: 0.05, filter: 4000 });
  tone(sfxBus, t + 0.06, 1319, 0.1, { type: 'square', gain: 0.05, filter: 4000 });
}

/** Ta-da for the whole crew lineup. */
export function taDa() {
  if (!ready()) return;
  const t = ctx.currentTime + 0.02;
  [60, 64, 67].forEach((n, i) => tone(sfxBus, t + i * 0.08, hz(n + 12), 0.12, { type: 'square', gain: 0.06, filter: 3000 }));
  [60, 64, 67, 72].forEach((n) => tone(sfxBus, t + 0.3, hz(n + 12), 1.2, { type: 'square', gain: 0.05, filter: 3000 }));
  crash(t + 0.3);
  kick(t + 0.3, 0.6);
}
