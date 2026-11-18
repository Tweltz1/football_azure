/* eslint-disable no-loop-func */
import { createCountdown, tick, stop, isOver, ranking, pointsFor, shownClock, PLAN } from './countdown';

test('points: closer is better, over is zero, perfect gets a bonus', () => {
  expect(pointsFor(-10)).toBe(0);
  expect(pointsFor(null)).toBe(0);
  expect(pointsFor(30)).toBeGreaterThan(pointsFor(300));
  expect(pointsFor(30)).toBeGreaterThan(1400);
  expect(pointsFor(5000)).toBe(0);
});

test('shown clock reaches zero at midnight for every twist', () => {
  ['classic', 'dark', 'fast', 'wobble', 'blind', 'mega'].forEach((type) => {
    const r = { type, dur: 9000 };
    expect(shownClock(r, 9000).shown).toBeCloseTo(0, 0);
    expect(shownClock(r, 0).shown).toBeGreaterThan(8000);
  });
  expect(shownClock({ type: 'dark', dur: 9000 }, 6000).hidden).toBe(true);
  expect(shownClock({ type: 'classic', dur: 9000 }, 8900).hidden).toBe(false);
});

test('a full game: the closest player wins; busting scores nothing', () => {
  const g = createCountdown([{ cid: 'a', name: 'A' }, { cid: 'b', name: 'B' }, { cid: 'c', name: 'C' }], 5, 0);
  let now = 0;
  let rounds = 0;
  while (!isOver(g) && now < 600000) {
    now += 20;
    tick(g, now);
    if (g.phase === 'count') {
      g.lastSeen.a = now; g.lastSeen.b = now; g.lastSeen.c = now;
      const t = now - g.phaseAt;
      if (t >= g.round.dur - 120 && g.stops.a == null) stop(g, 'a', g.round.id, t, now);
      if (t >= g.round.dur - 900 && g.stops.b == null) stop(g, 'b', g.round.id, t, now);
      if (t >= g.round.dur + 200 && g.stops.c == null) { stop(g, 'c', g.round.id, t, now); rounds += 1; }
    }
  }
  expect(isOver(g)).toBe(true);
  expect(rounds).toBe(PLAN.length);
  expect(ranking(g)[0].cid).toBe('a');
  expect(g.scores.c).toBe(0);
  // eslint-disable-next-line no-console
  console.log('minutes', (now / 60000).toFixed(1));
});
