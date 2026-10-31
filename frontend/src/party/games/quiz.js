// Fright Quiz: easy Halloween trivia, everyone for themselves. Pure game logic, no React, so it can
// be tested on its own. The TV owns the state and calls tick() many times a second.

import { pickQuestions } from '../quizQuestions.js';

export const QUESTION_COUNT = 15;
export const ROUND_SIZE = 5;
export const ROUND_MS = 6000;
export const READ_MS = 3500;
export const ANSWER_MS = 15000;
export const REVEAL_MS = 6500;
export const SCORES_MS = 7500;
export const CLOSE_MS = 900; // after the last answer comes in
export const BASE = 500;
export const SPEED = 500;
export const FASTEST = 100;
export const STREAK = 100;
export const ACTIVE_MS = 30000;

export const ROUNDS = [
  { title: 'Round 1', blurb: 'Warm up! The faster your right answer, the more points you get.' },
  { title: 'Round 2', blurb: 'Getting spookier. The first right answer earns a Fastest bonus.' },
  { title: 'Round 3: Double Trouble', blurb: 'Every point counts double. Anyone can still win!' },
];

const mulberry = (seed) => {
  let r = seed | 0;
  return () => {
    r = (r + 0x6D2B79F5) | 0;
    let t = r;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const emit = (s, type, data = {}) => {
  s.eventId += 1;
  s.events.push({ id: s.eventId, type, ...data });
  if (s.events.length > 60) s.events.splice(0, s.events.length - 60);
};

const setPhase = (s, phase, now) => {
  s.phase = phase;
  s.phaseAt = now;
};

const freshStats = () => ({ right: 0, fastest: 0, streak: 0, bestStreak: 0, answered: 0, totalMs: 0 });

export const roundOf = (index) => Math.min(ROUNDS.length - 1, Math.floor(index / ROUND_SIZE));
export const multiplier = (index) => (roundOf(index) === ROUNDS.length - 1 ? 2 : 1);

/** A new quiz. players: [{ cid, name }]. */
export function createQuiz(players, seed = Date.now(), now = 0, count = QUESTION_COUNT) {
  const rand = mulberry(seed);
  const s = {
    players: players.map((p) => ({ cid: p.cid, name: p.name })),
    questions: pickQuestions(rand, count),
    index: 0,
    phase: 'round',
    phaseAt: now,
    answers: {},
    closeAt: null,
    scores: {},
    stats: {},
    lastSeen: {},
    prevRanks: {},
    last: null,
    events: [],
    eventId: 0,
  };
  s.players.forEach((p) => {
    s.scores[p.cid] = 0;
    s.stats[p.cid] = freshStats();
    s.lastSeen[p.cid] = now;
  });
  emit(s, 'round', { round: 0 });
  return s;
}

export const activePlayers = (s, now) => s.players.filter((p) => now - (s.lastSeen[p.cid] ?? -1e9) <= ACTIVE_MS);

/** Everyone in score order, with ties sharing a place: [{ cid, name, score, rank }]. */
export function ranking(s) {
  const list = s.players.map((p, i) => ({ cid: p.cid, name: p.name, score: s.scores[p.cid] || 0, i }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  let rank = 0;
  return list.map((p, i) => {
    if (i === 0 || p.score !== list[i - 1].score) rank = i + 1;
    return { cid: p.cid, name: p.name, score: p.score, rank };
  });
}

const scoreQuestion = (s, now) => {
  const q = s.questions[s.index];
  const mult = multiplier(s.index);
  s.prevRanks = Object.fromEntries(ranking(s).map((r) => [r.cid, r.rank]));
  const right = Object.entries(s.answers).filter(([, a]) => a.choice === q.correct).sort((a, b) => a[1].ms - b[1].ms);
  const fastestCid = right[0]?.[0] || null;
  const gains = {};
  s.players.forEach(({ cid }) => {
    const a = s.answers[cid];
    const st = s.stats[cid] || (s.stats[cid] = freshStats());
    if (!a || a.choice !== q.correct) {
      st.streak = 0;
      gains[cid] = { gain: 0, right: false, choice: a ? a.choice : null, ms: a ? a.ms : null };
      return;
    }
    st.streak += 1;
    st.bestStreak = Math.max(st.bestStreak, st.streak);
    st.right += 1;
    const speed = Math.round(SPEED * Math.max(0, 1 - a.ms / ANSWER_MS));
    let gain = BASE + speed;
    const fastest = cid === fastestCid;
    if (fastest) { gain += FASTEST; st.fastest += 1; }
    const streak = st.streak >= 3;
    if (streak) gain += STREAK;
    gain *= mult;
    s.scores[cid] = (s.scores[cid] || 0) + gain;
    gains[cid] = { gain, right: true, choice: a.choice, ms: a.ms, fastest, streak: streak ? st.streak : 0 };
  });
  const counts = q.answers.map((_, i) => Object.values(s.answers).filter((a) => a.choice === i).length);
  s.last = { index: s.index, correct: q.correct, gains, counts, fastestCid, fastestMs: fastestCid ? s.answers[fastestCid].ms : null };
  setPhase(s, 'reveal', now);
  emit(s, 'reveal', { right: right.length });
};

const nextQuestion = (s, now) => {
  s.index += 1;
  s.answers = {};
  s.closeAt = null;
  if (s.index % ROUND_SIZE === 0) {
    setPhase(s, 'round', now);
    emit(s, 'round', { round: roundOf(s.index) });
  } else {
    setPhase(s, 'read', now);
    emit(s, 'question', { index: s.index });
  }
};

/** Advances the quiz to `now` (ms). */
export function tick(s, now) {
  const elapsed = now - s.phaseAt;
  switch (s.phase) {
    case 'round':
      if (elapsed >= ROUND_MS) { setPhase(s, 'read', now); emit(s, 'question', { index: s.index }); }
      break;
    case 'read':
      if (elapsed >= READ_MS) { setPhase(s, 'answer', now); emit(s, 'open', { index: s.index }); }
      break;
    case 'answer':
      if (elapsed >= ANSWER_MS || (s.closeAt != null && now >= s.closeAt)) scoreQuestion(s, now);
      break;
    case 'reveal':
      if (elapsed >= REVEAL_MS) {
        if (s.index >= s.questions.length - 1) {
          s.prevRanks = Object.fromEntries(ranking(s).map((r) => [r.cid, r.rank]));
          setPhase(s, 'final', now);
          emit(s, 'final');
        } else if ((s.index + 1) % ROUND_SIZE === 0) {
          setPhase(s, 'scores', now);
          emit(s, 'scores');
        } else {
          nextQuestion(s, now);
        }
      }
      break;
    case 'scores':
      if (elapsed >= SCORES_MS) nextQuestion(s, now);
      break;
    default:
      break;
  }
  return s;
}

/** A phone's answer. Only the first answer to each question counts. Returns true if taken. */
export function answer(s, cid, choice, now) {
  if (s.phase !== 'answer' || s.answers[cid] || !s.players.some((p) => p.cid === cid)) return false;
  const q = s.questions[s.index];
  if (!Number.isInteger(choice) || choice < 0 || choice >= q.answers.length) return false;
  const ms = Math.max(0, now - s.phaseAt);
  s.answers[cid] = { choice, ms };
  const st = s.stats[cid];
  st.answered += 1;
  st.totalMs += ms;
  emit(s, 'answer', { by: cid });
  const waiting = activePlayers(s, now).filter((p) => !s.answers[p.cid]);
  if (!waiting.length) s.closeAt = now + CLOSE_MS;
  return true;
}

export function seen(s, cid, now) {
  if (s.lastSeen[cid] != null) s.lastSeen[cid] = now;
}

/** A late joiner starts at zero. */
export function addPlayer(s, cid, name, now) {
  if (s.players.some((p) => p.cid === cid)) return;
  s.players.push({ cid, name });
  s.scores[cid] = 0;
  s.stats[cid] = freshStats();
  s.lastSeen[cid] = now;
}

export const isOver = (s) => s.phase === 'final';

/** What one phone needs to show. */
export function phoneView(s, cid, now) {
  const q = s.questions[s.index];
  const ranks = ranking(s);
  const me = ranks.find((r) => r.cid === cid);
  const mine = s.answers[cid];
  const view = {
    phase: s.phase,
    index: s.index,
    total: s.questions.length,
    round: roundOf(s.index),
    double: multiplier(s.index) > 1,
    score: me ? me.score : 0,
    rank: me ? me.rank : null,
    count: s.players.length,
    picked: mine ? mine.choice : null,
  };
  if (s.phase === 'answer') {
    view.answers = q.answers;
    view.left = Math.max(0, ANSWER_MS - (now - s.phaseAt));
  }
  if (s.phase === 'reveal' && s.last) {
    const g = s.last.gains[cid];
    view.reveal = {
      answer: q.answers[s.last.correct],
      right: Boolean(g?.right),
      gain: g?.gain || 0,
      fastest: Boolean(g?.fastest),
      streak: g?.streak || 0,
      picked: g && g.choice != null ? q.answers[g.choice] : null,
    };
  }
  return view;
}

/** End-of-quiz awards: [{ title, cid, value, blurb }]. */
export function awards(s) {
  const list = [];
  const ranks = ranking(s);
  if (ranks[0] && ranks[0].score > 0) list.push({ title: 'Fright Quiz Champ', cid: ranks[0].cid, value: ranks[0].score, blurb: `${ranks[0].score.toLocaleString()} points` });
  const best = (pick) => {
    let top = null;
    s.players.forEach((p) => {
      const v = pick(s.stats[p.cid] || freshStats());
      if (v > 0 && (!top || v > top.value)) top = { cid: p.cid, value: v };
    });
    return top;
  };
  const add = (pick, title, blurb) => { const b = best(pick); if (b) list.push({ title, blurb: blurb(b.value), ...b }); };
  add((st) => st.fastest, 'Quickest Finger', (v) => `First right answer ${v} time${v === 1 ? '' : 's'}`);
  add((st) => (st.bestStreak >= 3 ? st.bestStreak : 0), 'Hot Streak', (v) => `${v} right in a row`);
  add((st) => st.answered - st.right, 'Brave Guesser', (v) => `${v} bold wrong answer${v === 1 ? '' : 's'}`);
  return list;
}
