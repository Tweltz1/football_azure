// NHTSA VIN decoding and recalls: `node --test supabase/tests/nhtsa.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearNhtsaCache, decodeVin, recallsFor } from '../functions/_shared/nhtsa.ts';

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
