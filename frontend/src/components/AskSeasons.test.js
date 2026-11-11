// Plays whole fantasy seasons and asks the chat bar what a real manager would, the way they'd type it:
// lower case, typos, slang, last names only, follow-ups. Each league is drafted from the real player list
// with its own scoring and lineup settings; the manager's team is picked at random; injuries, byes and
// scores change week to week. Every question must get a real answer of the right kind.
// The CI run plays a short slice. ASK_SEASONS=4 ASK_LEAGUES=10 plays more; ASK_REPORT=/path writes every
// question and answer for reading through.
import React from 'react';
import fs from 'fs';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import axios from 'axios';
import { AskBar } from './StartSit';
import { buildLineup, withProjections } from '../data/startSitUtils';
import { positionRanks } from '../data/rankings';
import { initialPlayerList } from '../data/playerData';

jest.mock('../supabaseClient', () => ({
  SUPABASE_URL: 'https://x.supabase.co',
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) }, channel: () => ({}), removeChannel: () => {} },
}));

jest.setTimeout(3600000);

const SEASONS = Number(process.env.ASK_SEASONS || 1);
const LEAGUES = Number(process.env.ASK_LEAGUES || 1);
const WEEKS = process.env.ASK_WEEKS ? Number(process.env.ASK_WEEKS) : (process.env.ASK_SEASONS ? 13 : 3);

const random = (seedValue) => {
  let seed = seedValue % 2147483647 || 1;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  next.pick = (list) => list[Math.floor(next() * list.length)];
  next.chance = (p) => next() < p;
  return next;
};

const pts = (n) => ({ ppr: Math.round(n * 10) / 10, half: Math.round(n * 0.92 * 10) / 10, std: Math.round(n * 0.84 * 10) / 10 });
const SCALE = { QB: [24, 12], RB: [20, 4], WR: [19, 4], TE: [15, 3], K: [10, 6], DST: [10, 4] };
const SETTINGS = [
  { name: 'standard', qb: 1, rb: 2, wr: 2, te: 1, flex: 1, superFlex: 0, k: 1, def: 1 },
  { name: '3 WR', qb: 1, rb: 2, wr: 3, te: 1, flex: 1, superFlex: 0, k: 1, def: 1 },
  { name: 'superflex', qb: 1, rb: 2, wr: 2, te: 1, flex: 2, superFlex: 1, k: 1, def: 1 },
];
const TEAM_NAMES = ['Im gunna ka’imi', 'Racing with Ruggs', 'CumBoys', 'The Mongolian Graycocks', 'The Dicker Lickers',
  'jeevacation', 'The Faguars', 'The Detarders', 'TEAM LOG', 'Malik Ma Balls'];
const NICKNAMES = {
  'Christian McCaffrey': 'cmc', 'Jaxon Smith-Njigba': 'jsn', 'Amon-Ra St. Brown': 'arsb', 'A.J. Brown': 'ajb',
  'Jonathan Taylor': 'jt', 'Brian Thomas': 'btj', 'Marvin Harrison Jr.': 'mhj', 'Kenneth Walker III': 'kw3',
};

// ---- One league season ---------------------------------------------------------------------------
const buildSeason = (leagueNo, seasonNo) => {
  const rng = random(1000 + leagueNo * 97 + seasonNo * 7919);
  const scoring = rng.pick(['ppr', 'half', 'std']);
  const settings = rng.pick(SETTINGS);
  const pool = initialPlayerList.filter((p) => p.team);
  const nflTeams = [...new Set(pool.map((p) => p.team))].sort();
  const opponentIn = (team, week) => {
    const shift = (week * 5 + seasonNo) % (nflTeams.length - 1) + 1;
    return nflTeams[(nflTeams.indexOf(team) + shift) % nflTeams.length];
  };
  // Each player's level this season: their rank with some luck, and maybe an injury stretch.
  const counts = {};
  const base = new Map();
  const injuries = new Map();
  pool.forEach((p) => {
    counts[p.position] = (counts[p.position] || 0) + 1;
    const [top, bottom] = SCALE[p.position] || [8, 2];
    const level = Math.max(bottom, top - (counts[p.position] - 1) * ((top - bottom) / 40)) * (0.75 + rng() * 0.5);
    base.set(p.id, level);
    if (['QB', 'RB', 'WR', 'TE'].includes(p.position) && rng.chance(0.22)) {
      const start = 1 + Math.floor(rng() * 13);
      injuries.set(p.id, { start, end: start + Math.floor(rng() * 6) });
    }
  });
  const statusIn = (p, week) => {
    const injury = injuries.get(p.id);
    if (injury && week >= injury.start && week < injury.end) return week === injury.end - 1 && rng.chance(0.4) ? 'Questionable' : 'Out';
    return null;
  };
  const scoreIn = (p, week) => {
    if (Number(p.bye) === week || statusIn(p, week) === 'Out') return null;
    const b = base.get(p.id);
    return Math.max(0, b + (rng() - 0.5) * b * 1.2);
  };
  const history = new Map(pool.map((p) => [p.id, Array.from({ length: 17 }, (_, i) => scoreIn(p, i + 1))]));
  const questionable = new Map();

  // Ten teams draft in snake order, each taking one of the best few players they still need.
  const needs = { QB: settings.superFlex ? 3 : 2, RB: 5, WR: 5, TE: 2, K: 1, DST: 1 };
  const order = [...TEAM_NAMES].sort(() => rng() - 0.5);
  const rosters = new Map(order.map((n) => [n, []]));
  const taken = new Set();
  for (let round = 0; round < 16; round += 1) {
    (round % 2 ? [...order].reverse() : order).forEach((team) => {
      const roster = rosters.get(team);
      const count = (pos) => roster.filter((p) => p.position === pos).length;
      const options = pool.filter((p) => !taken.has(p.id) && count(p.position) < needs[p.position]
        && (!['K', 'DST'].includes(p.position) || round >= 12)).slice(0, 3);
      const pick = options.length ? options[Math.floor(rng() * options.length)] : null;
      if (pick) { roster.push(pick); taken.add(pick.id); }
    });
  }
  const myTeam = rng.pick(TEAM_NAMES);

  // Sleeper-style league schedule: a round robin, with team scores for the weeks already played.
  const strength = new Map(TEAM_NAMES.map((n) => [n, rosters.get(n).reduce((s, p) => s + base.get(p.id), 0) / 1.6]));
  const leagueSeason = (week) => {
    const teams = TEAM_NAMES.map((name, i) => ({ rosterId: i + 1, name, players: rosters.get(name).map((p) => p.id) }));
    const ids = teams.map((t) => t.rosterId);
    const weeks = Array.from({ length: 14 }, (_, w) => {
      const rot = [ids[0], ...ids.slice(1).map((_, i) => ids[1 + ((i + w) % 9)])];
      return {
        week: w + 1,
        games: [0, 1, 2, 3, 4].map((i) => {
          const score = (id) => (w + 1 < week ? Math.round(strength.get(TEAM_NAMES[id - 1]) * (0.8 + random(id * 31 + w * 7 + seasonNo)() * 0.4)) : 0);
          return { a: rot[i], b: rot[9 - i], aPoints: score(rot[i]), bPoints: score(rot[9 - i]) };
        }),
      };
    });
    return { leagueId: `L${leagueNo}-${seasonNo}-${week}`, leagueName: `League ${leagueNo + 1}`, season: 2026, fetchedAt: new Date().toISOString(), playoffWeekStart: 15, playoffTeams: 6, medianGame: false, lastScoredWeek: week - 1, teams, weeks };
  };

  // What the page knows going into a week: projections, the last few games, injuries and the schedule ahead.
  const weekData = (week) => {
    const players = pool.map((p) => {
      const scores = history.get(p.id).slice(0, week - 1);
      const played = scores.map((v, i) => ({ v, week: i + 1 })).filter((g) => g.v != null);
      const avg = played.length ? played.reduce((s, g) => s + g.v, 0) / played.length : 0;
      let injury = statusIn(p, week);
      if (!injury && rng.chance(0.04)) injury = 'Questionable';
      if (injury === 'Questionable') questionable.set(p.id, week);
      const onBye = Number(p.bye) === week;
      const skill = ['RB', 'WR', 'TE'].includes(p.position);
      const share = (base.get(p.id) / 20);
      return {
        id: p.id,
        name: p.name,
        position: p.position,
        team: p.team,
        opponent: onBye ? null : opponentIn(p.team, week),
        injury,
        onBye,
        points: pts(onBye || injury === 'Out' ? 0 : base.get(p.id) * (injury ? 0.85 : 1)),
        stats: {},
        recent: played.slice(-4).map((g) => ({ week: g.week, opponent: opponentIn(p.team, g.week), points: pts(g.v), stats: {} })),
        seasonAvg: played.length ? pts(avg) : null,
        seasonStats: null,
        gamesPlayed: played.length,
        upcoming: [1, 2, 3, 4].map((k) => week + k).filter((w) => w <= 17 && Number(p.bye) !== w)
          .map((w) => ({ week: w, opponent: opponentIn(p.team, w), points: pts(statusIn(p, w) === 'Out' ? 0 : base.get(p.id)) })),
        usage: skill ? {
          carryShare: p.position === 'RB' ? Math.min(0.75, share * 0.6) : 0.02,
          recentCarryShare: p.position === 'RB' ? Math.min(0.8, share * (0.4 + rng() * 0.4)) : 0.02,
          targetShare: p.position === 'RB' ? 0.1 : Math.min(0.32, share * 0.25),
          recentTargetShare: p.position === 'RB' ? 0.1 : Math.min(0.35, share * (0.15 + rng() * 0.2)),
          snapShare: Math.min(0.98, 0.4 + share * 0.4),
          recentSnapShare: Math.min(0.98, 0.35 + share * 0.45),
          recentGames: 3,
        } : null,
        spread: null,
      };
    });
    const defense = {};
    nflTeams.forEach((team, i) => {
      defense[team] = {};
      ['QB', 'RB', 'WR', 'TE'].forEach((position, j) => {
        const rank = ((i * 7 + j * 5 + seasonNo * 3) % 32) + 1;
        defense[team][position] = {
          games: Math.max(0, week - 1), rank, teams: 32, points: pts(SCALE[position][0] * (1.25 - rank / 64)), box: {},
          recentGames: [{ id: `x-${team}-${position}`, name: `Opposing ${position}`, team: 'XX', week: Math.max(1, week - 1), points: pts(15) }],
        };
      });
    });
    return { season: 2026, week, currentWeek: week, players, defense, fetchedAt: new Date().toISOString() };
  };
  return { leagueNo, seasonNo, rng, scoring, settings, rosters, myTeam, weekData, leagueSeason, base };
};

// ---- How people type -------------------------------------------------------------------------------
const SWAPS = [
  [/\byou\b/g, 'u'], [/\bare\b/g, 'r'], [/\bthis week\b/g, 'this wk'], [/\brest of season\b/g, 'ros'], [/\bright now\b/g, 'rn'],
  [/\bshould\b/g, 'shud'], [/\bplease\b/g, 'pls'], [/\bwith\b/g, 'w/'], [/\band\b/g, '&'], [/\bpeople\b/g, 'ppl'],
  [/\bpoints\b/g, 'pts'], [/\bwhat is\b/g, 'whats'], [/\bwho is\b/g, 'whos'], [/\bdo not\b/g, 'dont'], [/\bgoing to\b/g, 'gonna'],
];
const typo = (word, rng) => {
  if (word.length < 6 || !/^[a-z]+$/.test(word)) return word;
  const i = 1 + Math.floor(rng() * (word.length - 3));
  return rng.chance(0.5) ? word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2) : word.slice(0, i) + word.slice(i + 1);
};
const messy = (text, rng) => {
  let t = text;
  if (rng.chance(0.85)) t = t.toLowerCase();
  if (rng.chance(0.7)) t = t.replace(/[?.!,]/g, '');
  SWAPS.forEach(([from, to]) => { if (rng.chance(0.5)) t = t.replace(from, to); });
  if (rng.chance(0.35)) t = t.split(' ').map((w) => (rng.chance(0.18) ? typo(w, rng) : w)).join(' ');
  if (rng.chance(0.15)) t = `${rng.pick(['yo ', 'bro ', 'ok so ', 'hey ', 'quick q '])}${t}`;
  if (rng.chance(0.15)) t = `${t}${rng.pick([' lol', ' ??', ' pls', ' help', ' rn', '?!'])}`;
  return t;
};
// How a manager names a player: last name mostly, sometimes first, full or a nickname.
const callName = (p, rng) => {
  if (NICKNAMES[p.name] && rng.chance(0.5)) return NICKNAMES[p.name];
  const parts = p.name.replace(/ (Jr\.|Sr\.|II|III|IV)$/, '').split(' ');
  const r = rng();
  if (p.position === 'DST') return r < 0.5 ? `${parts[parts.length - 1]} defense` : p.name;
  if (r < 0.55) return parts[parts.length - 1];
  if (r < 0.7) return parts[0];
  return p.name;
};

// ---- What a manager asks, given their team this week ---------------------------------------------
// Each idea: the turns and the kinds of answer that are right for it.
const KINDS = {
  startOne: ['player', 'compare', 'lineup', 'injury', 'replace', 'stats'],
  startTwo: ['compare', 'comparefloor', 'compareceiling', 'comparevalue', 'player'],
  lineup: ['lineup'],
  injury: ['injury', 'teaminjuries', 'replace'],
  replace: ['replace', 'lineup', 'compare', 'injury'],
  bye: ['bye', 'lineup', 'replace'],
  needs: ['needs', 'plan', 'weakest'],
  pickup: ['pickup', 'availability', 'rankings'],
  drop: ['drop', 'pickup', 'availability'],
  trade: ['trade'],
  tradeFind: ['trade', 'buylow'],
  stats: ['stats', 'player', 'rank', 'value'],
  value: ['value', 'trade', 'stats'],
  league: ['league'],
  plan: ['plan', 'needs', 'lineup', 'weakest'],
  rankings: ['rankings'],
  matchup: ['matchup', 'schedule', 'matchuplist'],
  handcuff: ['handcuff'],
  trending: ['trending', 'stats'],
  why: null,
};

const questionsFor = (league, week, data, lineup, roster, others) => {
  const { rng } = league;
  const n = (p) => callName(p, rng);
  const ideas = [];
  const add = (kind, ...turns) => ideas.push({ kind, turns });
  const starters = lineup.starters.map((s) => s.player).filter(Boolean);
  const skillStarters = starters.filter((p) => ['QB', 'RB', 'WR', 'TE'].includes(p.position));
  const hurtStarters = roster.filter((p) => p.injury && ['QB', 'RB', 'WR', 'TE'].includes(p.position));
  const byes = roster.filter((p) => p.onBye);
  const bench = lineup.bench.filter((p) => ['RB', 'WR', 'TE'].includes(p.position) && p.points > 0);
  const flexStarter = lineup.starters.find((s) => s.slot.positions.length > 1 && s.player)?.player;
  const theirs = others.flatMap((t) => t.players.map((p) => ({ p, team: t.name })));
  const star = rng.pick(theirs.filter(({ p }) => ['RB', 'WR', 'TE'].includes(p.position)).slice(0, 60));
  const mine = rng.pick(skillStarters) || roster[0];

  // Every week: the lineup, and a close start/sit call.
  add('lineup', rng.pick(['who should I start this week', 'set my lineup', 'lineup help', 'whats my best lineup', 'start sit', 'who should i put in at flex', 'who should be in my lineup']));
  if (bench[0] && flexStarter) {
    add('startTwo', rng.pick([`${n(bench[0])} or ${n(flexStarter)}`, `start ${n(bench[0])} or ${n(flexStarter)}?`, `should I play ${n(bench[0])} over ${n(flexStarter)}`, `${n(flexStarter)} vs ${n(bench[0])} flex`, `who do i start ${n(bench[0])} ${n(flexStarter)}`]));
  }
  if (hurtStarters.length) {
    const p = rng.pick(hurtStarters);
    add('injury', rng.pick([`is ${n(p)} playing`, `${n(p)} hurt?`, `is ${n(p)} gonna play this week`, `whats going on with ${n(p)}`, `${n(p)} injury`, `will ${n(p)} play sunday`]));
    if (rng.chance(0.6)) add('replace', `is ${n(p)} out`, rng.pick(['who do i start instead', 'who replaces him', 'who should replace him', 'what do i do then']));
  }
  if (byes.length) add('bye', rng.pick(['who do i have on bye', 'byes this week?', `${n(byes[0])} is on bye who do i start`, 'any bye week issues']));
  // Most weeks: one or two of these, like a real manager checking in.
  const extras = [
    () => add('needs', rng.pick(['what does my team need', 'where am i weak', 'my team is thin where', 'what position should i upgrade', 'what am i missing'])),
    () => add('pickup', rng.pick(['who should i pick up', 'any good waiver adds', 'best free agent rn', `need a ${rng.pick(['rb', 'wr', 'te', 'qb'])} off waivers`, 'who is worth a claim', 'should i stream a defense'])),
    () => add('drop', rng.pick(['who should i drop', 'who do i cut', `should i drop ${n(rng.pick(lineup.bench.length ? lineup.bench : roster))}`])),
    () => add('trade', `would they take ${n(mine)} for ${n(star.p)}`, rng.pick(['is that fair', 'what else could i add', 'what if i add someone else', 'why'])),
    () => add('trade', rng.pick([`trade ${n(mine)} for ${n(star.p)}?`, `${n(mine)} for ${n(star.p)} good deal?`, `someone offered me ${n(star.p)} for ${n(mine)}`, `should i do ${n(mine)} for ${n(star.p)}`])),
    () => add('tradeFind', rng.pick([`what would it take to get ${n(star.p)}`, `how do i get ${n(star.p)}`, 'who should i trade for', `find me a trade for a ${rng.pick(['rb', 'wr', 'te'])}`, 'buy low guys', `what can i get for ${n(mine)}`])),
    () => add('stats', rng.pick([`how has ${n(mine)} been`, `${n(mine)} stats`, `${n(mine)} last few games`, `how many pts does ${n(mine)} get`, `is ${n(mine)} any good`, `${n(mine)} targets`])),
    () => add('value', rng.pick([`what is ${n(mine)} worth ros`, `should i sell ${n(mine)}`, `is ${n(star.p)} a buy low`, `keep or sell ${n(mine)}`, `${n(mine)} trade value`])),
    () => add('league', rng.pick(['am i making the playoffs', 'what are my odds', 'who do i play this week', 'will i win this week', 'power rankings', 'who is the best team', 'how is my team doing', 'standings'])),
    () => add('plan', rng.pick(['my team sucks what do i do', 'how do i get better', 'help me win', 'what should i do this week', 'any advice'])),
    () => add('rankings', rng.pick([`top ${rng.pick(['5', '10', '12'])} ${rng.pick(['rbs', 'wrs', 'qbs', 'tes'])}`, `best ${rng.pick(['rb', 'wr', 'te', 'qb'])}s this week`, 'rank my wrs', 'who is the te1'])),
    () => add('matchup', rng.pick([`is ${n(mine)} a good matchup`, `who does ${n(mine)} play`, `how is ${n(mine)}'s schedule`, 'easiest matchups this week', `${n(mine)} matchup`])),
    () => add('handcuff', `who is ${n(rng.pick(roster.filter((p) => p.position === 'RB')) || mine)}'s backup`),
    () => add('trending', rng.pick(['who is hot on my team', 'who on my team is struggling', 'who is underperforming'])),
    () => add('startOne', rng.pick([`should i start ${n(mine)}`, `start ${n(mine)}?`, `do i sit ${n(mine)}`, `is ${n(mine)} a must start`])),
    () => add('startTwo', `${n(skillStarters[0] || mine)} or ${n(skillStarters[1] || star.p)} rest of season`),
  ];
  const count = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i += 1) rng.pick(extras)();
  return ideas.map((idea) => ({ kind: idea.kind, turns: idea.turns.map((t) => messy(t, rng)) }));
};

// ---- Running it --------------------------------------------------------------------------------
let container;
const seasons = new Map();
beforeAll(() => {
  axios.defaults.adapter = (config) => {
    const id = decodeURIComponent((String(config.url).match(/leagueId=([^&]+)/) || [])[1] || '');
    const season = seasons.get(id);
    return season
      ? Promise.resolve({ data: season, status: 200, statusText: 'OK', headers: {}, config })
      : Promise.reject(Object.assign(new Error('Network Error'), { config }));
  };
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterAll(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
});

const ask = async (text) => {
  const input = container.querySelector('input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  const answer = container.querySelector('.ask-log > li .ask-answer');
  return { lead: answer.querySelector('p').textContent, all: answer.textContent, kind: answer.getAttribute('data-kind') || '' };
};

const FALLBACK = /I didn't find a player or a question|Something went wrong/;

test('a manager asking through whole seasons always gets a real answer of the right kind', async () => {
  const errors = [];
  jest.spyOn(console, 'error').mockImplementation((...args) => errors.push(args.map(String).join(' ')));
  const report = [];
  const gaps = [];
  const wrong = [];
  let asked = 0;
  for (let seasonNo = 0; seasonNo < SEASONS; seasonNo += 1) {
    for (let leagueNo = 0; leagueNo < LEAGUES; leagueNo += 1) {
      const league = buildSeason(leagueNo, seasonNo);
      report.push(`\n## Season ${seasonNo + 1}, league ${leagueNo + 1}: ${league.myTeam}, ${league.scoring}, ${league.settings.name}\n`);
      for (let week = 2; week < 2 + WEEKS; week += 1) {
        const data = league.weekData(week);
        const byId = new Map(data.players.map((p) => [p.id, p]));
        const posRanks = positionRanks(data.players, league.scoring);
        const ranked = (list) => withProjections(list, byId, league.scoring, week).map((p) => ({ ...p, posRank: posRanks.get(p.id) || null }));
        const roster = ranked(league.rosters.get(league.myTeam));
        const lineup = buildLineup(roster, league.settings);
        const others = TEAM_NAMES.filter((t) => t !== league.myTeam).map((name, i) => ({ key: `p${i}`, name, players: league.rosters.get(name) }));
        const rostered = new Set([...league.rosters.values()].flat().map((p) => p.id));
        const waiverPool = ranked(initialPlayerList.filter((p) => p.team && !rostered.has(p.id)));
        const season = league.leagueSeason(week);
        seasons.set(season.leagueId, season);
        const ideas = questionsFor(league, week, data, lineup, roster, others.map((o) => ({ ...o, players: ranked(o.players) })));
        report.push(`\n### Week ${week}\n`);
        for (const idea of ideas) {
          ReactDOM.unmountComponentAtNode(container);
          // eslint-disable-next-line no-loop-func
          act(() => {
            ReactDOM.render(
              <AskBar
                projections={data} projectionsById={byId} roster={roster} lineup={lineup}
                whyCtx={{ defense: data.defense, allPlayers: data.players, scoring: league.scoring, waiverPool, waiverNote: null }}
                scoring={league.scoring} week={week} partners={others} rosterSettings={league.settings}
                dynasty={false} ppr={league.scoring === 'ppr' ? 1 : league.scoring === 'half' ? 0.5 : 0} rosteredIds={rostered}
                waiverPool={waiverPool} waiverNote={null} posRanks={posRanks} updatedLabel="updated just now" leagueId={season.leagueId}
              />,
              container,
            );
          });
          for (let i = 0; i < idea.turns.length; i += 1) {
            const q = idea.turns[i];
            // eslint-disable-next-line no-await-in-loop
            const { lead, all, kind } = await ask(q);
            asked += 1;
            report.push(`- [${idea.kind}${i ? ' follow-up' : ''} → ${kind}] ${q}\n  ${all.slice(0, 400)}`);
            if (FALLBACK.test(all)) gaps.push(`[${idea.kind}] ${q} -> ${lead}`);
            else if (i === 0 && KINDS[idea.kind] && !KINDS[idea.kind].includes(kind)) wrong.push(`[${idea.kind} → ${kind}] ${q} -> ${lead.slice(0, 140)}`);
          }
        }
      }
    }
  }
  if (process.env.ASK_REPORT) {
    fs.writeFileSync(process.env.ASK_REPORT, `${asked} questions\n\nGAPS (${gaps.length}):\n${gaps.join('\n')}\n\nWRONG KIND (${wrong.length}):\n${wrong.join('\n')}\n${report.join('\n')}`);
  }
  expect(errors.filter((e) => e.includes('Ask bar failed'))).toEqual([]);
  expect(gaps).toEqual([]);
  expect(wrong).toEqual([]);
});
