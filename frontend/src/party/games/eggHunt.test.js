/* eslint-disable no-loop-func */
import { createEggHunt, tick, tap, isOver, ranking, planHops, SPOTS, phoneView, awards, LOCK_MS } from './eggHunt';

test('every egg gets its own spot, even with a full room', () => {
  const eggs = [...Array.from({ length: 12 }, (_, i) => `c${i}`), 'golden'];
  const hops = planHops(() => Math.random(), eggs, 5);
  const withEgg = hops.filter((h) => h.egg);
  expect(withEgg.length).toBe(13);
  expect(new Set(withEgg.map((h) => h.spot)).size).toBe(13);
  hops.forEach((h) => expect(h.spot).toBeLessThan(SPOTS.length));
});

test('a wrong spot freezes you, the right one scores', () => {
  const players = ['a', 'b', 'c'].map((cid) => ({ cid, name: cid }));
  const g = createEggHunt(players, 3, 0);
  let now = 0;
  while (g.phase !== 'hunt') { now += 100; players.forEach((p) => { g.lastSeen[p.cid] = now; }); tick(g, now); }
  const mine = Number(Object.keys(g.eggs).find((k) => g.eggs[k] === 'a'));
  const empty = SPOTS.findIndex((_, i) => !g.eggs[i]);
  expect(tap(g, 'a', empty, now)).toBe(true);
  expect(tap(g, 'a', mine, now + 100)).toBe(false); // frozen
  expect(tap(g, 'a', mine, now + LOCK_MS + 10)).toBe(true);
  expect(g.scores.a).toBeGreaterThan(100);
  expect(phoneView(g, 'a', now + LOCK_MS + 20).found).toBe(mine);
  const gold = Number(Object.keys(g.eggs).find((k) => g.eggs[k] === 'golden'));
  expect(tap(g, 'b', gold, now + 2000)).toBe(true);
  expect(tap(g, 'c', gold, now + 2100)).toBe(false);
  expect(g.golden.by).toBe('b');
});

test('a full game with 5 players finishes in a party-sized time', () => {
  const players = ['a', 'b', 'c', 'd', 'e'].map((cid) => ({ cid, name: cid.toUpperCase() }));
  const g = createEggHunt(players, 11, 0);
  let now = 0;
  while (!isOver(g) && now < 900000) {
    now += 100;
    players.forEach((p) => { g.lastSeen[p.cid] = now; });
    if (g.phase === 'hunt' && now % 700 === 0) {
      players.forEach((p, i) => {
        // 'a' has a perfect memory; everyone else guesses.
        const spot = p.cid === 'a' ? Number(Object.keys(g.eggs).find((k) => g.eggs[k] === 'a')) : Math.floor((now / 700 + i * 7) % SPOTS.length);
        tap(g, p.cid, spot, now);
      });
    }
    tick(g, now);
  }
  expect(isOver(g)).toBe(true);
  expect(ranking(g)[0].cid).toBe('a');
  expect(awards(g).length).toBeGreaterThan(0);
  expect(now).toBeLessThan(6 * 60000);
  // eslint-disable-next-line no-console
  console.log('minutes', (now / 60000).toFixed(1), g.scores);
});
