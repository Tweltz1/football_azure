// The Start/Sit chat bar: reads a typed question, finds the players and the kind of question in it,
// and answers with the same model the page uses (projections, the "?" cards, trade and waiver values).
// No AI service: questions it can't place get example questions back instead of a guess.
import { benchReason, compareVerdict, defenseMatchup, isUnavailable, teammatesOut, trendFor } from './startSitUtils.js';
import { explainAlone, explainBench, explainPair, explainStarter, usageFor } from './startSitWhy.js';
import { rankLabel } from './rankings.js';

export const EXAMPLE_QUESTIONS = [
  'Who should I start at flex?',
  'Start Nabers or Olave?',
  'Should I trade Bijan for Chase?',
  'Who should I pick up?',
  'What is Puka worth rest of season?',
  'Is Mixon a good matchup this week?',
  "How does Bijan's schedule look?",
];

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
// Words that are also someone's name but almost always mean the word in a question.
const NOT_NAMES = new Set([
  'start', 'sit', 'trade', 'for', 'or', 'vs', 'the', 'a', 'i', 'my', 'should', 'who', 'is', 'worth', 'drop', 'add', 'pick', 'up',
  'week', 'bye', 'rank', 'how', 'what', 'when', 'back', 'hurt', 'good', 'best', 'give', 'get', 'and', 'to', 'at', 'flex', 'out',
  'me', 'find', 'any', 'over', 'this', 'with', 'his', 'him', 'he', 'it', 'will', 'be', 'play', 'team', 'season', 'rest', 'value',
  'keep', 'sell', 'buy', 'hold', 'cut', 'matchup', 'defense', 'injury', 'status', 'win', 'great', 'than', 'more', 'points', 'pts',
  'next', 'last', 'game', 'games', 'free', 'agent', 'waiver', 'waivers', 'help', 'trending', 'healthy', 'playing', 'worth',
]);
// Short names people use for players, mapped to how the name reads once tidied up.
const NICKNAMES = {
  cmc: 'christian mccaffrey', jsn: 'jaxon smith njigba', arsb: 'amon ra st brown', ajb: 'aj brown', tmac: 'terry mclaurin',
  mhj: 'marvin harrison', btj: 'brian thomas', jt: 'jonathan taylor', kw3: 'kenneth walker', dk: 'dk metcalf', ceedee: 'ceedee lamb',
};
const POSITION_WORDS = {
  qb: 'QB', qbs: 'QB', quarterback: 'QB', quarterbacks: 'QB',
  rb: 'RB', rbs: 'RB', back: null, running: 'RB',
  wr: 'WR', wrs: 'WR', receiver: 'WR', receivers: 'WR', wideout: 'WR',
  te: 'TE', tes: 'TE', tight: 'TE',
  k: 'K', kicker: 'K', kickers: 'K',
  dst: 'DST', def: 'DST', defense: 'DST', defenses: 'DST', 'd/st': 'DST',
  flex: 'FLEX', superflex: 'SUPERFLEX',
};

export const tidy = (text) => String(text || '')
  .toLowerCase()
  .replace(/[’'`.]/g, '')
  .replace(/[^a-z0-9/]+/g, ' ')
  .trim();

const nameTokens = (name) => tidy(name).split(' ').filter((t) => t && !SUFFIXES.has(t));

/** The words of a question, with nicknames spelled out. */
const questionTokens = (text) => tidy(text).split(' ').filter(Boolean)
  .flatMap((t) => (NICKNAMES[t] ? NICKNAMES[t].split(' ') : [t]));

const sameWord = (word, name) => word === name || (word.length > 3 && word === `${name}s`);

/**
 * The players named in a question, in the order they come up. Full names win, then last names, then
 * first names nobody else shares. When a name fits several players (Brown, Williams), the one on your
 * team wins, then one on a team in your league, then the one projected highest; `alternatives` says who else it could be.
 */
export function findPlayers(text, players, { myIds = new Set(), leagueIds = null } = {}) {
  const words = questionTokens(text);
  const index = players.map((p) => {
    const tokens = nameTokens(p.name);
    return { p, tokens, first: tokens[0], last: tokens[tokens.length - 1] };
  });
  const firstCounts = new Map();
  index.forEach(({ first }) => firstCounts.set(first, (firstCounts.get(first) || 0) + 1));
  const relevant = (p) => myIds.has(p.id) || leagueIds?.has(p.id) || (p.points || 0) >= 1 || (p.gamesPlayed || 0) > 0;
  const preference = (p) => (myIds.has(p.id) ? 2000 : 0) + (leagueIds?.has(p.id) ? 1000 : 0) + (p.points || 0);
  const best = (list) => [...list].sort((a, b) => preference(b.p) - preference(a.p));

  const found = [];
  const used = new Set();
  for (let i = 0; i < words.length; i += 1) {
    // Full names (longest first), e.g. "amon ra st brown".
    let match = null;
    let length = 0;
    const full = index.filter(({ tokens }) => tokens.length > 1
      && tokens.every((t, k) => words[i + k] && sameWord(words[i + k], t)));
    if (full.length) {
      length = Math.max(...full.map((f) => f.tokens.length));
      match = best(full.filter((f) => f.tokens.length === length));
    } else if (!NOT_NAMES.has(words[i]) && words[i].length >= 3) {
      const byLast = index.filter(({ last, p }) => sameWord(words[i], last) && relevant(p));
      const byFirst = index.filter(({ first, p }) => sameWord(words[i], first) && firstCounts.get(first) === 1 && words[i].length >= 4 && relevant(p));
      // A team's defense by city, nickname or abbreviation ("bills", "buf defense").
      const byTeam = index.filter(({ p, tokens }) => p.position === 'DST'
        && (sameWord(words[i], tidy(p.team)) || tokens.some((t) => t.length >= 4 && sameWord(words[i], t)))
        && (tidy(p.team) !== words[i] || /^(d|def|dst|defense)$/.test(words[i + 1] || '')));
      const pick = byLast.length ? byLast : byFirst.length ? byFirst : byTeam;
      if (pick.length) {
        match = best(pick);
        length = 1;
      }
    }
    if (!match) continue;
    const [chosen, ...others] = match;
    if (!used.has(chosen.p.id)) {
      used.add(chosen.p.id);
      found.push({
        player: chosen.p,
        at: i,
        alternatives: others.filter((o) => (o.p.points || 0) >= 3 || myIds.has(o.p.id)).slice(0, 2).map((o) => o.p),
      });
    }
    i += length - 1;
  }
  return found;
}

/** The position a question asks about, if any ("flex", "RBs"). */
export const askedPosition = (text) => {
  const words = tidy(text).split(' ');
  for (let i = 0; i < words.length; i += 1) {
    if (words[i] === 'running' && words[i + 1]?.startsWith('back')) return 'RB';
    if (words[i] === 'tight' && words[i + 1]?.startsWith('end')) return 'TE';
    if (words[i] === 'wide' && words[i + 1]?.startsWith('receiver')) return 'WR';
    const position = POSITION_WORDS[words[i]];
    if (position) return position;
  }
  return null;
};

const pts = (n) => `${Number(n || 0).toFixed(1)} pts`;
const firstName = (p) => p.name.split(' ')[0];

/** What kind of question it is. `found` is findPlayers' result. */
export function questionType(text, found) {
  const t = tidy(text);
  if (!t || /^(help|examples?|what can (you|i)|how does this work)/.test(t)) return 'help';
  if (/accura|track record|report card|hit rate|how (good|right|often) (are|is|have)/.test(t)) return 'accuracy';
  if (/\bbye/.test(t)) return 'bye';
  if (/\btrades?\b|\bgive\b|\bdeal\b|\boffer/.test(t)) return 'trade';
  if (/pick ?up|waiver|free agent|\badd\b|\bgrab\b|stream|\bclaim/.test(t)) return 'pickup';
  if (/\bdrop\b|\bcut\b|\brelease\b/.test(t)) return 'drop';
  if (found.length >= 2) return 'compare';
  if (found.length === 0) return /start|sit|lineup|bench|play/.test(t) ? 'lineup' : 'unknown';
  if (/hurt|injur|\bback\b|return|status|healthy|\bout\b|questionable|doubtful|\bir\b/.test(t)) return 'injury';
  if (/schedule|upcoming|next (few |\d )?(games|weeks)|coming up/.test(t)) return 'schedule';
  if (/matchup|against|defen[cs]e|\bvs\b|opponent|playing/.test(t)) return 'matchup';
  if (/\brank/.test(t)) return 'rank';
  if (/worth|value|rest of|\bros\b|outlook|keep|hold|sell|buy|dynasty/.test(t)) return 'value';
  return 'player';
}

const helpAnswer = (lead) => ({
  text: lead || 'Ask me about your lineup, a player, a trade or the waiver wire. For example:',
  examples: EXAMPLE_QUESTIONS,
});

/** "Name (WR12 · BUF vs KC)" style line for one player. */
const playerLine = (p) => [
  p.posRank ? rankLabel(p.position, p.posRank) : p.position,
  p.team ? `${p.team}${p.opponent ? ` vs ${p.opponent}` : ''}` : null,
  p.onBye ? 'bye' : null,
  p.injury || null,
].filter(Boolean).join(' · ');

const ambiguityNote = (found) => {
  const unsure = found.filter((f) => f.alternatives.length);
  if (!unsure.length) return null;
  return unsure.map((f) => `I took ${f.player.name} (${f.player.team || f.player.position}); type the full name if you meant ${f.alternatives.map((a) => a.name).join(' or ')}.`).join(' ');
};

/** The lineup slot a position question is about: the first slot that takes it. */
const slotFor = (lineup, position) => {
  if (!position) return null;
  const fits = (s) => {
    const p = s.slot.positions;
    if (position === 'FLEX') return p.length > 1 && !p.includes('QB');
    if (position === 'SUPERFLEX') return p.length > 1 && p.includes('QB');
    return p.length === 1 && p[0] === position;
  };
  return lineup.starters.find(fits);
};

function answerLineup(text, ctx) {
  const { lineup } = ctx;
  if (!lineup.starters.length) return helpAnswer('Pick your team at the top of the page first, then ask again.');
  const position = askedPosition(text);
  const entry = slotFor(lineup, position);
  if (entry?.player) {
    const why = explainStarter(lineup, entry.slot.key, ctx.whyCtx);
    return { text: `Start ${entry.player.name} at ${entry.slot.label}.`, why };
  }
  return {
    text: `Your best lineup projects ${pts(lineup.total)}:`,
    items: lineup.starters.map((s) => ({
      label: s.slot.label,
      name: s.player ? s.player.name : 'Empty',
      detail: s.player ? playerLine(s.player) : 'Nobody on your roster can play here.',
      value: s.player ? s.player.points : null,
    })),
    note: 'Ask about any spot ("who should I start at flex?") for the reasons.',
  };
}

function answerCompare(found, ctx) {
  const players = found.map((f) => ctx.scored(f.player));
  const verdict = compareVerdict(players);
  if (!verdict) return { text: `I don't have projections for ${players.map((p) => p.name).join(' and ')} this week.` };
  const { winner, runnerUp } = verdict;
  if (benchReason(winner)) return { text: `Neither ${winner.name} nor ${runnerUp.name} is expected to play this week.` };
  const why = explainPair(winner, runnerUp, ctx.whyCtx);
  const others = players.length > 2 ? ` Of all ${players.length}, ${winner.name} projects the most.` : '';
  return { text: `${why.headline}.${others}`, why, note: ambiguityNote(found) };
}

/** Start/sit for one player: on your team it's their lineup spot, otherwise how they'd stack up against your starter. */
function answerPlayer(found, ctx) {
  const p = ctx.scored(found[0].player);
  const { lineup } = ctx;
  const starter = lineup.starters.find((s) => s.player?.id === p.id);
  if (starter) {
    return { text: `${p.name} is in your best lineup at ${starter.slot.label} (${pts(p.points)} projected).`, why: explainStarter(lineup, starter.slot.key, ctx.whyCtx), note: ambiguityNote(found) };
  }
  if (lineup.bench.some((b) => b.id === p.id)) {
    return { text: `${p.name} sits this week.`, why: explainBench(lineup, p.id, ctx.whyCtx), note: ambiguityNote(found) };
  }
  // Not on your team: compare with your weakest starter who plays the same position.
  const mine = lineup.starters
    .filter((s) => s.player && s.slot.positions.includes(p.position))
    .map((s) => s.player)
    .sort((a, b) => (a.points || 0) - (b.points || 0))[0];
  const line = `${p.name} (${playerLine(p)}) projects ${p.points == null ? 'nothing' : pts(p.points)} this week.`;
  if (!mine || p.points == null) {
    return { text: line, why: p.points != null ? explainAlone(p, p.position, ctx.whyCtx) : null, note: ambiguityNote(found) };
  }
  const [a, b] = (p.points || 0) >= (mine.points || 0) && !benchReason(p) ? [p, mine] : [mine, p];
  return {
    text: `${line} Not on your team; here's how that compares with your starter ${mine.name}.`,
    why: explainPair(a, b, ctx.whyCtx),
    note: ambiguityNote(found),
  };
}

function answerInjury(found, ctx) {
  const p = ctx.scored(found[0].player);
  const outlook = ctx.outlookOf(p);
  const lines = [];
  if (p.onBye) lines.push(`${p.name} is on bye this week.`);
  else if (p.injury) lines.push(`${p.name} is listed ${p.injury}${isUnavailable(p.injury) ? ', so they stay out of your lineup this week' : ''}.`);
  else lines.push(`${p.name} has no injury listed and is projected for ${pts(p.points)} this week.`);
  if (outlook?.backWeek) lines.push(`Sleeper's projections have them back in week ${outlook.backWeek}.`);
  if (outlook?.missed >= 0.5) lines.push(`Rest of season, the model counts about ${Math.round(outlook.missed)} missed game${Math.round(outlook.missed) === 1 ? '' : 's'} of ${Math.round(outlook.remaining)}.`);
  const mates = teammatesOut(p, ctx.allPlayers, ctx.scoring);
  return {
    text: lines.join(' '),
    items: mates.length ? mates.slice(0, 4).map((m) => ({
      label: m.position,
      name: m.name,
      detail: m.injury,
      value: m.seasonAvg,
      valueLabel: 'avg',
    })) : null,
    itemsTitle: mates.length ? `Injured ${p.team} teammates (their work can go to ${firstName(p)}):` : null,
    note: ambiguityNote(found),
  };
}

function answerMatchup(found, ctx) {
  const p = ctx.scored(found[0].player);
  if (p.onBye) return { text: `${p.name} is on bye this week.` };
  if (!p.opponent) return { text: `${p.name} has no game listed this week.` };
  const matchup = defenseMatchup(p, ctx.defense, ctx.scoring);
  if (!matchup) return { text: `${p.name} plays ${p.opponent} this week. There's no defense breakdown for ${p.position}s.` };
  const call = matchup.early ? 'too early to tell' : { good: 'a good matchup', average: 'an average matchup', tough: 'a tough matchup' }[matchup.verdict];
  const pointsRow = matchup.rows[0];
  return {
    text: `${p.name} vs ${p.opponent}: ${call}. ${p.opponent} has the ${matchup.rankLabel} (${pointsRow.value.toFixed(1)} a game; average is ${pointsRow.league.toFixed(1)}).`
      + (matchup.early ? ` After only ${matchup.games} game${matchup.games === 1 ? '' : 's'}, that says little yet.` : '')
      + ` ${firstName(p)} is projected for ${pts(p.points)}.`,
    items: matchup.notable.slice(0, 4).map((g) => ({ label: `Wk ${g.week}`, name: g.name, detail: g.team, value: g.value })),
    itemsTitle: matchup.notable.length ? `Top ${p.position} against ${p.opponent} in recent games:` : null,
    sections: [scheduleSection(p, ctx)].filter(Boolean),
    note: ambiguityNote(found),
  };
}

function answerSchedule(found, ctx) {
  const p = ctx.scored(found[0].player);
  const section = scheduleSection(p, ctx, 6);
  if (!section) return { text: `There are no upcoming games listed for ${p.name} yet.` };
  const games = section.items.map((i) => i.name.split(': ')[1]);
  const count = (word) => games.filter((g) => g === word).length;
  return {
    text: `${p.name}'s next ${games.length} games: ${count('easy')} easy, ${count('average')} average, ${count('tough')} tough${count('too early to tell') ? `, ${count('too early to tell')} too early to tell` : ''}.`,
    sections: [section],
    note: ambiguityNote(found),
  };
}

function answerRank(found, ctx) {
  const p = ctx.scored(found[0].player);
  const season = ctx.seasonRankOf?.(p) || null;
  const bits = [];
  if (p.posRank) bits.push(`${rankLabel(p.position, p.posRank)} this week (${pts(p.points)} projected)`);
  else bits.push(`not ranked this week${p.onBye ? ' (bye)' : ''}`);
  if (season) bits.push(`${rankLabel(p.position, season)} in the season rankings`);
  const trend = trendFor(p, ctx.scoring);
  if (trend.direction !== 'flat') bits.push(`trending ${trend.direction} (${trend.lastThree} a game over the last 3, ${trend.season} for the season)`);
  return { text: `${p.name} is ${bits.join(', ')}.`, note: ambiguityNote(found) };
}

function answerValue(found, ctx) {
  const p = ctx.scored(found[0].player);
  const value = ctx.valueOf(p);
  const outlook = ctx.outlookOf(p);
  if (!outlook) return { text: `I don't have enough on ${p.name} to put a value on yet.` };
  const tag = value?.tag ? ` The market and our projections disagree: ${value.tag.label.toLowerCase()}.` : '';
  return {
    text: `${p.name} is worth about ${outlook.perGame.toFixed(1)} pts a game when playing, ${outlook.value.toFixed(1)} a game across the ${Math.round(outlook.remaining)} games left once missed time is counted.`
      + (value?.label ? ` Trade value: ${value.label}.` : '') + tag,
    items: reasonNotes(outlook).slice(0, 5).map((note) => ({ name: note })),
    itemsTitle: reasonNotes(outlook).length ? 'What goes into it:' : null,
    sections: [scheduleSection(p, ctx)].filter(Boolean),
    note: ambiguityNote(found),
  };
}

function answerBye(text, found, ctx) {
  const week = ctx.week;
  if (found.length) {
    const p = ctx.scored(found[0].player);
    return { text: p.onBye ? `${p.name} is on bye in week ${week}.` : `${p.name} plays this week${p.opponent ? ` (vs ${p.opponent})` : ''}.` };
  }
  const mine = ctx.roster.filter((p) => p.onBye);
  if (!mine.length) return { text: `Nobody on your team is on bye in week ${week}.` };
  return {
    text: `On bye in week ${week}:`,
    items: mine.map((p) => ({ label: p.position, name: p.name, detail: p.team })),
  };
}

function answerTrade(text, found, ctx) {
  if (!ctx.trades) return { text: 'Trades need a league: pick a Sleeper or Hood League team at the top of the page, then ask again.' };
  const words = questionTokens(text);
  const mine = new Set(ctx.roster.map((p) => p.id));
  // Each player goes to the side named by the closest word before them: "give X", "trade X" or "for Y", "get Y".
  // With no such word, players on your team are what you give.
  const sideOf = (f) => {
    for (let i = f.at - 1; i >= 0; i -= 1) {
      if (/^(for|get|getting|receive|receiving)$/.test(words[i])) return 'get';
      if (/^(give|giving|trade|trading|send|sending)$/.test(words[i])) return 'give';
    }
    return mine.has(f.player.id) ? 'give' : 'get';
  };
  let give = [];
  let get = [];
  found.forEach((f) => (sideOf(f) === 'give' ? give : get).push(f.player));
  // People sometimes name the sides the other way round ("trade for X, give Y").
  if (give.length && get.length && give.every((p) => !mine.has(p.id)) && get.every((p) => mine.has(p.id))) [give, get] = [get, give];

  if (give.length && get.length) {
    const rated = ctx.trades.rate(give, get);
    if (rated.error) return { text: rated.error, note: ambiguityNote(found) };
    return { text: rated.text, why: rated.why, note: [rated.note, ambiguityNote(found)].filter(Boolean).join(' ') || null };
  }
  const position = askedPosition(text);
  if (give.length && !get.length && !position) return answerSellOne(give[0], found, ctx);
  if (!found.length && !position && /\baway\b|\bsell\b|\bshop|who (should|to|do) i trade$|who should i trade\b(?! for)/.test(tidy(text))) return answerSellList(ctx);
  const ideas = ctx.trades.find({ give, get, position });
  const target = get.length ? `for ${get.map((p) => p.name).join(' and ')}` : give.length ? `using ${give.map((p) => p.name).join(' and ')}` : position ? `for a ${position}` : '';
  if (!ideas.length) {
    return {
      text: `I couldn't find a trade ${target} that helps your lineup and is close enough in value for them to take.`.replace('  ', ' '),
      note: 'Set one up yourself in the Trade check below to see how it rates.',
    };
  }
  return {
    text: `Trades ${target} that help your lineup and are close in value:`.replace('  ', ' '),
    items: ideaItems(ideas),
    note: 'Ask "should I trade X for Y?" about any of these for the full breakdown.',
  };
}

const positionsOf = (list) => [...new Set(list.map((p) => p.position))].join('/');

/** One trade idea as a list row, with the reason it helps: which spot gets better and what it costs. */
const ideaItems = (ideas) => ideas.map((idea) => {
  const gain = `${idea.myChange >= 0 ? '+' : ''}${idea.myChange.toFixed(1)}`;
  const why = idea.give.length > idea.get.length
    ? `two-for-one: you turn depth into a better ${positionsOf(idea.get)}`
    : idea.get.length > idea.give.length
      ? `you add depth at ${positionsOf(idea.get)}`
      : positionsOf(idea.give) === positionsOf(idea.get)
        ? `an upgrade at ${positionsOf(idea.get)}`
        : `${positionsOf(idea.get)} is worth more to your lineup than ${positionsOf(idea.give)}`;
  const theirs = idea.theirChange >= 0 ? `, and ${idea.partnerName} gets better too, so they may say yes` : '';
  return {
    label: idea.partnerName,
    name: `Give ${idea.give.map((p) => p.name).join(' + ')}, get ${idea.get.map((p) => p.name).join(' + ')}`,
    detail: `Your lineup ${gain} pts a week. ${why[0].toUpperCase()}${why.slice(1)}${theirs}.`,
  };
});

/** A starter over the rest of the season (not just this week, when injuries and byes move people around). */
const startsForYou = (p, ctx) => (ctx.isSeasonStarter ? ctx.isSeasonStarter(p) : ctx.lineup.starters.some((s) => s.player?.id === p.id));

const pct = (x) => `${Math.round(x * 100)}%`;

const SCHEDULE_WORD = { good: 'easy', average: 'average', tough: 'tough' };

/**
 * The player's next few games: how each defense has done against the position, and the other teams'
 * top player at it in recent games against that defense. Byes and games they're not expected to play are skipped.
 */
export const scheduleSection = (p, ctx, games = 4) => {
  const upcoming = (p.upcoming || []).filter((g) => g.opponent).slice(0, games);
  const items = upcoming.map((g) => {
    const matchup = defenseMatchup({ ...p, opponent: g.opponent }, ctx.defense, ctx.scoring);
    if (!matchup) return { label: `Wk ${g.week}`, name: `vs ${g.opponent}` };
    const allowed = matchup.rows[0];
    const recent = matchup.notable.slice(0, 3).map((n) => `${n.name} ${n.value.toFixed(1)}`).join(', ');
    return {
      label: `Wk ${g.week}`,
      name: `vs ${g.opponent}: ${matchup.early ? 'too early to tell' : SCHEDULE_WORD[matchup.verdict]}`,
      detail: `${g.opponent} has the ${matchup.rankLabel} (${allowed.value.toFixed(1)} a game, average ${allowed.league.toFixed(1)}).${recent ? ` Top ${p.position}s against them lately: ${recent}.` : ''}`,
    };
  });
  if (!items.length) return null;
  const outlook = ctx.outlookOf?.(p);
  const label = outlook?.schedule?.label;
  const summary = label && label !== 'average' ? ` Overall ${label === 'easy' ? 'an easy' : 'a tough'} stretch.` : '';
  return { title: `${firstName(p)}'s next games:${summary}`, items };
};

/** Share of the team's carries or targets, this season and lately, as a sentence. */
const usageLine = (p) => {
  const u = usageFor(p);
  const snaps = p?.usage?.snapShare;
  const recentSnaps = p?.usage?.recentSnapShare;
  const parts = [];
  if (snaps != null) {
    const lately = recentSnaps != null && Math.abs(recentSnaps - snaps) >= 0.05 ? ` (${pct(recentSnaps)} over the last ${p.usage.recentGames || 3} games)` : '';
    parts.push(`Plays ${pct(snaps)} of ${p.team}'s offensive snaps${lately}.`);
  }
  if (u) {
    const trend = u.change >= 0.04 ? ', and rising' : u.change <= -0.04 ? ', and falling' : '';
    parts.push(`Gets ${pct(u.season)} of ${p.team}'s ${u.kind} this season, ${pct(u.recent)} over the last ${u.games || 3} games${trend}.`);
  }
  return parts.length ? parts.join(' ') : null;
};

/** Outlook notes that explain the value (teammates returning or out, workload, injuries, schedule), not Sleeper's own number. */
const reasonNotes = (outlook) => (outlook?.notes || []).filter((note) => !note.startsWith('Sleeper projects'));

/** "Why should I trade X?": what X does for your lineup, how the market sees X, and the trades that use X. */
function answerSellOne(player, found, ctx) {
  if (!ctx.roster.some((p) => p.id === player.id)) {
    return { text: `${player.name} isn't on your team. Ask "should I trade X for ${player.name}?" to rate a deal for them.`, note: ambiguityNote(found) };
  }
  const p = ctx.scored(player);
  const starter = startsForYou(p, ctx);
  const tag = ctx.valueOf(p)?.tag || null;
  const outlook = ctx.outlookOf(p);
  const reasons = [];
  reasons.push(starter
    ? `${p.name} is one of your starters, so trading ${firstName(p)} only helps if you get a better starter back or fix a weaker spot.`
    : `${p.name} is mostly a bench player for you, so the value sitting there isn't helping your lineup much.`);
  if (outlook) reasons.push(`We value ${firstName(p)} at about ${outlook.value.toFixed(1)} pts a game for the rest of the season.`);
  if (tag?.key === 'sell') reasons.push('The trade market values them more than our projections do, which makes this a good time to sell.');
  if (tag?.key === 'buy') reasons.push('Our projections like them more than the trade market does, so a trade now would be selling low.');
  const losingWork = (outlook?.roleChange ?? 0) <= -1;
  if (losingWork) reasons.push(`A teammate's return should cut into ${firstName(p)}'s work, about ${Math.abs(outlook.roleChange).toFixed(1)} fewer pts a game.`);
  const usage = usageLine(p);
  if (usage) reasons.push(usage);
  const verdict = tag?.key === 'buy' && !losingWork
    ? `I'd keep ${p.name}.`
    : tag?.key === 'sell' || !starter || losingWork
      ? `${p.name} is worth shopping.`
      : `Only trade ${p.name} for a clear upgrade.`;
  const ideas = ctx.trades.find({ give: [p], get: [], position: null }).slice(0, 3);
  const notes = reasonNotes(outlook).slice(0, 4);
  return {
    text: `${verdict} ${reasons.join(' ')}`,
    itemsTitle: notes.length ? `What's behind ${firstName(p)}'s value:` : null,
    items: notes.map((note) => ({ name: note })),
    sections: [
      scheduleSection(p, ctx),
      ideas.length ? { title: `Trades using ${firstName(p)} that help your lineup and are close in value:`, items: ideaItems(ideas) } : null,
    ].filter(Boolean),
    note: ideas.length
      ? 'Ask "should I trade X for Y?" about any of these for the full breakdown.'
      : `I didn't find a trade using ${firstName(p)} that helps your lineup and is close enough in value for the other team to take.`,
  };
}

/** "Who should I trade away?": players the market rates above our numbers, then valuable players who don't start for you. */
function answerSellList(ctx) {
  const rows = ctx.roster
    .filter((p) => ['QB', 'RB', 'WR', 'TE'].includes(p.position))
    .map((p) => ({ p, starter: startsForYou(p, ctx), tag: ctx.valueOf(p)?.tag || null, value: ctx.outlookOf(p)?.value ?? 0 }));
  rows.forEach((r) => {
    const outlook = ctx.outlookOf(r.p);
    r.losing = (outlook?.roleChange ?? 0) <= -1 ? reasonNotes(outlook).find((note) => / is (back|returning|expected)/.test(note)) || 'A teammate coming back should take some of their work.' : null;
  });
  const losing = rows.filter((r) => r.losing && r.tag?.key !== 'buy').sort((a, b) => b.value - a.value);
  const sellHigh = rows.filter((r) => r.tag?.key === 'sell' && !r.losing).sort((a, b) => b.value - a.value);
  const bench = rows.filter((r) => !r.starter && !r.losing && r.tag?.key !== 'sell' && r.tag?.key !== 'buy' && r.value >= 5).sort((a, b) => b.value - a.value);
  const picks = [
    ...losing.map((r) => ({ ...r, why: `Losing work: ${r.losing}` })),
    ...sellHigh.map((r) => ({ ...r, why: 'Sell high: the trade market values them more than our projections do.' })),
    ...bench.map((r) => ({ ...r, why: `Doesn't start for you, so the value is sitting on your bench.${usageLine(r.p) ? ` ${usageLine(r.p)}` : ''}` })),
  ].slice(0, 4);
  if (!picks.length) {
    return { text: "Nobody stands out to trade away: your starters are worth keeping and your bench has little trade value. Ask \"find me a trade for a WR\" (or any position) to look for upgrades." };
  }
  return {
    text: 'Players worth shopping:',
    items: picks.map((r) => ({
      label: r.p.position,
      name: r.p.name,
      detail: r.why,
      value: r.value,
      valueLabel: 'pts/game',
    })),
    note: 'Ask "why should I trade X?" about any of them for the reasons and trades that use them.',
  };
}

function answerPickup(text, ctx) {
  if (!ctx.waivers) return { text: 'Pickups need a league so I know who is free: pick a Sleeper or Hood League team at the top of the page.' };
  const position = askedPosition(text);
  const { moves } = ctx.waivers();
  const list = moves.filter((m) => !position || m.add.player.position === position || (position === 'FLEX' && ['RB', 'WR', 'TE'].includes(m.add.player.position)));
  if (!list.length) {
    return { text: `No free agent${position ? ` at ${position}` : ''} is clearly worth more than anyone on your bench right now.` };
  }
  return {
    text: `Best pickups${position ? ` at ${position}` : ''}, judged on rest-of-season value:`,
    items: list.slice(0, 4).map((m) => ({
      label: 'Add',
      name: `${m.add.player.name} (${m.add.player.position} · ${m.add.player.team || 'FA'}), drop ${m.drop.player.name}`,
      detail: m.add.reason || null,
      value: m.gain ?? null,
      valueLabel: 'gain',
    })),
    note: ctx.waiverNote || null,
  };
}

function answerDrop(found, ctx) {
  if (!ctx.waivers) return { text: 'Pick a Sleeper or Hood League team at the top of the page first, so I can compare your bench with who is free.' };
  const { drops, holds } = ctx.waivers();
  if (found.length) {
    const p = found[0].player;
    const hold = holds.find((h) => h.player.id === p.id);
    if (hold) return { text: `Hold ${p.name}. ${hold.reason}` };
    const rank = drops.findIndex((d) => d.player.id === p.id);
    if (rank === 0) return { text: `${p.name} is the first player I'd drop from your roster.` };
    if (rank > 0) return { text: `${p.name} is drop candidate number ${rank + 1}. ${drops[0].player.name} would go first.` };
    const starter = ctx.lineup.starters.some((s) => s.player?.id === p.id);
    return { text: starter ? `Keep ${p.name}, who is in your starting lineup.` : `Keep ${p.name}, who is worth more than your other bench players.` };
  }
  if (!drops.length) return { text: 'Everyone on your roster is either starting or worth holding.' };
  return {
    text: 'If you need a roster spot, drop in this order:',
    items: drops.slice(0, 4).map((d) => ({ label: d.player.position, name: d.player.name, detail: d.reason || null, value: d.info.perGame, valueLabel: 'pts/game' })),
  };
}

/**
 * Answers a question. Returns { text, why?, items?, itemsTitle?, note?, examples? }: `why` is a "?"-card
 * object, `items` a short list. ctx carries the page's model: { allPlayers, roster, lineup, whyCtx, scoring,
 * week, defense, myIds, leagueIds, scored(p), outlookOf(p), valueOf(p), seasonRankOf(p), trades, waivers,
 * waiverNote }, where trades and waivers are null without a league.
 */
export function answerQuestion(text, ctx) {
  const found = findPlayers(text, ctx.allPlayers, { myIds: ctx.myIds, leagueIds: ctx.leagueIds });
  const type = questionType(text, found);
  switch (type) {
    case 'help': return helpAnswer();
    case 'accuracy': return { text: 'Tap "Check past weeks" in the "How accurate are we?" card at the bottom of this page to see how our projections and calls did this season.', scrollTo: 'startsit-accuracy' };
    case 'bye': return answerBye(text, found, ctx);
    case 'trade': return answerTrade(text, found, ctx);
    case 'pickup': return answerPickup(text, ctx);
    case 'drop': return answerDrop(found, ctx);
    case 'compare': return answerCompare(found, ctx);
    case 'lineup': return answerLineup(text, ctx);
    case 'injury': return answerInjury(found, ctx);
    case 'matchup': return answerMatchup(found, ctx);
    case 'schedule': return answerSchedule(found, ctx);
    case 'rank': return answerRank(found, ctx);
    case 'value': return answerValue(found, ctx);
    case 'player': return answerPlayer(found, ctx);
    default: return helpAnswer("I didn't find a player or a question I know in that. Try one of these:");
  }
}
