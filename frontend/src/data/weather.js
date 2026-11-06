// Game weather in Start/Sit: turns each outdoor game's forecast (from /api/weather) into a change to this
// week's projections. The sizes come from 2019-2024 games (nflverse wind and temperature at kickoff vs each
// player's own season average): wind of 15+ mph cut QB scoring about 12%, WR 6-7%, TE about 9% and kickers
// 4-19%; below 25°F, passing and kicking fell further. Rain and snow aren't in that data, so they use small,
// commonly cited sizes. Forecasts start 3 days before kickoff and count less the further out they are.

import { normalizePosition } from './startSitUtils.js';

const round1 = (n) => Math.round(n * 10) / 10;
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
const effect = (QB, RB, WR, TE, K, DST) => ({ QB, RB, WR, TE, K, DST });

// Sustained wind over the game (mph). Big gusts bump it up a level.
const WIND = [
  { min: 23, label: 'strong wind', fx: effect(-0.13, 0, -0.09, -0.12, -0.18, 0.06) },
  { min: 18, label: 'wind', fx: effect(-0.10, -0.02, -0.07, -0.08, -0.12, 0.04) },
  { min: 12, label: 'breezy', fx: effect(-0.05, 0, -0.04, -0.03, -0.07, 0.02) },
];
// What it feels like outside (°F).
const COLD = [
  { max: 19, label: 'frigid', fx: effect(-0.06, -0.03, -0.08, -0.03, -0.10, 0.03) },
  { max: 31, label: 'cold', fx: effect(-0.02, 0, -0.03, 0, -0.05, 0.01) },
];
const HEAVY_WET = effect(-0.05, 0.02, -0.05, -0.03, -0.06, 0.04);
const LIGHT_WET = effect(-0.02, 0, -0.02, 0, -0.03, 0.02);

const MOST_DOWN = -0.22;
const MOST_UP = 0.08;

/** How much a forecast counts by how far out it is: fully on game day, less a few days ahead, not at all past 3 days. */
export const forecastWeight = (hoursOut) => {
  if (hoursOut == null || hoursOut > 72) return 0;
  if (hoursOut <= 18) return 1;
  if (hoursOut <= 42) return 0.85;
  return 0.65;
};

const windLevel = (f) => {
  const gustBump = f.gustMph >= 35 ? 5 : 0;
  return WIND.find((w) => f.windMph + gustBump >= w.min) || null;
};
const wetLevel = (f) => {
  if (f.precipChance < 50) return null;
  if (f.snowCm >= 1 || f.rainMm >= 2.5) return { label: f.snowCm >= 0.3 ? 'heavy snow' : 'heavy rain', fx: HEAVY_WET };
  if (f.snowCm >= 0.3 || f.rainMm >= 1) return { label: f.snowCm >= 0.3 ? 'snow' : 'rain', fx: LIGHT_WET };
  return null;
};

/** Short forecast line, like "34°F, 21 mph wind, rain likely". */
export const forecastText = (f) => {
  if (!f) return '';
  const bits = [`${f.tempF}°F`];
  if (f.feelsF <= f.tempF - 5) bits[0] += ` (feels ${f.feelsF}°)`;
  if (f.windMph >= 8) bits.push(`${Math.round(f.windMph)} mph wind${f.gustMph >= f.windMph + 10 ? `, gusts ${Math.round(f.gustMph)}` : ''}`);
  if (f.precipChance >= 40 && (f.snowCm >= 0.1 || f.rainMm >= 0.3)) bits.push(`${f.snowCm >= 0.1 ? 'snow' : 'rain'} ${f.precipChance}%`);
  return bits.join(', ');
};

/**
 * The change to one position's projection from one game's weather.
 * Returns { pct, reasons, weight } where pct is a fraction (−0.08 = 8% fewer points).
 */
export const weatherEffect = (game, position) => {
  const f = game?.forecast;
  if (!f || game.indoor || !POSITIONS.includes(position)) return { pct: 0, reasons: [], weight: 0 };
  const weight = forecastWeight(game.hoursOut);
  const parts = [windLevel(f), COLD.find((c) => f.feelsF <= c.max), wetLevel(f)].filter(Boolean);
  const raw = parts.reduce((sum, p) => sum + p.fx[position], 0);
  const pct = Math.max(MOST_DOWN, Math.min(MOST_UP, raw)) * weight;
  return {
    pct: Math.abs(pct) < 0.01 ? 0 : Math.round(pct * 1000) / 1000,
    reasons: parts.filter((p) => p.fx[position] !== 0).map((p) => p.label),
    weight,
  };
};

/** Games by team: each game is listed under both teams. */
export const gamesByTeam = (weather) => {
  const map = new Map();
  (weather?.games || []).forEach((g) => { map.set(g.home, g); map.set(g.away, g); });
  return map;
};

const scalePoints = (points, factor) => {
  if (!points || typeof points !== 'object') return points;
  const out = {};
  Object.entries(points).forEach(([key, value]) => { out[key] = typeof value === 'number' ? round1(value * factor) : value; });
  return out;
};

/**
 * Projections with this week's weather applied: outdoor players' points scaled, and a `weather` note on
 * every player whose game we know about ({ text, pct, reasons, indoor, hoursOut, delta }).
 */
export const applyWeather = (projections, weather, scoring) => {
  if (!projections || !weather?.games?.length) return projections;
  if (weather.week && projections.week && Number(weather.week) !== Number(projections.week)) return projections;
  const byTeam = gamesByTeam(weather);
  const players = (projections.players || []).map((p) => {
    const game = byTeam.get(p.team);
    if (!game || p.onBye) return p;
    if (game.indoor) return { ...p, weather: { indoor: true, text: 'Indoors', pct: 0, reasons: [], hoursOut: game.hoursOut } };
    if (!game.forecast) return p;
    const fx = weatherEffect(game, normalizePosition(p.position));
    const before = Number(p.points?.[scoring] ?? 0);
    const points = fx.pct ? scalePoints(p.points, 1 + fx.pct) : p.points;
    return {
      ...p,
      points,
      weather: {
        indoor: false,
        text: forecastText(game.forecast),
        pct: fx.pct,
        reasons: fx.reasons,
        hoursOut: game.hoursOut,
        checkedAt: game.checkedAt,
        delta: fx.pct ? round1(Number(points?.[scoring] ?? 0) - before) : 0,
      },
    };
  });
  return { ...projections, players };
};

/** "−1.4 pts (wind, rain)" or "No effect". */
export const weatherEffectText = (w) => {
  if (!w || w.indoor) return w?.indoor ? 'Indoors, no effect' : '';
  if (!w.pct) return 'No real effect';
  const sign = w.delta > 0 ? '+' : '−';
  return `${sign}${Math.abs(w.delta).toFixed(1)} pts${w.reasons.length ? ` (${w.reasons.join(', ')})` : ''}`;
};
