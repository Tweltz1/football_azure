/* eslint-disable no-loop-func */
import { createRush, tick, work, targetFor, isOver, totalDelivered, assignJobs, JOBS, ROUNDS } from './giftRush';

test('jobs cover every station for any crew size', () => {
  for (let n = 1; n <= 12; n += 1) {
    const players = Array.from({ length: n }, (_, i) => ({ cid: `c${i}` }));
    for (let r = 0; r < 3; r += 1) {
      const jobs = assignJobs(players, r);
      JOBS.forEach((j) => expect(Object.values(jobs).some((l) => l.includes(j))).toBe(true));
    }
  }
});

test.each([1, 2, 4, 7])('%i perfect elves deliver everything; a game takes a few minutes', (n) => {
  const players = Array.from({ length: n }, (_, i) => ({ cid: `c${i}`, name: `P${i}` }));
  const g = createRush(players, 7, 0);
  let now = 0;
  while (!isOver(g) && now < 900000) {
    now += 33;
    tick(g, now);
    if (now % 330 < 33) {
      g.players.forEach((p) => (g.jobs[p.cid] || []).forEach((j) => {
        const t = targetFor(g, j);
        if (t && g.phase === 'play') work(g, p.cid, j, t.order[j], now);
      }));
    }
  }
  expect(isOver(g)).toBe(true);
  expect(totalDelivered(g)).toBe(ROUNDS.reduce((a, r) => a + r.presents, 0));
  // eslint-disable-next-line no-console
  console.log(n, 'minutes', (now / 60000).toFixed(1), 'score', g.score);
});

test('a wrong pick sends the present to the coal bin', () => {
  const g = createRush([{ cid: 'a', name: 'A' }], 3, 0);
  let now = 0;
  let wrongDone = false;
  while (g.round === 0 && now < 300000) {
    now += 33;
    tick(g, now);
    JOBS.forEach((j) => {
      const t = targetFor(g, j);
      if (!t || g.phase !== 'play') return;
      const choice = !wrongDone && j === 'wrap' ? ['red', 'green', 'blue', 'gold'].find((c) => c !== t.order.wrap) : t.order[j];
      if (j === 'wrap' && !wrongDone) wrongDone = true;
      work(g, 'a', j, choice, now);
    });
  }
  expect(g.results[0].delivered).toBe(ROUNDS[0].presents - 1);
});
