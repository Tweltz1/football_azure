import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createQuiz, tick, answer, phoneView, ranking, awards, isOver, addPlayer,
  QUESTION_COUNT, ANSWER_MS, BASE, SPEED, FASTEST, ROUND_MS, READ_MS,
} from '../src/party/games/quiz.js';
import { QUESTIONS, pickQuestions } from '../src/party/quizQuestions.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ cid: `p${i}`, name: `P${i}` }));

test('every question has four different answers and picks shuffle them', () => {
  assert.ok(QUESTIONS.length >= 45);
  QUESTIONS.forEach((q) => {
    assert.equal(q.length, 5, q[0]);
    assert.equal(new Set(q.slice(1)).size, 4, q[0]);
  });
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const picked = pickQuestions(rand, 15);
  assert.equal(picked.length, 15);
  assert.equal(new Set(picked.map((q) => q.text)).size, 15);
  picked.forEach((q) => assert.ok(q.correct >= 0 && q.correct < 4));
});

// Bots that answer with a given accuracy and speed. Returns the finished quiz and its length in ms.
function run(n, seed, skill) {
  const s = createQuiz(players(n), seed, 0);
  let rng = seed;
  const rand = () => { rng = (rng * 16807) % 2147483647; return rng / 2147483647; };
  const plan = {};
  let now = 0;
  let lastIndex = -1;
  while (!isOver(s) && now < 20 * 60000) {
    now += 50;
    tick(s, now);
    s.players.forEach((p) => { s.lastSeen[p.cid] = now; });
    if (s.phase !== 'answer') continue;
    if (s.index !== lastIndex) {
      lastIndex = s.index;
      s.players.forEach((p, i) => { plan[p.cid] = { at: now + 1200 + rand() * 9000, right: rand() < (skill[i] ?? skill[skill.length - 1]) }; });
    }
    const q = s.questions[s.index];
    s.players.forEach((p) => {
      const pl = plan[p.cid];
      if (now >= pl.at && !s.answers[p.cid]) answer(s, p.cid, pl.right ? q.correct : (q.correct + 1) % 4, now);
    });
  }
  return { s, ms: now };
}

test('a full quiz runs 15 questions in roughly 5 to 8 minutes and the best player wins', () => {
  for (const n of [1, 4, 12]) {
    const { s, ms } = run(n, 99 + n, [0.95, 0.5, 0.35]);
    assert.ok(isOver(s));
    assert.equal(s.questions.length, QUESTION_COUNT);
    assert.ok(ms > 3.5 * 60000 && ms < 8 * 60000, `${n} players took ${Math.round(ms / 1000)}s`);
    const ranks = ranking(s);
    assert.equal(ranks.length, n);
    if (n > 1) assert.equal(ranks[0].cid, 'p0');
    assert.ok(awards(s).some((a) => a.title === 'Fright Quiz Champ'));
  }
});

test('nobody answering still finishes, with zero scores', () => {
  const s = createQuiz(players(3), 5, 0);
  let now = 0;
  while (!isOver(s) && now < 20 * 60000) { now += 100; tick(s, now); }
  assert.ok(isOver(s));
  assert.ok(ranking(s).every((r) => r.score === 0 && r.rank === 1));
  assert.deepEqual(awards(s), []);
});

test('scoring: faster right answers score more, first right gets the bonus, wrong scores 0, one answer each', () => {
  const s = createQuiz(players(3), 11, 0);
  const open = ROUND_MS + READ_MS;
  tick(s, ROUND_MS); tick(s, open);
  assert.equal(s.phase, 'answer');
  const q = s.questions[0];
  assert.equal(phoneView(s, 'p0', open).answers.length, 4);
  assert.ok(answer(s, 'p1', q.correct, open + 6000));
  assert.ok(answer(s, 'p0', q.correct, open + 1500));
  assert.equal(answer(s, 'p0', (q.correct + 1) % 4, open + 1600), false);
  assert.ok(answer(s, 'p2', (q.correct + 1) % 4, open + 2000));
  assert.ok(s.closeAt != null, 'closes early once everyone answered');
  tick(s, s.closeAt + 1);
  assert.equal(s.phase, 'reveal');
  const g = s.last.gains;
  assert.equal(g.p0.gain, BASE + Math.round(SPEED * (1 - 1500 / ANSWER_MS)) + FASTEST);
  assert.ok(g.p0.fastest && !g.p1.fastest);
  assert.ok(g.p0.gain > g.p1.gain && g.p1.gain > 0);
  assert.equal(g.p2.gain, 0);
  const v = phoneView(s, 'p2', s.closeAt + 2);
  assert.equal(v.reveal.right, false);
  assert.equal(v.reveal.answer, q.answers[q.correct]);
  assert.equal(phoneView(s, 'p0', s.closeAt + 2).rank, 1);
});

test('round 3 counts double and late joiners start at zero', () => {
  const s = createQuiz(players(2), 3, 0);
  let now = 0;
  while (s.index < 10 && now < 20 * 60000) { now += 100; tick(s, now); }
  addPlayer(s, 'late', 'Late', now);
  while (s.phase !== 'answer') { now += 100; tick(s, now); }
  assert.ok(phoneView(s, 'late', now).double);
  assert.ok(answer(s, 'late', s.questions[s.index].correct, now));
  while (s.phase !== 'reveal') { now += 100; tick(s, now); }
  assert.equal(s.last.gains.late.gain, (BASE + SPEED + FASTEST) * 2);
});
