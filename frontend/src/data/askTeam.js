// Chat bar answers about whole teams and lists of players rather than one player: rankings, defenses,
// what a team needs, its bench, injuries, byes, who's hot or cold, buy-low and sell-high lists, a plan to
// get better, and a player's full stat line, rest-of-season comparisons, availability and handcuffs.
import { defenseMatchup, isUnavailable, trendFor } from './startSitUtils.js';
import { rankLabel } from './rankings.js';
import {
  askedPosition, firstName, ideaItems, playerLine, pts, scheduleSection, tidy, usageLine,
} from './askModel.js';

const SKILL = ['QB', 'RB', 'WR', 'TE'];
const POSITION_NAMES = { QB: 'QBs', RB: 'RBs', WR: 'WRs', TE: 'TEs', K: 'kickers', DST: 'defenses', FLEX: 'flex players' };
const round1 = (n) => Math.round(n * 10) / 10;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const fitsPosition = (p, position) => !position || p.position === position
  || (position === 'FLEX' && ['RB', 'WR', 'TE'].includes(p.position))
  || (position === 'SUPERFLEX' && SKILL.includes(p.position));

/** "Top 10 WRs", "who is the RB1", "rank my running backs", "best kickers this week". */
export function answerRankings(text, ctx) {
  const t = tidy(text);
  const position = askedPosition(text) || 'FLEX';
  const asked = Number((t.match(/\btop (\d{1,2})\b/) || [])[1]) || null;
  const availableOnly = /\b(available|free agents?|waivers?|unrostered|nobody has|sleepers?)\b/.test(t);
  const mineOnly = !availableOnly && /\b(my|mine|i have|on my team)\b/.test(t);
  let list = (mineOnly ? ctx.roster : ctx.allPlayers)
    .filter((p) => fitsPosition(p, position) && p.points != null && p.points > 0 && !p.onBye);
  if (availableOnly && ctx.leagueIds) list = list.filter((p) => !ctx.leagueIds.has(p.id));
  list = [...list].sort((a, b) => (b.points || 0) - (a.points || 0));
  const single = /\b(the )?(qb|rb|wr|te)1\b/.test(t) && !asked;
  const count = single ? 3 : Math.min(asked || (mineOnly ? 8 : 10), 25);
  const shown = list.slice(0, count);
  if (!shown.length) return { text: `I don't have ${POSITION_NAMES[position] || position} projected this week${mineOnly ? ' on your team' : ''}.` };
  const label = POSITION_NAMES[position] || position;
  const lead = single
    ? `${shown[0].name} projects the most of any ${position} this week (${pts(shown[0].points)}).`
    : mineOnly
      ? `Your ${label} this week, best first:`
      : `Top ${shown.length} ${label} this week by projection${availableOnly ? ' that nobody in your league has' : ''}:`.replace('Top 10 flex players', 'Top 10 RB/WR/TEs');
  return {
    text: lead,
    items: shown.map((p) => ({
      label: p.posRank ? rankLabel(p.position, p.posRank) : p.position,
      name: `${p.name}${ownerTag(p, ctx)}`,
      detail: playerLine(p),
      value: p.points,
    })),
    note: mineOnly ? 'Ask "who should I start at RB?" (any spot) for the reasons.' : 'See every position on the Rankings page.',
    context: { players: shown.slice(0, 1), position },
  };
}

const ownerTag = (p, ctx) => {
  const owner = ctx.ownerOf?.(p);
  if (owner === 'you') return ' (yours)';
  if (!owner && ctx.leagueIds && !ctx.leagueIds.has(p.id)) return ' (available)';
  return '';
};

/** NFL teams named in a question, by abbreviation ("kc") or city / nickname from the defenses' names. */
const teamsIn = (text, ctx) => {
  const words = tidy(text).split(' ');
  const teams = Object.keys(ctx.defense || {});
  const names = new Map();
  ctx.allPlayers.filter((p) => p.position === 'DST').forEach((p) => names.set(p.team, tidy(p.name).split(' ').filter((w) => w.length >= 4 && w !== 'defense')));
  return teams.filter((team) => words.includes(team.toLowerCase()) || (names.get(team) || []).some((w) => words.includes(w) || words.includes(`${w}s`)));
};

/** "Which defenses give up the most to RBs?", "how does KC defend tight ends?" */
export function answerDefenses(text, ctx) {
  const t = tidy(text);
  // The position after "against", "to" or "vs" is the one being defended ("defense ... against WRs").
  const after = t.match(/\b(?:against|to|vs|versus|defend(?:ing)?|cover(?:ing)?)\s+((?:the\s+)?[a-z]+(?:\s+[a-z]+)?)/);
  const position = (after && askedPosition(after[1])) || ['QB', 'RB', 'WR', 'TE'].find((pos) => askedPosition(t.replace(/\bdefen[cs]es?\b|\bdef\b|\bdst\b/g, '')) === pos) || null;
  const named = teamsIn(text, ctx);
  const rowsFor = (pos) => Object.entries(ctx.defense || {})
    .map(([team, byPos]) => ({ team, row: byPos?.[pos] }))
    .filter((r) => r.row);
  if (named.length && position) {
    const team = named[0];
    const row = ctx.defense[team]?.[position];
    if (!row) return { text: `I don't have ${team}'s numbers against ${position}s yet.` };
    const m = defenseMatchup({ position, opponent: team }, ctx.defense, ctx.scoring);
    const rows = m.rows.slice(1).filter((r) => Number.isFinite(Number(r.value)) && Number.isFinite(Number(r.league)));
    const verdict = m.early ? 'too early to tell' : { good: 'an easy matchup', average: 'an average matchup', tough: 'a tough matchup' }[m.verdict];
    return {
      text: `${team} has the ${m.rankLabel} (${m.rows[0].value.toFixed(1)} a game, average ${m.rows[0].league.toFixed(1)}), so ${verdict} for ${position}s.`,
      items: rows.length ? rows.map((r) => ({ name: r.label, detail: `league average ${Number(r.league).toFixed(1)}`, value: Number(r.value) })) : null,
      itemsTitle: rows.length ? `What ${team} allows to ${position}s a game:` : null,
      sections: m.notable.length ? [{ title: `Top ${position}s against ${team} lately:`, items: m.notable.slice(0, 4).map((g) => ({ label: `Wk ${g.week}`, name: `${g.name} ${g.value.toFixed(1)}`, detail: g.team })) }] : [],
    };
  }
  const pos = position || 'WR';
  const easiest = !/\b(best|toughest|hardest|stingiest|fewest|least|stop)\b/.test(t);
  const rows = rowsFor(pos).sort((a, b) => (easiest ? a.row.rank - b.row.rank : b.row.rank - a.row.rank)).slice(0, 6);
  if (!rows.length) return { text: `I don't have defense numbers for ${pos}s yet.` };
  return {
    text: easiest ? `Defenses that give up the most to ${pos}s:` : `Toughest defenses for ${pos}s:`,
    items: rows.map(({ team, row }) => ({ label: `#${easiest ? row.rank : row.teams - row.rank + 1}`, name: team, detail: `${plural(row.games, 'game')}`, value: Number(row.points?.[ctx.scoring] ?? 0), valueLabel: 'a game' })),
    note: 'Ask "is X a good matchup this week?" about any player.',
  };
}

/** Matchups this week for your starters (or, without "my", for the top players at each position). */
export function answerMatchupList(text, ctx) {
  const t = tidy(text);
  const tough = /\b(tough|hard|bad|worst|difficult)\b/.test(t);
  const mine = /\b(my|i|me)\b/.test(t);
  const pool = mine
    ? ctx.lineup.starters.map((s) => s.player).filter(Boolean)
    : ctx.allPlayers.filter((p) => SKILL.includes(p.position) && p.posRank && p.posRank <= (p.position === 'QB' || p.position === 'TE' ? 15 : 30));
  const rated = pool
    .map((p) => ({ p, m: defenseMatchup(p, ctx.defense, ctx.scoring) }))
    .filter((r) => r.m && !r.m.early && r.m.verdict === (tough ? 'tough' : 'good'))
    .sort((a, b) => (tough ? b.m.rank - a.m.rank : a.m.rank - b.m.rank))
    .slice(0, 8);
  if (!rated.length) return { text: `${mine ? 'None of your starters has' : 'No top player has'} a clearly ${tough ? 'tough' : 'easy'} matchup this week.` };
  return {
    text: `${tough ? 'Tough' : 'Easy'} matchups this week${mine ? ' for your starters' : ''}:`,
    items: rated.map(({ p, m }) => ({ label: p.position, name: `${p.name} vs ${m.opponent}`, detail: `${m.opponent} has the ${m.rankLabel}.`, value: p.points })),
    note: 'Ask "is X a good matchup?" for the details on any one of them.',
  };
}

/** Your team's (or another team's) strong and weak positions, from every team's best lineup. */
export function answerNeeds(text, ctx, teamName = null) {
  if (!ctx.needs) return { text: 'Pick a league at the top of the page first, so I can compare your team with the others.' };
  const needs = ctx.needs();
  const row = teamName ? needs.rows.find((r) => r.name === teamName) : needs.rows.find((r) => r.mine);
  if (!row) return { text: `I couldn't find ${teamName || 'your team'} in this league.` };
  const t = tidy(text);
  const cells = needs.positions.map((pos) => ({ pos, ...row.cells[pos] }));
  const weakest = [...cells].sort((a, b) => b.rank - a.rank);
  const strongest = [...cells].sort((a, b) => a.rank - b.rank);
  const teams = needs.rows.length;
  const who = row.mine ? 'Your' : `${row.name}'s`;
  const line = (c) => `${c.pos}: #${c.rank} of ${teams} (${c.points.toFixed(1)} pts a week)`;
  const items = cells.map((c) => ({ label: c.pos, name: `#${c.rank} of ${teams}`, detail: c.tier === 'strong' ? 'A strength' : c.tier === 'weak' ? 'A need' : 'About average', value: c.points, valueLabel: 'a week' }));
  const asked = askedPosition(text);
  const cell = cells.find((c) => c.pos === asked);
  if (cell) {
    const word = cell.tier === 'strong' ? 'a strength' : cell.tier === 'weak' ? 'a need' : 'about average';
    return {
      text: `${who} ${asked}s rank #${cell.rank} of ${teams} (${cell.points.toFixed(1)} pts a week from the starters), so ${word}.`
        + (cell.tier === 'weak' && row.mine ? ` Ask "find me a trade for a ${asked}" or "best ${asked} on waivers".` : ''),
      items,
      itemsTitle: 'Every position, ranked against the league:',
      context: { position: asked },
    };
  }
  if (/strong|best/.test(t) && !/weak|need/.test(t)) {
    return { text: `${who} strongest position is ${line(strongest[0])}.`, items, itemsTitle: 'Every position, ranked against the league:' };
  }
  const weak = weakest[0];
  const strong = strongest[0];
  const advice = row.mine
    ? ` Look to trade from ${strong.pos} (#${strong.rank}) for a ${weak.pos}. Ask "find me a trade for a ${weak.pos}" or "best ${weak.pos} on waivers".`
    : ` They could use a ${weak.pos}, and are deepest at ${strong.pos}, so offer a ${weak.pos} and ask for their ${strong.pos}.`;
  return {
    text: `${who} weakest position is ${line(weak)}.${advice}`,
    items,
    itemsTitle: 'Every position, ranked against the league:',
    note: `Overall, ${row.mine ? 'your' : 'their'} best lineup ranks #${row.totalRank} of ${teams}.`,
    context: row.mine ? { position: weak.pos } : { team: row.name, position: strong.pos },
  };
}

/** Bench players: what they're worth and when they'd matter. */
export function answerBench(ctx) {
  const bench = ctx.lineup.bench.map((p) => ({ p, outlook: ctx.outlookOf(p) }))
    .sort((a, b) => (b.outlook?.value ?? 0) - (a.outlook?.value ?? 0));
  if (!bench.length) return { text: 'You have nobody on your bench.' };
  const useful = bench.filter((b) => (b.outlook?.value ?? 0) >= 8).length;
  return {
    text: `${plural(bench.length, 'player')} on your bench; ${useful} of them ${useful === 1 ? 'is' : 'are'} worth 8+ pts a game the rest of the way.`,
    items: bench.map(({ p, outlook }) => ({ label: p.position, name: p.name, detail: playerLine(p), value: outlook?.value ?? null, valueLabel: 'a game ROS' })),
    note: 'Ask "who should I drop?" or "who should I trade away?" to use the bench better.',
  };
}

/** Who's hot or cold on your team: last 3 games against their season average. */
export function answerTrending(text, ctx) {
  const t = tidy(text);
  const down = /\b(under|cold|down|struggl|slump|bust|disappoint|bad)/.test(t);
  const mine = !/\b(league|anyone|any player|in football|nfl)\b/.test(t);
  const pool = mine ? ctx.roster : ctx.allPlayers.filter((p) => p.posRank && p.posRank <= 40);
  const rows = pool
    .filter((p) => SKILL.includes(p.position))
    .map((p) => ({ p, trend: trendFor(p, ctx.scoring) }))
    .filter((r) => r.trend.direction === (down ? 'down' : 'up'))
    .sort((a, b) => (down ? (a.trend.lastThree - a.trend.season) - (b.trend.lastThree - b.trend.season) : (b.trend.lastThree - b.trend.season) - (a.trend.lastThree - a.trend.season)))
    .slice(0, 6);
  if (!rows.length) return { text: `Nobody ${mine ? 'on your team ' : ''}is clearly ${down ? 'below' : 'above'} their season average over the last 3 games.` };
  return {
    text: down ? `Below their season average lately${mine ? ' on your team' : ''}:` : `Hot lately${mine ? ' on your team' : ''}, above their season average:`,
    items: rows.map(({ p, trend }) => ({ label: p.position, name: p.name, detail: `${trend.lastThree} a game over the last 3, ${trend.season} for the season`, value: trend.lastThree - trend.season, valueLabel: 'vs avg' })),
    note: down ? 'A cold stretch alone rarely carries over; workload is the better sign. Ask "how is X doing?" for usage.' : 'Hot streaks alone rarely carry over; check the workload with "how is X doing?".',
  };
}

/** The most valuable players on your roster for the rest of the season. */
export function answerBestPlayers(ctx) {
  const rows = ctx.roster.map((p) => ({ p, v: ctx.outlookOf(p)?.value ?? 0 })).sort((a, b) => b.v - a.v).slice(0, 5);
  if (!rows.length) return { text: 'Pick your team at the top of the page first.' };
  return {
    text: `${rows[0].p.name} is your most valuable player, at about ${rows[0].v.toFixed(1)} pts a game the rest of the way.`,
    items: rows.map(({ p, v }) => ({ label: p.position, name: p.name, detail: playerLine(p), value: v, valueLabel: 'a game ROS' })),
    context: { players: [rows[0].p] },
  };
}

/** The starter projected furthest below what that spot usually gets, and how to upgrade it. */
export function answerWeakestStarter(ctx) {
  const starters = ctx.lineup.starters.filter((s) => s.player && SKILL.includes(s.player.position));
  if (!starters.length) return { text: 'Pick your team at the top of the page first.' };
  const weakest = [...starters].sort((a, b) => (a.player.posRank || 99) / (a.player.position === 'QB' || a.player.position === 'TE' ? 1 : 2.5)
    - (b.player.posRank || 99) / (b.player.position === 'QB' || b.player.position === 'TE' ? 1 : 2.5)).pop();
  const p = weakest.player;
  return {
    text: `Your weakest starter is ${p.name} at ${weakest.slot.label} (${p.posRank ? rankLabel(p.position, p.posRank) : p.position} this week, ${pts(p.points)} projected).`
      + ` That's the spot to upgrade: ask "find me a trade for a ${p.position}" or "best ${p.position} on waivers".`,
    context: { players: [p], position: p.position },
  };
}

/** Injured or out players on your team, with when they're expected back. */
export function answerTeamInjuries(ctx) {
  const hurt = ctx.roster.filter((p) => p.injury);
  if (!hurt.length) return { text: 'Nobody on your team is on the injury report.' };
  return {
    text: `${plural(hurt.length, 'player')} on your team ${hurt.length === 1 ? 'is' : 'are'} on the injury report:`,
    items: hurt.map((p) => {
      const outlook = ctx.outlookOf(p);
      const back = isUnavailable(p.injury) && outlook?.backWeek ? `projected back in week ${outlook.backWeek}` : isUnavailable(p.injury) ? 'no return date yet' : 'expected to play';
      return { label: p.position, name: `${p.name} (${p.injury})`, detail: back, value: p.points };
    }),
    note: 'Ask "is X hurt?" about anyone for teammates who pick up the work.',
    context: { players: hurt.slice(0, 1) },
  };
}

/** Bye weeks ahead for your season starters, and a player's own bye. */
export function answerByes(text, found, ctx) {
  const week = ctx.week;
  if (found.length) {
    const p = ctx.scored(found[0].player);
    const bye = ctx.byeOf?.(p);
    if (p.onBye || bye === week) return { text: `${p.name} is on bye this week (week ${week}).` };
    if (bye) return { text: `${p.name}'s bye is week ${bye}${bye < week ? ', already past' : ''}.${bye > week ? ` ${p.name} plays this week${p.opponent ? ` vs ${p.opponent}` : ''}.` : ''}` };
    return { text: `${p.name} plays this week${p.opponent ? ` vs ${p.opponent}` : ''}. I don't have a bye week listed.` };
  }
  const thisWeek = ctx.roster.filter((p) => p.onBye || ctx.byeOf?.(p) === week);
  // Upcoming byes for the players who start for you over the season (this week's lineup moves people around).
  const starts = (p) => (ctx.isSeasonStarter ? ctx.isSeasonStarter(p) : ctx.lineup.starters.some((s) => s.player?.id === p.id));
  const byWeek = new Map();
  ctx.roster.filter(starts).forEach((p) => {
    const bye = ctx.byeOf?.(p);
    if (bye && bye > week) {
      if (!byWeek.has(bye)) byWeek.set(bye, []);
      byWeek.get(bye).push(p);
    }
  });
  const weeks = [...byWeek.entries()].sort((a, b) => a[0] - b[0]);
  const worst = [...weeks].sort((a, b) => b[1].length - a[1].length)[0];
  const lead = thisWeek.length
    ? `On bye this week (week ${week}): ${thisWeek.map((p) => p.name).join(', ')}.`
    : `Nobody on your team is on bye this week (week ${week}).`;
  const ahead = worst ? ` Your biggest bye week ahead is week ${worst[0]} (${plural(worst[1].length, 'starter')} out).` : ' None of your starters has a bye later this season.';
  return {
    text: lead + ahead,
    items: weeks.length ? weeks.map(([w, list]) => ({ label: `Wk ${w}`, name: list.map((p) => p.name).join(', '), detail: list.map((p) => p.position).join(', ') })) : null,
    itemsTitle: weeks.length ? 'Starters with byes coming up:' : null,
    note: weeks.length ? 'Plan pickups a week ahead for the weeks with several starters out.' : null,
  };
}

/** Players worth buying (others' players our numbers like more than the market or their recent games) or selling. */
export function answerMarketList(text, ctx, kind) {
  const buy = kind === 'buy';
  const pool = buy
    ? ctx.allPlayers.filter((p) => SKILL.includes(p.position) && ctx.leagueIds?.has(p.id) && ctx.ownerOf?.(p) !== 'you')
    : ctx.roster.filter((p) => SKILL.includes(p.position));
  const rows = pool.map((p) => {
    const outlook = ctx.outlookOf(p);
    const trend = trendFor(p, ctx.scoring);
    const tag = ctx.valueOf ? ctx.valueOf(p)?.tag : null;
    const value = outlook?.value ?? 0;
    let why = null;
    if (buy) {
      if (tag?.key === 'buy') why = 'Our projections like them more than the trade market does.';
      else if (trend.direction === 'down' && value >= 10) why = `Slow lately (${trend.lastThree} a game over the last 3, ${trend.season} for the season), but the outlook is still ${value.toFixed(1)} a game.`;
      else if (outlook?.backWeek && isUnavailable(p.injury) && value >= 8) why = `Hurt now, back around week ${outlook.backWeek}; teams often sell injured players cheap.`;
    } else if (tag?.key === 'sell') why = 'The trade market values them more than our projections do.';
    else if (trend.direction === 'up' && value < trend.lastThree - 2) why = `Hot lately (${trend.lastThree} a game over the last 3) but our outlook is ${value.toFixed(1)} a game, so sell before it cools.`;
    else if ((outlook?.roleChange ?? 0) <= -1) why = 'A teammate coming back should take some of their work.';
    return { p, why, value };
  }).filter((r) => r.why).sort((a, b) => b.value - a.value).slice(0, 6);
  if (!rows.length) {
    return { text: buy ? 'No clear buy-low targets right now: nobody in your league is both cheap and still projected well.' : 'Nobody on your team stands out as a sell-high: none is clearly playing above their outlook.' };
  }
  return {
    text: buy ? 'Buy-low targets on other teams:' : 'Sell-high candidates on your team:',
    items: rows.map(({ p, why, value }) => ({ label: p.position, name: `${p.name}${buy && ctx.ownerOf?.(p) ? ` (${ctx.ownerOf(p)})` : ''}`, detail: why, value, valueLabel: 'a game ROS' })),
    note: buy ? 'Ask "what would it take to get X?" for trades that work.' : 'Ask "what can I get for X?" for trades that use them.',
    context: { players: rows.slice(0, 1).map((r) => r.p) },
  };
}

/** A to-do list for a better team: weakest position, the best trade and pickup, and lineup notes. */
export function answerPlan(ctx) {
  const sections = [];
  const lines = [];
  if (ctx.needs) {
    const row = ctx.needs().rows.find((r) => r.mine);
    if (row) {
      const cells = Object.entries(row.cells).sort((a, b) => b[1].rank - a[1].rank);
      lines.push(`Your best lineup ranks #${row.totalRank} of ${ctx.needs().rows.length}; your weakest spot is ${cells[0][0]} (#${cells[0][1].rank}) and your deepest is ${cells[cells.length - 1][0]}.`);
    }
  }
  const ideas = ctx.trades ? ctx.trades.find({ give: [], get: [], position: null }).slice(0, 2) : [];
  if (ideas.length) sections.push({ title: '1. Trade for an upgrade:', items: ideaItems(ideas) });
  const moves = ctx.waivers ? ctx.waivers().moves.slice(0, 2) : [];
  if (moves.length) {
    sections.push({
      title: `${sections.length + 1}. Waiver moves:`,
      items: moves.map((m) => ({ label: 'Add', name: `${m.add.player.name}, drop ${m.drop.player.name}`, detail: m.add.reason || null })),
    });
  }
  const hurt = ctx.lineup.starters.filter((s) => s.player && s.player.injury && !isUnavailable(s.player.injury));
  if (hurt.length) {
    sections.push({ title: `${sections.length + 1}. Watch before kickoff:`, items: hurt.map((s) => ({ label: s.slot.label, name: `${s.player.name} (${s.player.injury})`, detail: 'Have a backup ready.' })) });
  }
  if (!lines.length && !sections.length) return { text: 'Your lineup is already the best your roster can do. Ask "who should I pick up?" or "find me a trade" to look for upgrades.' };
  return {
    text: `${lines.join(' ')} Here's where the points are:`.trim(),
    sections,
    note: 'Start your best projected lineup every week ("who should I start?"), and check the waiver wire before each week.',
  };
}

/** Full stat line for one player: projection, season and recent scoring, usage, rank, injury. */
export function answerStats(found, ctx) {
  const p = ctx.scored(found[0].player);
  const trend = trendFor(p, ctx.scoring);
  const outlook = ctx.outlookOf(p);
  const season = ctx.seasonRankOf?.(p);
  const bits = [];
  bits.push(`${p.name} (${playerLine(p)}) projects ${p.points == null ? 'no points' : pts(p.points)} this week${p.posRank ? `, ${rankLabel(p.position, p.posRank)}` : ''}.`);
  if (trend.season != null) {
    bits.push(`${firstName(p)} averages ${trend.season} a game over ${plural(trend.gamesPlayed, 'game')}, ${trend.lastThree} over the last 3${trend.direction !== 'flat' ? ` (trending ${trend.direction})` : ''}.`);
  }
  const usage = usageLine(p);
  if (usage) bits.push(usage);
  if (season) bits.push(`${rankLabel(p.position, season)} in the season rankings.`);
  if (outlook) bits.push(`Rest of season we value ${firstName(p)} at about ${outlook.value.toFixed(1)} a game.`);
  const owner = ctx.ownerOf?.(p);
  if (owner && owner !== 'you') bits.push(`On ${owner}.`);
  else if (!owner && ctx.leagueIds && !ctx.leagueIds.has(p.id)) bits.push('Available in your league.');
  return {
    text: bits.join(' '),
    itemsTitle: trend.recent.length ? 'Recent games:' : null,
    items: [...trend.recent].reverse().slice(0, 5).map((g) => ({ label: `Wk ${g.week}`, name: g.opponent ? `vs ${g.opponent}` : 'Game', value: g.value })),
  };
}

/** Rest-of-season comparisons: value, schedule, workload, ceiling or floor. */
export function answerCompareLong(found, mode, ctx) {
  const players = found.map((f) => ctx.scored(f.player));
  const rows = players.map((p) => ({ p, outlook: ctx.outlookOf(p), trend: trendFor(p, ctx.scoring) }));
  const valueOf = (r) => r.outlook?.value ?? 0;
  if (mode === 'schedule') {
    const factor = (r) => r.outlook?.schedule?.factor ?? 1;
    const sorted = [...rows].sort((a, b) => factor(b) - factor(a));
    return {
      text: `${sorted[0].p.name} has the easier schedule ahead${sorted.length > 1 ? ` than ${sorted.slice(1).map((r) => r.p.name).join(' and ')}` : ''}.`,
      sections: sorted.map((r) => scheduleSection(r.p, ctx)).filter(Boolean),
    };
  }
  if (mode === 'usage') {
    const share = (r) => Math.max(r.p.usage?.recentTargetShare ?? r.p.usage?.targetShare ?? 0, r.p.usage?.recentCarryShare ?? r.p.usage?.carryShare ?? 0);
    const sorted = [...rows].sort((a, b) => share(b) - share(a));
    return {
      text: `${sorted[0].p.name} has the bigger workload lately.`,
      items: sorted.map((r) => ({ label: r.p.position, name: r.p.name, detail: usageLine(r.p) || 'No usage numbers yet.' })),
    };
  }
  if (mode === 'ceiling' || mode === 'floor') {
    const games = (r) => r.trend.recent.map((g) => g.value);
    const best = (r) => Math.max(0, ...games(r));
    const worst = (r) => (games(r).length ? Math.min(...games(r)) : 0);
    const sorted = [...rows].sort((a, b) => (mode === 'ceiling' ? best(b) - best(a) : worst(b) - worst(a)));
    return {
      text: mode === 'ceiling'
        ? `${sorted[0].p.name} has the higher ceiling: a best recent game of ${best(sorted[0]).toFixed(1)}.`
        : `${sorted[0].p.name} is the safer play: their worst recent game was ${worst(sorted[0]).toFixed(1)}.`,
      items: sorted.map((r) => ({ label: r.p.position, name: r.p.name, detail: `Projected ${pts(r.p.points)}; recent games ${games(r).map((g) => g.toFixed(1)).join(', ') || 'none'}` })),
      note: 'Ask "start X or Y?" for the full this-week call.',
    };
  }
  const sorted = [...rows].sort((a, b) => valueOf(b) - valueOf(a));
  const [top, next] = sorted;
  const gap = next ? valueOf(top) - valueOf(next) : 0;
  return {
    text: `${top.p.name} for the rest of the season: about ${valueOf(top).toFixed(1)} a game${next ? ` vs ${valueOf(next).toFixed(1)} for ${next.p.name}${gap < 1 ? ', close enough that the schedule and role should decide' : ''}` : ''}.`,
    items: sorted.map((r) => ({
      label: r.p.position,
      name: r.p.name,
      detail: [r.outlook?.schedule?.label && r.outlook.schedule.label !== 'average' ? `${r.outlook.schedule.label} schedule ahead` : null,
        r.outlook?.missed >= 0.5 ? `about ${Math.round(r.outlook.missed)} missed games expected` : null,
        r.trend.direction !== 'flat' ? `trending ${r.trend.direction}` : null].filter(Boolean).join(' · ') || null,
      value: valueOf(r),
      valueLabel: 'a game ROS',
    })),
    note: 'Ask "start X or Y?" for this week only.',
  };
}

/** "Is X available?", "should I pick up X?": who has them, and whether they beat your bench. */
export function answerAvailability(found, ctx) {
  const p = ctx.scored(found[0].player);
  const owner = ctx.ownerOf?.(p);
  if (owner === 'you') return { text: `${p.name} is already on your team.` };
  if (owner) return { text: `${p.name} is on ${owner}, so you'd have to trade for them. Ask "what would it take to get ${p.name}?"` };
  if (ctx.leagueIds && ctx.leagueIds.has(p.id)) return { text: `${p.name} is on another team in your league.` };
  const value = ctx.outlookOf(p)?.value ?? 0;
  // The waiver model's own pairing first, so this matches "who should I pick up?".
  const move = ctx.waivers ? ctx.waivers().moves.find((m) => m.add.player.id === p.id) : null;
  if (move) {
    return {
      text: `${p.name} is available. We value ${firstName(p)} at ${value.toFixed(1)} a game the rest of the way. Yes, pick ${firstName(p)} up and drop ${move.drop.player.name}.`,
      context: { players: [p] },
    };
  }
  const benchAtPos = ctx.lineup.bench.filter((b) => b.position === p.position)
    .map((b) => ({ b, v: ctx.outlookOf(b)?.value ?? 0 })).sort((a, b) => a.v - b.v);
  const worst = ctx.lineup.bench.map((b) => ({ b, v: ctx.outlookOf(b)?.value ?? 0 })).sort((a, b) => a.v - b.v)[0];
  const compareTo = benchAtPos[0] || worst;
  const verdict = !compareTo || value > compareTo.v + 0.5
    ? `Yes, pick ${firstName(p)} up${compareTo ? ` and drop ${compareTo.b.name} (${compareTo.v.toFixed(1)} a game)` : ''}.`
    : `Not worth it: ${compareTo.b.name} on your bench is worth about as much (${compareTo.v.toFixed(1)} a game).`;
  return {
    text: `${p.name} is available. We value ${firstName(p)} at ${value.toFixed(1)} a game the rest of the way. ${verdict}`,
    context: { players: [p] },
  };
}

/** The backup behind a player on their NFL team, and whether you can get them. */
export function answerHandcuff(found, ctx) {
  const p = ctx.scored(found[0].player);
  const mates = ctx.allPlayers.filter((x) => x.team === p.team && x.position === p.position && x.id !== p.id)
    .sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 3);
  if (!mates.length) return { text: `I don't see a backup ${p.position} on ${p.team}.` };
  const status = (x) => {
    const owner = ctx.ownerOf?.(x);
    if (owner === 'you') return 'yours';
    if (owner) return `on ${owner}`;
    return ctx.leagueIds && !ctx.leagueIds.has(x.id) ? 'available' : 'rostered';
  };
  return {
    text: `${mates[0].name} is ${p.name}'s handcuff on ${p.team} (${status(mates[0])}).`,
    items: mates.map((x) => ({ label: x.position, name: x.name, detail: `${status(x)} · projects ${pts(x.points)} this week`, value: ctx.outlookOf(x)?.value ?? null, valueLabel: 'a game ROS' })),
    note: `If ${firstName(p)} misses time, the handcuff picks up most of the work.`,
    context: { players: [mates[0]] },
  };
}

/** Best free agents at a position, even when none beats your bench. */
export const bestFreeAgents = (ctx, position, count = 4) => (ctx.freeAgents ? ctx.freeAgents() : [])
  .filter((p) => fitsPosition(p, position))
  .map((p) => ({ p, v: p.outlook?.value ?? 0 }))
  .sort((a, b) => b.v - a.v)
  .slice(0, count);

export const freeAgentItems = (rows) => rows.map(({ p, v }) => ({ label: p.position, name: p.name, detail: playerLine(p), value: v, valueLabel: 'a game ROS' }));

export { round1 };
