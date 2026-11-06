// Game weather route: `node --test supabase/tests/weather.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearWeatherCache, readForecast, weatherRoute } from '../functions/api/weather.ts';

const NOW = Date.parse('2026-11-07T12:00:00Z');
let now = NOW;
const ctx = { now: () => new Date(now), log: { warn() {} } };

const event = (home: string, away: string, date: string, venue: Record<string, unknown> = {}, neutral = false) => ({
  date,
  competitions: [{
    neutralSite: neutral,
    venue: { fullName: `${home} Stadium`, indoor: false, ...venue },
    competitors: [{ homeAway: 'home', team: { abbreviation: home } }, { homeAway: 'away', team: { abbreviation: away } }],
  }],
});

const hourly = (start: string, wind: number) => {
  const time: string[] = [];
  const base = Date.parse(start);
  for (let i = 0; i < 48; i += 1) time.push(new Date(base + i * 3600_000).toISOString().slice(0, 13) + ':00');
  const fill = (v: number) => time.map(() => v);
  return {
    hourly: {
      time, temperature_2m: fill(30), apparent_temperature: fill(20), rain: fill(0), snowfall: fill(0.5),
      precipitation_probability: time.map((_, i) => (i === 19 ? 80 : 10)), wind_speed_10m: fill(wind), wind_gusts_10m: fill(wind + 12),
    },
  };
};

const setup = () => {
  clearWeatherCache();
  now = NOW;
  const urls: string[] = [];
  const fetchJson = async (url: string) => {
    urls.push(url);
    if (url.includes('scoreboard')) {
      return {
        events: [
          event('BUF', 'MIA', '2026-11-08T18:00Z'),
          event('DET', 'GB', '2026-11-08T18:00Z'),
          event('WSH', 'DAL', '2026-11-08T21:25Z'),
          event('KC', 'DEN', '2026-11-12T01:15Z'), // Thursday night next week: more than 3 days out
          event('NE', 'NYJ', '2026-11-08T14:30Z', { address: { city: 'London' } }, true),
        ],
      };
    }
    if (url.includes('open-meteo')) return hourly('2026-11-08T00:00Z', url.includes('42.7738') ? 22 : 6);
    throw new Error(`unexpected ${url}`);
  };
  return { urls, fetchJson };
};

const get = (fetchJson: (u: string) => Promise<unknown>, q = 'week=10') => weatherRoute(ctx, fetchJson, 'GET', ['weather'], new URLSearchParams(q));

test('only answers GET /weather', async () => {
  const { fetchJson } = setup();
  assert.equal(await weatherRoute(ctx, fetchJson, 'GET', ['startsit'], new URLSearchParams()), null);
  assert.equal((await weatherRoute(ctx, fetchJson, 'POST', ['weather'], new URLSearchParams()))?.status, 405);
});

test('forecasts outdoor games within 3 days, skips domes and far-off games', async () => {
  const { fetchJson, urls } = setup();
  const res = await get(fetchJson);
  assert.equal(res?.status, 200);
  const games = (res?.body as { games: Array<Record<string, any>> }).games;
  const by = (home: string) => games.find((g) => g.home === home)!;
  assert.equal(by('BUF').forecast.windMph, 22);
  assert.equal(by('BUF').forecast.feelsF, 20);
  assert.equal(by('BUF').forecast.precipChance, 80);
  assert.equal(by('BUF').hoursOut, 30);
  assert.equal(by('DET').indoor, true);
  assert.equal(by('DET').forecast, null);
  assert.ok(by('WAS'), 'ESPN WSH becomes WAS');
  assert.equal(by('WAS').forecast.windMph, 6);
  assert.equal(by('KC').forecast, null);
  assert.ok(by('NE').forecast, 'London game uses London weather');
  assert.ok(urls.some((u) => u.includes('latitude=51.56')));
  assert.ok(urls[0].includes('week=10'));
});

test('refreshes every 6 hours before game day and every hour on game day', async () => {
  const { fetchJson, urls } = setup();
  await get(fetchJson);
  const meteo = () => urls.filter((u) => u.includes('open-meteo') && u.includes('42.7738')).length;
  assert.equal(meteo(), 1);
  now += 2 * 3600_000; // 28 hours out: still the 6-hour cache
  await get(fetchJson);
  assert.equal(meteo(), 1);
  now += 5 * 3600_000; // 23 hours out (game day): hourly
  await get(fetchJson);
  assert.equal(meteo(), 2);
  now += 30 * 60_000;
  await get(fetchJson);
  assert.equal(meteo(), 2);
  now += 31 * 60_000;
  await get(fetchJson);
  assert.equal(meteo(), 3);
});

test('a failed forecast leaves that game without one; a failed scoreboard is a 502', async () => {
  setup();
  const res = await get(async (url) => {
    if (url.includes('scoreboard')) return { events: [event('BUF', 'MIA', '2026-11-08T18:00Z')] };
    throw new Error('down');
  });
  assert.equal((res?.body as any).games[0].forecast, null);
  clearWeatherCache();
  assert.equal((await get(async () => { throw new Error('down'); }))?.status, 502);
});

test('readForecast averages the first three hours of the game', () => {
  const body = hourly('2026-11-08T00:00Z', 10);
  (body.hourly.wind_speed_10m as number[])[18] = 4;
  (body.hourly.wind_speed_10m as number[])[19] = 10;
  (body.hourly.wind_speed_10m as number[])[20] = 16;
  assert.equal(readForecast(body, '2026-11-08T18:25:00Z')?.windMph, 10);
  assert.equal(readForecast(body, '2026-12-01T18:00:00Z'), null);
});
