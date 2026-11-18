/* eslint-disable no-loop-func */
import { boom, buildChart, createFireworks, isOver, ranking, SHOWS, showMs, tick, awards, FINALE_BONUS } from './fireworks';

test('charts keep each player\'s rockets apart and end with a finale volley', () => {
  const cids = ['a', 'b', 'c'];
  SHOWS.forEach((show) => {
    const chart = buildChart(() => Math.random(), show, cids);
    cids.forEach((cid) => {
      const mine = chart.filter((r) => r.cid === cid);
      for (let i = 1; i < mine.length; i += 1) expect(mine[i].at - mine[i - 1].at).toBeGreaterThan(200);
      expect(mine.filter((r) => r.finale).length).toBe(show.finale ? 5 : 0);
    });
    chart.forEach((r) => expect(r.at).toBeLessThan(showMs(show)));
  });
});

test('perfect timing scores the most, spamming costs points', () => {
  const g = createFireworks([{ cid: 'a', name: 'A' }, { cid: 'b', name: 'B' }], 5, 0);
  let now = 0;
  while (g.phase !== 'show') { now += 50; tick(g, now); }
  const [r] = g.rockets.filter((x) => x.cid === 'a');
  while (now - g.phaseAt < r.at) { now += 10; g.lastSeen.a = now; g.lastSeen.b = now; tick(g, now); }
  boom(g, 'a', r.at + 20, now);
  expect(g.judged[r.id].grade).toBe('perfect');
  const before = g.scores.b;
  boom(g, 'b', now - g.phaseAt - 3000, now);
  expect(g.scores.b).toBeLessThanOrEqual(before);
});

test('a full game: the steady player wins and the whole thing is party length', () => {
  const players = ['a', 'b', 'c', 'd'].map((cid) => ({ cid, name: cid.toUpperCase() }));
  const g = createFireworks(players, 21, 0);
  let now = 0;
  const offs = { a: 10, b: 140, c: -230, d: 400 };
  const done = new Set();
  while (!isOver(g) && now < 900000) {
    now += 20;
    players.forEach((p) => { g.lastSeen[p.cid] = now; });
    if (g.phase === 'show') {
      const t = now - g.phaseAt;
      g.rockets.forEach((r) => {
        const key = `${g.show}-${r.id}`;
        if (!done.has(key) && t >= r.at + offs[r.cid]) { done.add(key); boom(g, r.cid, r.at + offs[r.cid], now); }
      });
    }
    tick(g, now);
  }
  expect(isOver(g)).toBe(true);
  expect(ranking(g)[0].cid).toBe('a');
  expect(ranking(g)[3].cid).toBe('d');
  expect(g.scores.a).toBeGreaterThan(FINALE_BONUS);
  expect(awards(g).find((x) => x.title === 'Perfect Pyro').cid).toBe('a');
  expect(now).toBeGreaterThan(3 * 60000);
  expect(now).toBeLessThan(5 * 60000);
  // eslint-disable-next-line no-console
  console.log('minutes', (now / 60000).toFixed(1), g.scores);
});
