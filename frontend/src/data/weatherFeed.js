// Game weather for Start/Sit, fetched by the browser: kickoff times, home teams and roofs from ESPN's public
// scoreboard, and an hourly Open-Meteo forecast (free, no key) for each outdoor stadium, averaged over the
// game's first three hours. Both allow browser requests; ESPN turns away requests from our Supabase server.
// Forecasts start 3 days before kickoff. They're kept 6 hours, and 1 hour once kickoff is within a day.

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const HOUR = 3600_000;
export const FORECAST_HOURS = 72;

// Each team's home stadium. Retractable roofs count as indoor: they close when the weather is bad.
const STADIUMS = {
  ARI: { lat: 33.5276, lon: -112.2626, indoor: true },
  ATL: { lat: 33.7554, lon: -84.4009, indoor: true },
  BAL: { lat: 39.278, lon: -76.6227, indoor: false },
  BUF: { lat: 42.7738, lon: -78.787, indoor: false },
  CAR: { lat: 35.2258, lon: -80.8528, indoor: false },
  CHI: { lat: 41.8623, lon: -87.6167, indoor: false },
  CIN: { lat: 39.0955, lon: -84.5161, indoor: false },
  CLE: { lat: 41.5061, lon: -81.6995, indoor: false },
  DAL: { lat: 32.7473, lon: -97.0945, indoor: true },
  DEN: { lat: 39.7439, lon: -105.0201, indoor: false },
  DET: { lat: 42.34, lon: -83.0456, indoor: true },
  GB: { lat: 44.5013, lon: -88.0622, indoor: false },
  HOU: { lat: 29.6847, lon: -95.4107, indoor: true },
  IND: { lat: 39.7601, lon: -86.1639, indoor: true },
  JAX: { lat: 30.3239, lon: -81.6373, indoor: false },
  KC: { lat: 39.0489, lon: -94.4839, indoor: false },
  LV: { lat: 36.0909, lon: -115.1833, indoor: true },
  LAC: { lat: 33.9535, lon: -118.3392, indoor: true },
  LAR: { lat: 33.9535, lon: -118.3392, indoor: true },
  MIA: { lat: 25.958, lon: -80.2389, indoor: false },
  MIN: { lat: 44.9737, lon: -93.2581, indoor: true },
  NE: { lat: 42.0909, lon: -71.2643, indoor: false },
  NO: { lat: 29.9511, lon: -90.0812, indoor: true },
  NYG: { lat: 40.8135, lon: -74.0745, indoor: false },
  NYJ: { lat: 40.8135, lon: -74.0745, indoor: false },
  PHI: { lat: 39.9008, lon: -75.1675, indoor: false },
  PIT: { lat: 40.4468, lon: -80.0158, indoor: false },
  SF: { lat: 37.4033, lon: -121.9694, indoor: false },
  SEA: { lat: 47.5952, lon: -122.3316, indoor: false },
  TB: { lat: 27.9759, lon: -82.5033, indoor: false },
  TEN: { lat: 36.1665, lon: -86.7713, indoor: false },
  WAS: { lat: 38.9078, lon: -76.8645, indoor: false },
};

// Neutral-site games (international series), found by the venue's city.
const NEUTRAL_CITIES = {
  london: { lat: 51.56, lon: -0.17 },
  munich: { lat: 48.2188, lon: 11.6247 },
  frankfurt: { lat: 50.0686, lon: 8.6455 },
  berlin: { lat: 52.5147, lon: 13.2395 },
  dublin: { lat: 53.3607, lon: -6.2511 },
  madrid: { lat: 40.4531, lon: -3.6883 },
  'sao paulo': { lat: -23.5453, lon: -46.4742 },
  'são paulo': { lat: -23.5453, lon: -46.4742 },
  'mexico city': { lat: 19.3029, lon: -99.1505 },
  melbourne: { lat: -37.82, lon: 144.983 },
};

const TEAM_FIX = { WSH: 'WAS', LA: 'LAR' };
const team = (abbr) => TEAM_FIX[abbr] ?? abbr;
const row = (value) => (value && typeof value === 'object' ? value : {});
const list = (value) => (Array.isArray(value) ? value : []);
const str = (value) => (typeof value === 'string' ? value.trim() : '');
const nums = (value) => list(value).map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null));
const round1 = (n) => Math.round(n * 10) / 10;

const defaultFetch = async (url) => {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`GET ${new URL(url).host} failed with ${response.status}`);
  return response.json();
};

const boards = new Map();
const forecasts = new Map();
export const clearWeatherCache = () => { boards.clear(); forecasts.clear(); };

/** The week's games from ESPN's scoreboard, with where each is played. */
export const readSchedule = (board) => list(row(board).events).map((event) => {
  const e = row(event);
  const comp = row(list(e.competitions)[0]);
  const sides = list(comp.competitors).map(row);
  const side = (where) => team(str(row(sides.find((s) => s.homeAway === where)?.team).abbreviation));
  const venue = row(comp.venue);
  const home = side('home');
  const neutral = comp.neutralSite === true;
  const city = str(row(venue.address).city).toLowerCase();
  const stadium = STADIUMS[home];
  const indoor = venue.indoor === true || (!neutral && !!stadium?.indoor);
  const place = neutral ? (NEUTRAL_CITIES[city] ?? null) : (stadium ? { lat: stadium.lat, lon: stadium.lon } : null);
  return { home, away: side('away'), kickoff: str(e.date), indoor, venue: str(venue.fullName), place };
}).filter((g) => g.home && g.away && g.kickoff);

/** Averages the hourly forecast over the game's first three hours. */
export const readForecast = (body, kickoff) => {
  const hourly = row(row(body).hourly);
  const times = list(hourly.time).map(str);
  const start = new Date(kickoff);
  start.setUTCMinutes(0, 0, 0);
  const first = times.indexOf(`${start.toISOString().slice(0, 13)}:00`);
  if (first < 0) return null;
  const pick = (name) => nums(hourly[name]).slice(first, first + 3).filter((v) => v != null);
  const avg = (name) => { const v = pick(name); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const max = (name) => { const v = pick(name); return v.length ? Math.max(...v) : null; };
  const temp = avg('temperature_2m');
  const wind = avg('wind_speed_10m');
  if (temp == null || wind == null) return null;
  return {
    tempF: Math.round(temp),
    feelsF: Math.round(avg('apparent_temperature') ?? temp),
    windMph: round1(wind),
    gustMph: round1(max('wind_gusts_10m') ?? wind),
    rainMm: round1(avg('rain') ?? 0),
    snowCm: round1(avg('snowfall') ?? 0),
    precipChance: Math.round(max('precipitation_probability') ?? 0),
  };
};

const forecastFor = async (fetchJson, game, hoursOut, now) => {
  const key = `${game.home}-${game.kickoff}`;
  const hit = forecasts.get(key);
  const ttl = hoursOut <= 24 ? HOUR : 6 * HOUR;
  if (hit && now - hit.at < ttl) return hit;
  const day = game.kickoff.slice(0, 10);
  const next = new Date(Date.parse(game.kickoff) + 6 * HOUR).toISOString().slice(0, 10);
  const url = `${OPEN_METEO}?latitude=${game.place.lat}&longitude=${game.place.lon}`
    + '&hourly=temperature_2m,apparent_temperature,rain,snowfall,precipitation_probability,wind_speed_10m,wind_gusts_10m'
    + `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=GMT&start_date=${day}&end_date=${next}`;
  const entry = { at: now, forecast: readForecast(await fetchJson(url), game.kickoff) };
  forecasts.set(key, entry);
  return entry;
};

/**
 * This week's games with their forecasts: { week, games: [{ home, away, kickoff, indoor, venue, hoursOut,
 * forecast, checkedAt }] }. Indoor games, games more than 3 days out and stadiums we can't place have no forecast.
 */
export const loadWeather = async (week, { fetchJson = defaultFetch, now = Date.now() } = {}) => {
  const key = String(week);
  let hit = boards.get(key);
  if (!hit || now - hit.at >= HOUR) {
    hit = { at: now, games: readSchedule(await fetchJson(`${ESPN}/scoreboard?seasontype=2&week=${week}`)) };
    boards.set(key, hit);
  }
  const games = await Promise.all(hit.games.map(async (game) => {
    const hoursOut = round1((Date.parse(game.kickoff) - now) / HOUR);
    const base = { home: game.home, away: game.away, kickoff: game.kickoff, indoor: game.indoor, venue: game.venue, hoursOut, forecast: null, checkedAt: null };
    if (game.indoor || !game.place || hoursOut > FORECAST_HOURS || hoursOut < -4) return base;
    try {
      const entry = await forecastFor(fetchJson, game, hoursOut, now);
      return { ...base, forecast: entry.forecast, checkedAt: new Date(entry.at).toISOString() };
    } catch (error) {
      return base;
    }
  }));
  return { week: Number(week), games };
};
