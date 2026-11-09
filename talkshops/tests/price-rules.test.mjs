import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/price-rules.js';
const { parse, toLines } = globalThis.PriceRules;

test('reads a typical service menu with no AI', () => {
  const r = parse([
    'RIDGELINE AUTO REPAIR', '(555) 014-2290 · 12 Main St',
    'Labor rate ............ $139/hr',
    'Synthetic oil change (up to 5 qt) .... $79.95',
    'Conventional oil change    49.95',
    'Tire rotation - $24.99',
    'Brake Service',
    'Front brake pads   1.5 hrs',
    'Timing belt 4.2 hours $689',
    'Coolant flush starting at $149',
    'Wiper blades $24-$39',
    'Cabin air filter $34',
    'Shop supplies 8%',
    'Diagnostic',
    '$139.00',
    'Total $1,234.00',
  ]);
  assert.equal(r.laborRate, 139);
  const by = Object.fromEntries(r.items.map(i => [i.name, i]));
  assert.deepEqual(by['Labor rate'], { name: 'Labor rate', kind: 'labor', rate: 139 });
  assert.equal(by['Synthetic oil change (up to 5 qt)'].rate, 79.95);
  assert.equal(by['Conventional oil change'].rate, 49.95);
  assert.equal(by['Tire rotation'].kind, 'fee');
  assert.deepEqual(by['Front brake pads'], { name: 'Front brake pads', kind: 'labor', rate: 139, hours: 1.5, check: true, note: 'Labor time at your hourly rate' });
  assert.equal(by['Timing belt (4.2 hr)'].rate, 689);
  assert.equal(by['Coolant flush'].check, true);
  assert.equal(by['Wiper blades'].rate, 24);
  assert.match(by['Wiper blades'].note, /range/);
  assert.equal(by['Cabin air filter'].kind, 'part');
  assert.deepEqual(by['Shop supplies'], { name: 'Shop supplies', kind: 'percent', rate: 8 });
  assert.equal(by['Diagnostic'].rate, 139, 'name on one line, price on the next');
  assert.ok(!r.items.some(i => /total|ridgeline|main st/i.test(i.name)));
});

test('several prices on a line and positioned text', () => {
  const r = parse(['Oil change   $49.99   $69.99   $89.99']);
  assert.deepEqual(r.items.map(i => [i.name, i.rate]), [['Oil change (option 1)', 49.99], ['Oil change (option 2)', 69.99], ['Oil change (option 3)', 89.99]]);
  assert.deepEqual(toLines([{ str: '$34', x: 300, y: 700, h: 10 }, { str: 'Cabin filter', x: 20, y: 701, h: 10 }, { str: 'Battery test', x: 20, y: 680, h: 10 }, { str: 'Free', x: 300, y: 680, h: 10 }]),
    ['Cabin filter $34', 'Battery test Free']);
});

test('photo text: one-letter misreads are fixed and lost decimals in labor times are flagged', () => {
  const r = parse(['Labor rate $139/hr', 'Coolant flysh $149.00', 'Cabin air fitter $34.00', 'Front brake pads 15 hrs'], { ocr: true });
  assert.deepEqual(r.items.map(i => [i.name, i.kind, i.rate, i.hours ?? null, !!i.check]), [
    ['Labor rate', 'labor', 139, null, false], ['Coolant flush', 'fee', 149, null, false], ['Cabin air filter', 'part', 34, null, false], ['Front brake pads', 'labor', 139, 1.5, true]]);
});
