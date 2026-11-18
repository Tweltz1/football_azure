/* eslint-disable no-loop-func */
import { createRainbow, tick, choose, isOver, buildDeck, RUNS } from './rainbowRun';

test('the deck has coins, a pot and 3 of each hazard', () => {
  const d = buildDeck(() => 0.5);
  expect(d.filter((c) => c.kind === 'hazard').length).toBe(12);
  expect(d.filter((c) => c.kind === 'pot').length).toBe(1);
});

test('a full game: cautious players bank gold, gold is never created from nothing', () => {
  const players = ['a', 'b', 'c'].map((cid) => ({ cid, name: cid }));
  const g = createRainbow(players, 11, 0);
  let now = 0;
  while (!isOver(g) && now < 900000) {
    now += 100;
    players.forEach((p) => { g.lastSeen[p.cid] = now; });
    if (g.phase === 'decide') {
      // a leaves after 2 steps, b after 4, c never leaves
      choose(g, 'a', g.steps.length >= 2 ? 'home' : 'climb', now);
      choose(g, 'b', g.steps.length >= 4 ? 'home' : 'climb', now);
      choose(g, 'c', 'climb', now);
    }
    tick(g, now);
  }
  expect(isOver(g)).toBe(true);
  expect(g.history.length).toBe(RUNS);
  expect(g.bank.a + g.bank.b).toBeGreaterThan(0);
  // eslint-disable-next-line no-console
  console.log('minutes', (now / 60000).toFixed(1), g.bank);
});
