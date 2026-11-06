import { clearWeatherCache, loadWeather, readForecast } from './weatherFeed';

const NOW = Date.parse('2026-11-07T12:00:00Z');

const event = (home, away, date, venue = {}, neutral = false) => ({
  date,
  competitions: [{
    neutralSite: neutral,
    venue: { fullName: `${home} Stadium`, indoor: false, ...venue },
    competitors: [{ homeAway: 'home', team: { abbreviation: home } }, { homeAway: 'away', team: { abbreviation: away } }],
  }],
});

const hourly = (start, wind) => {
  const time = [];
  const base = Date.parse(start);
  for (let i = 0; i < 48; i += 1) time.push(`${new Date(base + i * 3600000).toISOString().slice(0, 13)}:00`);
  const fill = (v) => time.map(() => v);
  return {
    hourly: {
      time, temperature_2m: fill(30), apparent_temperature: fill(20), rain: fill(0), snowfall: fill(0.5),
      precipitation_probability: time.map((_, i) => (i === 19 ? 80 : 10)), wind_speed_10m: fill(wind), wind_gusts_10m: fill(wind + 12),
    },
  };
};

const setup = () => {
  clearWeatherCache();
  const urls = [];
  const fetchJson = async (url) => {
    urls.push(url);
    if (url.includes('scoreboard')) {
      return {
        events: [
          event('BUF', 'MIA', '2026-11-08T18:00Z'),
          event('DET', 'GB', '2026-11-08T18:00Z'),
          event('WSH', 'DAL', '2026-11-08T21:25Z'),
          event('KC', 'DEN', '2026-11-12T01:15Z'),
          event('NE', 'NYJ', '2026-11-08T14:30Z', { address: { city: 'London' } }, true),
        ],
      };
    }
    if (url.includes('open-meteo')) return hourly('2026-11-08T00:00Z', url.includes('42.7738') ? 22 : 6);
    throw new Error(`unexpected ${url}`);
  };
  return { urls, fetchJson };
};

test('forecasts outdoor games within 3 days, skips domes and far-off games', async () => {
  const { fetchJson, urls } = setup();
  const { games, week } = await loadWeather(10, { fetchJson, now: NOW });
  expect(week).toBe(10);
  const by = (home) => games.find((g) => g.home === home);
  expect(by('BUF').forecast).toMatchObject({ windMph: 22, feelsF: 20, precipChance: 80 });
  expect(by('BUF').hoursOut).toBe(30);
  expect(by('DET').indoor).toBe(true);
  expect(by('DET').forecast).toBeNull();
  expect(by('WAS').forecast.windMph).toBe(6);
  expect(by('KC').forecast).toBeNull();
  expect(by('NE').forecast).toBeTruthy();
  expect(urls.some((u) => u.includes('latitude=51.56'))).toBe(true);
  expect(urls[0]).toContain('week=10');
});

test('refreshes every 6 hours before game day and every hour on game day', async () => {
  const { fetchJson, urls } = setup();
  const meteo = () => urls.filter((u) => u.includes('open-meteo') && u.includes('42.7738')).length;
  let now = NOW;
  await loadWeather(10, { fetchJson, now });
  expect(meteo()).toBe(1);
  now += 2 * 3600000;
  await loadWeather(10, { fetchJson, now });
  expect(meteo()).toBe(1);
  now += 5 * 3600000;
  await loadWeather(10, { fetchJson, now });
  expect(meteo()).toBe(2);
  now += 61 * 60000;
  await loadWeather(10, { fetchJson, now });
  expect(meteo()).toBe(3);
});

test('a failed forecast leaves that game without one; a failed scoreboard throws', async () => {
  clearWeatherCache();
  const { games } = await loadWeather(10, {
    now: NOW,
    fetchJson: async (url) => {
      if (url.includes('scoreboard')) return { events: [event('BUF', 'MIA', '2026-11-08T18:00Z')] };
      throw new Error('down');
    },
  });
  expect(games[0].forecast).toBeNull();
  clearWeatherCache();
  await expect(loadWeather(10, { now: NOW, fetchJson: async () => { throw new Error('down'); } })).rejects.toThrow('down');
});

test('readForecast averages the first three hours of the game', () => {
  const body = hourly('2026-11-08T00:00Z', 10);
  body.hourly.wind_speed_10m[18] = 4;
  body.hourly.wind_speed_10m[19] = 10;
  body.hourly.wind_speed_10m[20] = 16;
  expect(readForecast(body, '2026-11-08T18:25:00Z').windMph).toBe(10);
  expect(readForecast(body, '2026-12-01T18:00:00Z')).toBeNull();
});
