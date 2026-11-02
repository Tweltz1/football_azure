import { generateMap } from './mapgen';
import { SETTING_IDS } from './settings';
import { isOpen, reachable, squaresBetween, stepCost, tileAt, pathTo } from './movement';

const flat = (w, h, fill = 'floor') => ({ w, h, tiles: Array.from({ length: w * h }, () => ({ t: fill, e: 0, p: null })) });

describe('movement', () => {
  test('30 ft is 6 squares in a straight line', () => {
    const m = flat(12, 3);
    const reach = reachable(m, { x: 0, y: 1 }, 30);
    expect(reach.has('6,1')).toBe(true);
    expect(reach.has('7,1')).toBe(false);
  });

  test('diagonals alternate 5 and 10 feet', () => {
    const m = flat(10, 10);
    const reach = reachable(m, { x: 0, y: 0 }, 30);
    expect(reach.get('1,1').cost).toBe(5);
    expect(reach.get('2,2').cost).toBe(15);
    expect(reach.get('3,3').cost).toBe(20);
    expect(reach.get('4,4').cost).toBe(30);
    expect(reach.has('5,5')).toBe(false);
  });

  test('difficult terrain costs double', () => {
    const m = flat(10, 1);
    m.tiles[1].t = 'diff';
    const reach = reachable(m, { x: 0, y: 0 }, 30);
    expect(reach.get('1,0').cost).toBe(10);
    expect(reach.has('5,0')).toBe(true);
    expect(reach.has('6,0')).toBe(false);
  });

  test('climbing one level costs 5 extra and two levels is a cliff', () => {
    const m = flat(4, 1);
    m.tiles[1].e = 1;
    m.tiles[2].e = 3;
    expect(stepCost(m, { x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toBe(10);
    expect(stepCost(m, { x: 1, y: 0 }, { x: 0, y: 0 }, 0)).toBe(5);
    expect(stepCost(m, { x: 1, y: 0 }, { x: 2, y: 0 }, 0)).toBe(null);
  });

  test('walls block and corners cannot be cut', () => {
    const m = flat(3, 3);
    m.tiles[1].t = 'wall'; // (1,0)
    expect(stepCost(m, { x: 0, y: 0 }, { x: 1, y: 1 }, 0)).toBe(null);
  });

  test('enemies block the way, allies can be passed but not stopped on', () => {
    const m = flat(5, 1);
    const enemy = reachable(m, { x: 0, y: 0 }, 30, (x) => (x === 2 ? 'enemy' : null));
    expect(enemy.has('3,0')).toBe(false);
    const ally = reachable(m, { x: 0, y: 0 }, 30, (x) => (x === 2 ? 'ally' : null));
    expect(ally.has('3,0')).toBe(true);
    expect(ally.get('2,0').end).toBe(false);
    expect(pathTo(ally, { x: 3, y: 0 }).length).toBe(4);
  });

  test('range uses the same diagonal rule', () => {
    expect(squaresBetween({ x: 0, y: 0 }, { x: 4, y: 4 })).toBe(6);
  });
});

describe('map generator', () => {
  SETTING_IDS.forEach((id) => {
    test(`${id}: every start, monster and the exit are connected, across seeds`, () => {
      const layouts = new Set();
      for (let seed = 1; seed <= 25; seed += 1) {
        const map = generateMap(id, seed * 7919, { partySize: 4, partyLevel: 2 });
        expect(map.start.length).toBeGreaterThanOrEqual(4);
        map.start.forEach((p) => expect(isOpen(tileAt(map, p.x, p.y))).toBe(true));
        const reach = reachable(map, map.start[0], 100000);
        expect(reach.has(`${map.exit.x},${map.exit.y}`)).toBe(true);
        map.start.forEach((p) => expect(reach.has(`${p.x},${p.y}`)).toBe(true));
        map.spawns.forEach((s) => expect(reach.has(`${s.x},${s.y}`)).toBe(true));
        expect(map.spawns.length).toBeGreaterThan(0);
        layouts.add(map.tiles.map((t) => t.t[0] + (t.p || '')).join(''));
      }
      // Sessions should never repeat a layout.
      expect(layouts.size).toBe(25);
    });
  });

  test('the same seed gives the same map', () => {
    expect(JSON.stringify(generateMap('cave', 42))).toBe(JSON.stringify(generateMap('cave', 42)));
  });
});
