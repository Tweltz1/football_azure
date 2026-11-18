/* eslint-disable no-loop-func */
import { createAdmirer, tick, write, guess, heart, isOver, pairUp, ranking } from './admirer';

test('nobody writes to themselves, everyone gets a note', () => {
  for (let n = 3; n <= 12; n += 1) {
    const cids = Array.from({ length: n }, (_, i) => `c${i}`);
    for (let r = 0; r < 2; r += 1) {
      const t = pairUp(() => Math.random(), cids, r);
      cids.forEach((c) => expect(t[c]).not.toBe(c));
      expect(new Set(Object.values(t)).size).toBe(n);
    }
  }
});

test('a full game with 4 players: the writer who fools the room scores', () => {
  const players = ['a', 'b', 'c', 'd'].map((cid) => ({ cid, name: cid.toUpperCase() }));
  const g = createAdmirer(players, 9, 0);
  let now = 0;
  while (!isOver(g) && now < 900000) {
    now += 100;
    players.forEach((p) => { g.lastSeen[p.cid] = now; });
    if (g.phase === 'write') players.forEach((p) => write(g, p.cid, `note from ${p.cid}`, now));
    if (g.phase === 'guess') {
      const note = g.notes[g.current];
      players.forEach((p) => {
        if (p.cid === note.by || g.guesses[p.cid]) return;
        // 'a' is always guessed right; everyone else fools the room.
        const pick = note.by === 'a' ? 'a' : players.map((x) => x.cid).find((c) => c !== p.cid && c !== note.to && c !== note.by);
        if (pick) guess(g, p.cid, pick, now);
        heart(g, p.cid);
      });
    }
    tick(g, now);
  }
  expect(isOver(g)).toBe(true);
  expect(g.rounds).toBe(2);
  expect(ranking(g)[ranking(g).length - 1].cid).not.toBe('b');
  // eslint-disable-next-line no-console
  console.log('minutes', (now / 60000).toFixed(1), g.scores);
});
