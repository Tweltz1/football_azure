// Game-day facts for the chat bar: Vegas lines and weather for each NFL game (ESPN's public scoreboard),
// recent NFL headlines with the players they're about (ESPN's public news feed) and a Sleeper league's
// trade deadline. Every part is optional: a feed that fails just leaves its part empty.

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const SLEEPER = 'https://api.sleeper.app/v1';
const CACHE_MS = 30 * 60 * 1000;

type FetchJson = (url: string) => Promise<unknown>;
type Row = Record<string, unknown>;

export interface GameLine {
  home: string;
  away: string;
  kickoff: string;
  indoor: boolean;
  temperature: number | null;
  conditions: string | null;
  favorite: string | null;
  spread: number | null;
  overUnder: number | null;
}

export interface Headline {
  headline: string;
  description: string;
  published: string;
  url: string | null;
  players: string[];
}

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

const row = (value: unknown): Row => (value && typeof value === 'object' ? value as Row : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
// ESPN and Sleeper spell a few teams differently.
const TEAM_FIX: Record<string, string> = { WSH: 'WAS' };
const team = (abbr: string) => TEAM_FIX[abbr] ?? abbr;

/** "BUF -3" → favorite BUF by 3; "EVEN" → no favorite. */
const parseLine = (details: string) => {
  const match = details.match(/^([A-Z]{2,3})\s+(-?\d+(?:\.\d+)?)$/);
  return match ? { favorite: team(match[1]), spread: Math.abs(Number(match[2])) } : { favorite: null, spread: details ? 0 : null };
};

export async function gameLines(fetchJson: FetchJson, week: number): Promise<GameLine[]> {
  return await cached(`lines-${week}`, async () => {
    const board = row(await fetchJson(`${ESPN}/scoreboard?seasontype=2&week=${week}`));
    return list(board.events).map((event) => {
      const e = row(event);
      const comp = row(list(e.competitions)[0]);
      const sides = list(comp.competitors).map(row);
      const side = (where: string) => team(str(row(sides.find((s) => s.homeAway === where)?.team).abbreviation));
      const odds = row(list(comp.odds)[0]);
      const weather = row(e.weather);
      // Before kickoff the condition is words ("Rain"); during a game ESPN puts a code number there.
      const conditions = [str(weather.displayValue), str(weather.conditionId)].find((c) => c && !/^\d+$/.test(c)) || null;
      return {
        home: side('home'),
        away: side('away'),
        kickoff: str(e.date),
        indoor: row(comp.venue).indoor === true,
        temperature: num(weather.temperature),
        conditions,
        ...parseLine(str(odds.details)),
        overUnder: num(odds.overUnder),
      };
    }).filter((g) => g.home && g.away);
  });
}

export async function headlines(fetchJson: FetchJson): Promise<Headline[]> {
  return await cached('news', async () => {
    const feed = row(await fetchJson(`${ESPN}/news?limit=50`));
    return list(feed.articles).map((article) => {
      const a = row(article);
      return {
        headline: str(a.headline),
        description: str(a.description),
        published: str(a.published),
        url: str(row(row(a.links).web).href) || null,
        players: list(a.categories).map(row).filter((c) => c.type === 'athlete').map((c) => str(c.description)).filter(Boolean),
      };
    }).filter((h) => h.headline);
  });
}

/** The week trades close in a Sleeper league, or null when it has no deadline (Sleeper uses 99 for none). */
export async function tradeDeadline(fetchJson: FetchJson, leagueId: string): Promise<number | null> {
  return await cached(`deadline-${leagueId}`, async () => {
    const league = row(await fetchJson(`${SLEEPER}/league/${leagueId}`));
    const week = num(row(league.settings).trade_deadline);
    return week && week > 0 && week < 19 ? week : null;
  });
}

export async function gameDay(fetchJson: FetchJson, week: number, leagueId: string | null) {
  const [games, news, deadline] = await Promise.all([
    gameLines(fetchJson, week).catch(() => []),
    headlines(fetchJson).catch(() => []),
    leagueId ? tradeDeadline(fetchJson, leagueId).catch(() => undefined) : Promise.resolve(undefined),
  ]);
  return { week, games, news, ...(deadline === undefined ? {} : { tradeDeadline: deadline }) };
}
