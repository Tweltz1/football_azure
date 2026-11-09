// NHTSA VIN decoding and recalls: `node --test supabase/tests/nhtsa.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearNhtsaCache, decodeVin, enginesFor, epaEngineText, modelsFor, recallsFor } from '../functions/_shared/nhtsa.ts';

const fakeFetch = (body: unknown, calls: string[] = [], status = 200) => (async (url: string) => {
  calls.push(String(url));
  return new Response(JSON.stringify(body), { status });
}) as unknown as typeof fetch;

test('decodes a VIN into year, make, model, trim and engine, and caches it', async () => {
  clearNhtsaCache();
  const calls: string[] = [];
  const f = fakeFetch({ Results: [{ ModelYear: '2016', Make: 'HONDA', Model: 'Civic', Trim: 'LX', DisplacementL: '1.996', EngineCylinders: '4', Turbo: '', BodyClass: 'Sedan/Saloon' }] }, calls);
  const v = await decodeVin('19xfc2f5xge000000', f, 0);
  assert.deepEqual(v, { vin: '19XFC2F5XGE000000', year: '2016', make: 'Honda', model: 'Civic', trim: 'LX', engine: '2L 4 Cyl.', body: 'Sedan/Saloon' });
  await decodeVin('19XFC2F5XGE000000', f, 1000);
  assert.equal(calls.length, 1);
  assert.equal(await decodeVin('BADVIN', f, 0), null);
  assert.equal(await decodeVin('19XFC2F5XGE00000O', f, 0), null, 'no letter O');
  clearNhtsaCache();
  assert.equal(await decodeVin('19XFC2F5XGE000001', fakeFetch({ Results: [{ Make: '', Model: '' }] }), 0), null);
});

test('lists recalls for a year, make and model', async () => {
  clearNhtsaCache();
  const calls: string[] = [];
  const f = fakeFetch({ Count: 1, results: [{ NHTSACampaignNumber: '16V123000', Component: 'AIR BAGS', Summary: 'Inflator may rupture.', Consequence: 'Injury.', Remedy: 'Replace inflator free.', ReportReceivedDate: '01/02/2016', parkIt: false, parkOutSide: true }] }, calls);
  const r = await recallsFor('2016', 'Honda', 'Civic', f, 0);
  assert.equal(r.length, 1);
  assert.equal(r[0].campaign, '16V123000');
  assert.equal(r[0].parkIt, true);
  assert.match(calls[0], /make=Honda&model=Civic&modelYear=2016/);
  assert.deepEqual(await recallsFor('', 'Honda', 'Civic', f, 0), []);
  clearNhtsaCache();
  assert.deepEqual(await recallsFor('2016', 'Honda', 'Nope', fakeFetch({}, [], 400), 0), []);
});

test('turns EPA menu text into engine labels', () => {
  assert.equal(epaEngineText('Auto 10-spd, 6 cyl, 3.5 L, Turbo'), '3.5L 6 Cyl. Turbo');
  assert.equal(epaEngineText('Auto (AV-S7), 4 cyl, 2.0 L'), '2.0L 4 Cyl.');
  assert.equal(epaEngineText('Auto (AV), 4 cyl, 2.5 L, Hybrid'), '2.5L 4 Cyl. Hybrid');
  assert.equal(epaEngineText('Auto (S8), 8 cyl, 6.2 L, SIDI; Supercharged'), '6.2L 8 Cyl. Supercharged');
  assert.equal(epaEngineText('Auto (A1)'), '');
});

test('lists models for a make and year, and engines for a model', async () => {
  clearNhtsaCache();
  const models = await modelsFor('2019', 'Ford', fakeFetch({ Results: [{ Model_Name: 'F-150' }, { Model_Name: 'Escape' }, { Model_Name: 'F-150' }] }), 0);
  assert.deepEqual(models, ['Escape', 'F-150']);
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(String(url));
    const body = /menu\/model\?/.test(url)
      ? { menuItem: [{ text: 'Escape FWD', value: 'Escape FWD' }, { text: 'F150 Pickup 2WD', value: 'F150 Pickup 2WD' }, { text: 'F150 Pickup 4WD', value: 'F150 Pickup 4WD' }] }
      : /2WD/.test(decodeURIComponent(url).replace(/\+/g, ' ')) ? { menuItem: [{ text: 'Auto 10-spd, 6 cyl, 3.5 L, Turbo', value: '1' }, { text: 'Auto 10-spd, 8 cyl, 5.0 L', value: '2' }] }
      : { menuItem: { text: 'Auto 10-spd, 6 cyl, 2.7 L, Turbo', value: '3' } };
    return new Response(JSON.stringify(body));
  }) as unknown as typeof fetch;
  assert.deepEqual(await enginesFor('2019', 'ford', 'F-150', f, 0), ['2.7L 6 Cyl. Turbo', '3.5L 6 Cyl. Turbo', '5.0L 8 Cyl.']);
  assert.ok(calls[0].includes('make=Ford'));
  assert.equal(calls.length, 3, 'model menu + two matching models');
  assert.deepEqual(await enginesFor('', 'Ford', 'F-150', f, 0), []);
});
