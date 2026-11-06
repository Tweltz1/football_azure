import {
  shortForecast, applyWeather, forecastText, forecastWeight, weatherEffect, weatherEffectText,
} from './weather';
import { withProjections } from './startSitUtils';
import { explainPair } from './startSitWhy';

const calm = { tempF: 60, feelsF: 60, windMph: 5, gustMph: 9, rainMm: 0, snowCm: 0, precipChance: 0 };
const windy = { ...calm, tempF: 34, feelsF: 24, windMph: 21, gustMph: 30 };
const storm = { ...calm, tempF: 30, feelsF: 18, windMph: 25, gustMph: 40, snowCm: 2, precipChance: 90 };
const game = (forecast, hoursOut = 6, extra = {}) => ({ home: 'BUF', away: 'MIA', kickoff: '2026-11-08T18:00:00Z', indoor: false, hoursOut, forecast, ...extra });

test('calm weather changes nothing', () => {
  ['QB', 'RB', 'WR', 'TE', 'K', 'DST'].forEach((pos) => expect(weatherEffect(game(calm), pos).pct).toBe(0));
});

test('wind and cold hurt passing and kicking most, and help defenses', () => {
  const qb = weatherEffect(game(windy), 'QB');
  const wr = weatherEffect(game(windy), 'WR');
  const rb = weatherEffect(game(windy), 'RB');
  const k = weatherEffect(game(windy), 'K');
  const dst = weatherEffect(game(windy), 'DST');
  expect(qb.pct).toBeLessThan(-0.08);
  expect(k.pct).toBeLessThan(qb.pct);
  expect(wr.pct).toBeLessThan(rb.pct);
  expect(dst.pct).toBeGreaterThan(0);
  expect(qb.reasons).toEqual(['wind', 'cold']);
});

test('effects are capped', () => {
  expect(weatherEffect(game(storm), 'K').pct).toBe(-0.22);
  expect(weatherEffect(game(storm), 'DST').pct).toBe(0.08);
});

test('forecasts count less further out and not at all past 3 days or indoors', () => {
  expect(forecastWeight(5)).toBe(1);
  expect(forecastWeight(30)).toBe(0.85);
  expect(forecastWeight(60)).toBe(0.65);
  expect(forecastWeight(80)).toBe(0);
  const near = weatherEffect(game(windy, 5), 'QB').pct;
  const far = weatherEffect(game(windy, 60), 'QB').pct;
  expect(far).toBeGreaterThan(near);
  expect(weatherEffect(game(windy, 80), 'QB').pct).toBe(0);
  expect(weatherEffect(game(windy, 5, { indoor: true }), 'QB').pct).toBe(0);
});

test('text reads like a forecast', () => {
  expect(forecastText(windy)).toBe('34°F (feels 24°), 21 mph wind');
  expect(forecastText(storm)).toBe('30°F (feels 18°), 25 mph wind, gusts 40, snow 90%');
});

const projections = {
  week: 10,
  players: [
    { id: 'qb1', name: 'Josh Allen', position: 'QB', team: 'BUF', opponent: 'MIA', points: { ppr: 22, std: 20 } },
    { id: 'qb2', name: 'Jared Goff', position: 'QB', team: 'DET', opponent: 'GB', points: { ppr: 21, std: 19 } },
    { id: 'd1', name: 'Bills', position: 'DEF', team: 'BUF', opponent: 'MIA', points: { ppr: 8, std: 8 } },
    { id: 'x', name: 'No Game Info', position: 'WR', team: 'SEA', points: { ppr: 10 } },
  ],
};
const weather = { week: 10, games: [game(windy), { home: 'DET', away: 'GB', kickoff: '2026-11-08T18:00:00Z', indoor: true, hoursOut: 6, forecast: null }] };

test('applies weather to projections for every scoring type', () => {
  const out = applyWeather(projections, weather, 'ppr');
  const allen = out.players[0];
  expect(allen.points.ppr).toBeLessThan(22);
  expect(allen.points.std).toBeLessThan(20);
  expect(allen.weather.delta).toBeLessThan(0);
  expect(weatherEffectText(allen.weather)).toMatch(/^−\d\.\d pts \(wind, cold\)$/);
  expect(out.players[1].points.ppr).toBe(21);
  expect(out.players[1].weather.indoor).toBe(true);
  expect(out.players[2].points.ppr).toBeGreaterThan(8);
  expect(out.players[3]).toBe(projections.players[3]);
});

test('ignores weather for another week, or none at all', () => {
  expect(applyWeather(projections, { ...weather, week: 11 }, 'ppr')).toBe(projections);
  expect(applyWeather(projections, null, 'ppr')).toBe(projections);
});

test('the ? card names the weather as a reason', () => {
  const out = applyWeather(projections, weather, 'ppr');
  const byId = new Map(out.players.map((p) => [p.id, p]));
  const [allen, goff] = withProjections([{ id: 'qb1' }, { id: 'qb2' }], byId, 'ppr', 10);
  expect(allen.weather.pct).toBeLessThan(0);
  const why = explainPair(goff, allen, { allPlayers: [allen, goff], defense: {}, scoring: 'ppr' });
  const row = why.factors.find((f) => f.key === 'weather');
  expect(row.start).toBe('Indoors, no effect');
  expect(row.edge).toBe('start');
  expect(why.basis).toMatch(/weather/);
});

test('every game gets a note, calm ones included', () => {
  const calmWeather = { week: 10, games: [game(calm)] };
  const out = applyWeather(projections, calmWeather, 'ppr');
  expect(out.players[0].points.ppr).toBe(22);
  expect(out.players[0].weather.pct).toBe(0);
  expect(shortForecast(out.players[0].weather)).toBe('60°');
  expect(shortForecast({ forecast: windy })).toBe('34° 21 mph');
  expect(shortForecast({ forecast: storm })).toBe('30° 25 mph snow');
  expect(weatherEffectText(out.players[0].weather)).toBe('No real effect');
});
