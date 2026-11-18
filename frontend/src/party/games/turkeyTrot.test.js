import { createTrot, tick, steer, ROUNDS, isOver, totalPenned, PEN } from './turkeyTrot';

// Bot farmers: each picks a turkey, gets behind it (away from the pen gate) and walks it in.
function bots(g, count) {
  const gate = { x: (PEN.x1 + PEN.x2) / 2, y: PEN.y2 + 10 };
  const free = g.turkeys.filter((t) => !t.penned);
  g.players.slice(0, count).forEach((p, i) => {
    const f = g.farmers[p.cid];
    const t = free[i % Math.max(1, free.length)];
    if (!t) { steer(g, p.cid, 0, 0); return; }
    const ux = gate.x - t.x; const uy = gate.y - t.y; const l = Math.hypot(ux, uy) || 1;
    const back = l < 200 ? 90 : 170;
    const tx = t.x - (ux / l) * back; const ty = t.y - (uy / l) * back;
    const dx = tx - f.x; const dy = ty - f.y; const d = Math.hypot(dx, dy);
    if (d < 25) steer(g, p.cid, ux / l, uy / l); else steer(g, p.cid, dx / d, dy / d);
  });
}

test.each([1, 3, 6])('%i bot farmers can pen turkeys', (n) => {
  const players = Array.from({ length: n }, (_, i) => ({ cid: `c${i}`, name: `P${i}` }));
  const g = createTrot(players, 42, 0);
  let now = 0;
  while (!isOver(g) && now < 600000) { now += 33; bots(g, n); tick(g, now); }
  // eslint-disable-next-line no-console
  console.log(n, g.saved.map((r) => `${r.penned}/${r.goal}`).join(' '), 'total', totalPenned(g), 'mins', (now / 60000).toFixed(1));
  expect(isOver(g)).toBe(true);
  expect(totalPenned(g)).toBeGreaterThan(0);
  expect(g.saved.length).toBe(ROUNDS.length);
});
