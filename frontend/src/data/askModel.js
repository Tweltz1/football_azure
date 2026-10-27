// The Start/Sit chat bar: reads a typed question, finds the players and the kind of question in it,
// and answers with the same model the page uses (projections, the "?" cards, trade and waiver values).
// No AI service: questions it can't place get example questions back instead of a guess.
import { benchReason, compareVerdict, defenseMatchup, isUnavailable, teammatesOut, trendFor } from './startSitUtils.js';
import { explainAlone, explainBench, explainPair, explainStarter, usageFor } from './startSitWhy.js';
import { rankLabel } from './rankings.js';
import { percent, recordText, trajectoryText } from './leagueOdds.js';
import {
  answerAbout, answerAvailability, answerBench, answerBestPlayers, answerByes, answerCompareLong, answerDefenses, answerHandcuff,
  answerMarketList, answerMatchupList, answerNeeds, answerNews, answerPlan, answerRankings, answerRules, answerStats, answerVegas, answerWeather,
  answerTeamInjuries, answerTrending, answerWeakestStarter, bestFreeAgents, freeAgentItems, opinionLead,
} from './askTeam.js';

export const EXAMPLE_QUESTIONS = [
  'Who should I start at flex?',
  'Start Nabers or Olave?',
  'Should I trade Bijan for Chase?',
  'Who should I pick up?',
  'What is Puka worth rest of season?',
  'Is Mixon a good matchup this week?',
  "How does Bijan's schedule look?",
  'What are my playoff odds?',
];

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
// Words that are also someone's name but almost always mean the word in a question.
const NOT_NAMES = new Set([
  'start', 'sit', 'trade', 'for', 'or', 'vs', 'the', 'a', 'i', 'my', 'should', 'who', 'is', 'worth', 'drop', 'add', 'pick', 'up',
  'week', 'bye', 'rank', 'how', 'what', 'when', 'back', 'hurt', 'good', 'best', 'give', 'get', 'and', 'to', 'at', 'flex', 'out',
  'me', 'find', 'any', 'over', 'this', 'with', 'his', 'him', 'he', 'it', 'will', 'be', 'play', 'team', 'season', 'rest', 'value',
  'keep', 'sell', 'buy', 'hold', 'cut', 'matchup', 'defense', 'injury', 'status', 'win', 'great', 'than', 'more', 'points', 'pts',
  'next', 'last', 'game', 'games', 'free', 'agent', 'waiver', 'waivers', 'help', 'trending', 'healthy', 'playing', 'worth',
  'tips', 'tip', 'room', 'spot', 'share', 'record', 'joke',
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

const sameWord = (word, name) => word === name || (word.length >= 3 && word === `${name}s`);

/** Edit distance where swapping two neighbouring letters counts as one typo. */
export const typoDistance = (a, b) => {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
};
/** How many typos a word of this length can carry and still be read as the word meant. */
const typosAllowed = (word) => (word.length >= 9 ? 2 : word.length >= 5 ? 1 : 0);

// Words the chat reads questions by, so a typo in one ("lienup", "sandings") still lands.
const VOCAB = [
  'start', 'starting', 'starter', 'lineup', 'bench', 'playing', 'matchup', 'matchups', 'schedule', 'standings', 'playoffs',
  'playoff', 'championship', 'injured', 'injury', 'injuries', 'healthy', 'waiver', 'waivers', 'pickup', 'pickups',
  'available', 'agent', 'agents', 'trade', 'trades', 'trading', 'worth', 'value', 'rankings', 'ranking', 'ranked',
  'projection', 'projected', 'points', 'underperforming', 'overperforming', 'struggling', 'targets', 'carries',
  'touches', 'snaps', 'defense', 'defenses', 'handcuff', 'backup', 'season', 'should', 'would', 'could', 'better',
  'upgrade', 'position', 'weakest', 'strongest', 'league', 'odds', 'chances', 'opponent', 'questionable', 'doubtful',
  'return', 'returning', 'stats', 'average', 'trending', 'sleeper', 'sleepers', 'stream', 'streaming', 'kicker',
  'kickers', 'quarterback', 'quarterbacks', 'receiver', 'receivers', 'running', 'tight', 'superflex', 'release',
  'offer', 'offered', 'accept', 'power', 'toilet', 'title', 'winning', 'improve', 'advice', 'outlook', 'compare',
  'ceiling', 'upside', 'floor', 'safer', 'replace', 'instead', 'weekly', 'record', 'project', 'happened', 'think',
  'missing', 'thin', 'weak', 'depth', 'needs', 'thank', 'status', 'active', 'valuable', 'droppable', 'contender',
  'changes', 'replacement', 'scoring', 'reception', 'settings', 'deadline', 'benched', 'demoted', 'timeshare',
  'facing', 'worst', 'weakness', 'weaknesses', 'latest', 'regular', 'weather', 'raining', 'indoors', 'outdoors', 'favored',
  'betting', 'headlines', 'forecast', 'spread', 'underdog', 'shootout',
];
const VOCAB_SET = new Set(VOCAB);
// Everyday words that are never a typo of a player's name.
const COMMON = new Set([
  ...VOCAB, 'about', 'there', 'their', 'theyre', 'would', 'could', 'which', 'these', 'those', 'other', 'again', 'still',
  'after', 'before', 'maybe', 'really', 'going', 'never', 'every', 'right', 'where', 'while', 'games', 'someone',
  'anyone', 'player', 'players', 'guys', 'thing', 'things', 'today', 'tonight', 'sunday', 'monday', 'thursday',
  'saturday', 'tomorrow', 'please', 'thanks', 'great', 'first', 'second', 'third', 'least', 'their', 'buying',
  'selling', 'getting', 'giving', 'holding', 'keeping', 'dropping', 'adding', 'least', 'worst', 'lately', 'recent',
  'should', 'shoud', 'whats', 'whos', 'hows', 'something', 'anything', 'everyone', 'everything', 'enough', 'deeper',
  'thinking', 'help', 'start', 'sitting', 'benched', 'week', 'weeks', 'score', 'scored', 'scoring', 'total', 'money',
  'share', 'shares', 'change', 'changes', 'moves', 'record', 'spots', 'room', 'spot', 'adding', 'teams', 'starters',
  'fills', 'filling', 'takes', 'taking', 'point', 'lines',
]);
// Two-letter words that are never a first name like "AJ" or "Bo".
const COMMON_SHORT = new Set(['is', 'do', 'at', 'my', 'or', 'vs', 'up', 'of', 'on', 'to', 'in', 'it', 'if', 'me', 'he', 'we', 'us', 'so', 'no', 'an', 'as', 'be', 'by', 'go', 'hi', 'ok', 'am', 'yo', 'ya', 'ur', 'im', 'qb', 'rb', 'wr', 'te', 'ty', 'oh', 'pk', 'id']);
const FILLERS_START = new Set(['yo', 'hey', 'bro', 'ok', 'okay', 'so', 'um', 'uh', 'quick', 'q', 'hi', 'hello', 'sup', 'lol', 'ayo', 'dude', 'man', 'yall', 'well', 'alright', 'aight']);
const FILLERS_END = new Set(['lol', 'lmao', 'pls', 'plz', 'please', 'bro', 'thx', 'dude', 'man']);
const SLANG = {
  u: 'you', ur: 'your', r: 'are', shud: 'should', shld: 'should', shoud: 'should', sould: 'should', wk: 'week', wks: 'weeks',
  ros: 'rest of season', rn: 'right now', pts: 'points', tmrw: 'tomorrow', gonna: 'going to', wanna: 'want to',
  whos: 'who is', whats: 'what is', hows: 'how is', wheres: 'where is', v: 'vs', w: 'with', b4: 'before', cuz: 'because',
  bc: 'because', pl: 'please', thru: 'through', abt: 'about', dif: 'difference', diff: 'difference', hes: 'he is',
  plyr: 'player', 'w/': 'with', 'w/o': 'without', def: 'defense', dst: 'defense', d: 'defense', wr1: 'wr1', inj: 'injured', ir: 'ir',
  stll: 'still', stil: 'still', bech: 'bench', bnch: 'bench', tght: 'tight', tite: 'tight',
};

const protectedCache = new WeakMap();
/** Words that are part of a player's or league team's name, which are never "corrected". */
const protectedWords = (players = [], teamNames = []) => {
  let words = protectedCache.get(players);
  if (!words) {
    words = new Set(players.flatMap((p) => tidy(p.name).split(' ')));
    protectedCache.set(players, words);
  }
  if (!teamNames.length) return words;
  return new Set([...words, ...teamNames.flatMap((n) => tidy(n).split(' '))]);
};

/**
 * A question the way it was meant: lower case, slang spelled out ("u", "shud", "ros", "rn"), typos in
 * the chat's own words fixed ("lienup", "plyaing") and greetings and sign-offs ("yo", "lol") dropped.
 * Player and team names are left for findPlayers, which reads their typos itself.
 */
export const cleanQuestion = (text, { players = [], teamNames = [] } = {}) => {
  const keep = protectedWords(players, teamNames);
  let words = tidy(text).split(' ').filter(Boolean);
  while (words.length > 1 && FILLERS_START.has(words[0]) && !keep.has(words[0])) words = words.slice(1);
  while (words.length > 1 && FILLERS_END.has(words[words.length - 1])) words = words.slice(0, -1);
  if (words.length > 2 && words[words.length - 1] === 'help') words = words.slice(0, -1);
  return words.flatMap((word) => {
    if (keep.has(word) && !SLANG[word]) return [word];
    if (SLANG[word] && !(keep.has(word) && word.length > 2)) return SLANG[word].split(' ');
    if (VOCAB_SET.has(word) || word.length < 5 || COMMON.has(word)) return [word];
    const allowed = typosAllowed(word);
    let best = null;
    let bestDistance = allowed + 1;
    let ties = 0;
    VOCAB.forEach((v) => {
      const dist = typoDistance(word, v);
      if (dist < bestDistance) { best = v; bestDistance = dist; ties = 0; } else if (dist === bestDistance && v !== best) ties += 1;
    });
    // "ktitle" is Kittle, not "title": a word at least as close to a name is left for findPlayers.
    const nameAsClose = best && [...keep].some((name) => name.length >= 4 && Math.abs(name.length - word.length) <= bestDistance
      && typoDistance(word, name) <= bestDistance);
    return [best && !ties && !keep.has(word) && !nameAsClose ? best : word];
  }).join(' ');
};

/**
 * The players named in a question, in the order they come up. Full names win, then last names, then
 * first names nobody else shares. When a name fits several players (Brown, Williams), one from the last
 * question (`prefer`) wins, then the one on your team, then one on a team in your league, then the one
 * projected highest; `alternatives` says who else it could be.
 */
export function findPlayers(text, players, { myIds = new Set(), leagueIds = null, prefer = null } = {}) {
  const words = questionTokens(text);
  const index = players.map((p) => {
    const tokens = nameTokens(p.name);
    return { p, tokens, first: tokens[0], last: tokens[tokens.length - 1] };
  });
  const firstCounts = new Map();
  index.forEach(({ first }) => firstCounts.set(first, (firstCounts.get(first) || 0) + 1));
  const relevant = (p) => myIds.has(p.id) || leagueIds?.has(p.id) || (p.points || 0) >= 1 || (p.gamesPlayed || 0) > 0;
  const preference = (p) => (prefer?.has(p.id) ? 3000 : 0) + (myIds.has(p.id) ? 2000 : 0) + (leagueIds?.has(p.id) ? 1000 : 0) + (p.points || 0);
  const best = (list) => [...list].sort((a, b) => preference(b.p) - preference(a.p));

  const found = [];
  const used = new Set();
  for (let i = 0; i < words.length; i += 1) {
    // Full names (longest first), e.g. "amon ra st brown".
    let match = null;
    let length = 0;
    let full = index.filter(({ tokens }) => tokens.length > 1
      && tokens.every((t, k) => words[i + k] && sameWord(words[i + k], t)));
    // A two-word surname alone ("smith njigba", "st brown").
    if (!full.length) {
      const here = words.slice(i);
      full = index.flatMap((entry) => {
        for (let k = entry.tokens.length - 1; k >= 2; k -= 1) {
          const tail = entry.tokens.slice(-k);
          if (tail.every((t, j) => here[j] && sameWord(here[j], t))) return [{ ...entry, tokens: tail }];
        }
        return [];
      });
    }
    // First name and a misspelled last name ("tyler algleier").
    // First name and a misspelled last name ("tyler algleier", "kyle pits"), or the other way round ("jaeson williams").
    const looseTypos = (word) => Math.max(1, typosAllowed(word));
    if (!full.length && words[i + 1] && words[i + 1].length >= 4 && !COMMON.has(words[i + 1])) {
      full = index.filter(({ tokens, first, last, p }) => tokens.length === 2 && first === words[i] && relevant(p)
        && last.length >= 5 && typoDistance(words[i + 1], last) <= looseTypos(words[i + 1]));
    }
    if (!full.length && words[i + 1] && words[i].length >= 4 && !COMMON.has(words[i])) {
      full = index.filter(({ tokens, first, last, p }) => tokens.length === 2 && last === words[i + 1] && relevant(p)
        && first.length >= 4 && first[0] === words[i][0] && typoDistance(words[i], first) <= looseTypos(words[i]));
    }
    if (full.length) {
      length = Math.max(...full.map((f) => f.tokens.length));
      match = best(full.filter((f) => f.tokens.length === length));
    } else if (!NOT_NAMES.has(words[i]) && (words[i].length >= 3 || (words[i].length === 2 && !COMMON_SHORT.has(words[i])))) {
      const byLast = index.filter(({ last, p }) => sameWord(words[i], last) && relevant(p));
      // First names: one nobody else has, or a shared one ("Jalen") when the player is yours or in your league.
      const byFirst = index.filter(({ first, p }) => sameWord(words[i], first) && relevant(p)
        && (firstCounts.get(first) === 1 || myIds.has(p.id) || leagueIds?.has(p.id)));
      // A team's defense by city, nickname or abbreviation ("bills", "buf defense").
      const byTeam = index.filter(({ p, tokens }) => p.position === 'DST'
        && (sameWord(words[i], tidy(p.team)) || tokens.some((t) => t.length >= 4 && sameWord(words[i], t)))
        && (tidy(p.team) !== words[i] || /^(d|def|dst|defense)$/.test(words[i + 1] || '')));
      let pick = byLast.length ? byLast : byFirst.length ? byFirst : byTeam;
      // A misspelled name ("gedert", "lawrnece"): the closest last name, or a first name, one typo away
      // (two for long names), only for words that aren't everyday words.
      if (!pick.length && words[i].length >= 5 && !COMMON.has(words[i])) {
        const allowed = typosAllowed(words[i]);
        const near = index
          .filter(({ p }) => relevant(p) && ((p.points || 0) >= 3 || myIds.has(p.id) || leagueIds?.has(p.id)))
          .map((entry) => ({ entry, dist: Math.min(typoDistance(words[i], entry.last), entry.first.length >= 5 ? typoDistance(words[i], entry.first) : 9) }))
          .filter((x) => x.dist <= allowed);
        const closest = Math.min(...near.map((x) => x.dist));
        pick = near.filter((x) => x.dist === closest).map((x) => x.entry);
      }
      // A short misspelling of your own player ("jaes" for James): same first letter, one typo off.
      if (!pick.length && words[i].length === 4 && !COMMON.has(words[i]) && !VOCAB_SET.has(words[i])) {
        pick = index.filter(({ p, first, last }) => myIds.has(p.id)
          && [first, last].some((name) => name.length >= 5 && name[0] === words[i][0] && typoDistance(words[i], name) <= 1));
      }
      if (pick.length) {
        match = best(pick);
        length = 1;
      }
    }
    if (!match) continue;
    // The same name twice ("wilson vs wilson") means two different players.
    const chosen = match.find((m) => !used.has(m.p.id)) || match[0];
    const others = match.filter((m) => m !== chosen);
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
    const position = POSITION_WORDS[words[i]] || POSITION_WORDS[(words[i].match(/^(qb|rb|wr|te)\d{1,2}$/) || [])[1]];
    if (position) return position;
  }
  return null;
};

export const pts = (n) => `${Number(n || 0).toFixed(1)} pts`;
export const firstName = (p) => p.name.split(' ')[0];

/** The question's words without the players' names, so a name like Jalen Hurts doesn't read as "hurt". */
const withoutNames = (text, found) => {
  const names = [...new Set(found.flatMap((f) => nameTokens(f.player.name)))];
  const isName = (w) => names.includes(w) || names.includes(w.replace(/s$/, ''))
    || (w.length >= 5 && !COMMON.has(w) && names.some((n) => n.length >= 5 && typoDistance(w, n) <= typosAllowed(w)));
  return questionTokens(text).filter((w) => !isName(w)).join(' ');
};

/** True when "for" sits between the first and last player named ("Warren for AJ Brown"). */
const forBetween = (text, found) => {
  if (found.length < 2) return false;
  const words = questionTokens(text);
  const first = found[0].at;
  const last = found[found.length - 1].at;
  return words.slice(first + 1, last).includes('for');
};

const HELP = /^(help|help me|examples?|what can (you|i ask)|what (questions|kind of questions|else) can|what do you (do|know)|how does this work|how do i use|what should i ask)$|^(what can (you|i ask)|what (questions|kind of questions) can|what do you (do|know)|how does this work|how do i use)\b/;
const SMALL_TALK = /^(hi|hey|hello|yo|sup|whats up|what is up|good (morning|afternoon|evening)|thanks|thank you|thx|ty|cool|ok|okay|nice|great|awesome|perfect|got it|lol)\b/;
// About the chat itself, and feedback on it.
const ABOUT = /^(who|what) are you\b|\bare you (an? )?(ai|bot|robot|human|real|person|chatgpt|gpt|smart)\b|how do you (work|know|make|come up|decide|figure)|where (do|does) (your|the|you get) ?(numbers|data|projections|info|stats)?|how (smart|good) are you|who (made|built|created|programmed) you|can i trust you|better than (espn|yahoo|sleeper|fantasypros|the experts)|\byou (suck|stink|are (wrong|dumb|bad|trash|useless|stupid)|were wrong|got (it|that) wrong)\b|(bad|wrong|dumb|useless) answer|that (was|is) (wrong|bad|dumb)|(good|great|nice) (job|work|answer)|love (this|it|you)|you (rock|are (great|awesome|the best))|tell me a joke|\bjoke\b|how are you|how is it going|whats good/;
// "Should I tank?", "is my season over?": how your team stands, said plainly.
const OPINION = /\btank\b|season (is )?over|\bcontender\b|playoff team|\brebuild|all in\b|\bpanic\b|am i (good|bad|the favorite|screwed|done|cooked|toast|in trouble|a contender)|is my team (good|bad|trash|garbage|any good|legit|done)|how screwed|still make (the )?playoffs|do (i|we) (have|stand) a chance|buying or selling|buy or sell|time to sell|be worried|should i (be )?worr|what if (i|we) lose/;
// League settings: playoff spots, scoring, lineup slots, how many weeks are left.
const RULES = /how many teams (make|get in|go to|in|are in)|when do (the )?playoffs (start|begin)|(what|which) week (do )?(the )?playoffs|playoffs start|is (this|it|our league|the league) (a )?(full )?(ppr|half|standard|superflex|dynasty|redraft|keeper)|scoring (set ?up|settings|system|format|rules)|what is (our|the) scoring|how is scoring|points? per (reception|catch)|how many points (for|per) a (catch|reception)|lineup (spots|slots)|roster (spots|slots|size)|flex (spots|slots)|how many (starters|flex|bench spots|roster spots|qbs?|rbs?|wrs?|tes?) (do|can|are|spots|slots)|superflex league|how many teams|how many weeks (are )?left|what week is it|regular season (over|end|ends)|trade deadline|league (settings|rules)/;
// "Why did he get benched?", "is he losing his job?": what the numbers say, since there are no headlines here.
const NEWS = /\bbenched\b|get benched|demoted|los(e|ing) (his |the )?(job|role|spot)|still (the )?(starter|starting|the lead|rb1|wr1)|time ?share|committee|lead back|phased out|(lost|losing|lose) (snaps|work|touches|targets)|latest on|getting the ball|more work|less work|score so low|scored so low|(was|so|play(ed)?) (so )?bad\b|been bad|\bsplit\b|role (change|shrink|grow)|getting (more|fewer|less) (targets|carries|touches|work|snaps|looks)|what happened (to |with )?(\w+ )?(last|on) (week|game|sunday|monday|thursday)/;
const WEATHER = /\bweather\b|\brain(s|ing|y)?\b|\bsnow(s|ing|y)?\b|\bwind(s|y)?\b|cold (weather|games?)|\bfreezing\b|\bdome\b|\bindoors?\b|\boutdoors?\b|\bforecast\b|\btemperature\b|\bstorms?\b/;
const VEGAS = /\bvegas\b|\bspreads?\b|\bbetting\b|sportsbook|\blines?\b(?! ?up)|\bfavou?red\b|underdog|over ?under|game totals?|point totals?|\bimplied\b|shootout|highest (scoring )?(totals?|games?)|high scoring games?/;
// "Vegas odds" means the betting line, not the Las Vegas Raiders.
const VEGAS_RAW = /\bvegas (odds|lines?|spreads?|totals?|says|thinks|has)\b/;
/** Questions that need this week's lines, forecasts, headlines or the trade deadline loaded first. */
export const needsGameDay = (raw) => {
  const t = tidy(cleanQuestion(raw));
  return WEATHER.test(t) || VEGAS.test(t) || NEWS.test(t) || /\bnews\b|headlines?|latest|what happened|trade deadline|update on|going on with/.test(t);
};
const REPLACE = /replace|replacement|instead of|in (his|their) place|fills? in for|takes? (\w+ )?spot|who (plays|starts) (if|when)|if (\w+ )?(sits|is out|cant play|cannot play|doesnt play|wont play|is hurt|gets hurt)|(cant|cannot|doesnt|wont) play\b|\bnow what\b|(gets|got) (hurt|injured)/;

/**
 * What kind of question it is. `found` is findPlayers' result. Questions about one player, two or more
 * players, or none (your lineup, team, league or the waiver wire) each have their own kinds.
 */
export function questionType(text, found) {
  const raw = tidy(text);
  const t = withoutNames(text, found);
  const n = found.length;
  if (!raw || HELP.test(raw)) return 'help';
  if (!n && SMALL_TALK.test(raw)) return 'smalltalk';
  if (!n && ABOUT.test(raw) && !/accura|track record|hit rate/.test(raw)) return 'about';
  if (!n && RULES.test(t)) return 'rules';
  if (WEATHER.test(t) && !/\b(trade|drop|pick ?up)\b/.test(t)) return 'weather';
  if ((VEGAS.test(t) || VEGAS_RAW.test(raw)) && !/\b(trade|drop|pick ?up)\b/.test(t)) return 'vegas';
  if (!n && /\bnews\b|headlines?|\blatest\b/.test(t)) return 'news';
  if (/accura|track record|report card|hit rate|how (good|right|often) (are|is|have) (you|we|the model|your|the projections)/.test(t)) return 'accuracy';
  if (/handcuff|\bbackups?\b|backs? (him )?up\b/.test(t)) return 'handcuff';
  if (/\bbye/.test(t)) return n && /who (do|should) i (start|play)|replace|instead/.test(t) ? 'replace' : 'bye';
  if (n && REPLACE.test(t)) return 'replace';
  if (n && /trade value/.test(t)) return 'value';
  if (!n && /buy ?low/.test(t)) return 'buylow';
  if (!n && /sell ?high/.test(t)) return 'sellhigh';
  if (/\btrades?\b|\btrading\b|\bdeal\b|\boffer|what would it take|\bget for\b|would you do|\baccept\b|would (\w+ )?take|who wants|interested in|how (do|can|could|would) i get(?! better)|how to get(?! better)/.test(t)) return 'trade';
  if (forBetween(text, found) && !/\b(start|sit|play|flex)\b/.test(t)) return 'trade';
  if (n === 1 && /available|on (the )?waivers|free agent|pick (\w+ )?up|\bpickup\b|\badd\b|\bgrab\b|\bclaim\b|^who (has|owns)\b|\bowned\b|rostered/.test(t)) return 'availability';
  if (/pick ?up|picking up|waiver|free agent|\badd\b|\badding\b|most added|\bgrab\b|stream|\bclaim/.test(t)) return 'pickup';
  if (/\bdrop\b|\bcut\b|\brelease\b|droppable|expendable|worst player|least valuable|make room/.test(t)) return 'drop';
  if (!n) {
    if (/\b(hurt|injur|injured|injuries)/.test(t) || (/\bout\b/.test(t) && /\b(my team|my roster|anyone|anybody|my guys|my players)\b/.test(t))) return 'teaminjuries';
    if (/gives? up the most|allows? the most|most points (allowed )?(to|against)|(worst|best|easiest|toughest) (defense|matchup)s? (for|against|vs)/.test(t)
      && ['QB', 'RB', 'WR', 'TE'].includes(askedPosition(t.replace(/\bdefen[cs]es?\b|\bdst\b/g, '')))) return 'defenses';
    if (/defen[cs]es?|\bdefend|\bdst\b/.test(t) && /give up|giving up|allow|against|\b(to|for) (qb|rb|wr|te)|\bvs\b|versus|defend|worst|best|easiest|toughest|hardest|stingiest|tough|easy|good|bad/.test(t)
      && ['QB', 'RB', 'WR', 'TE'].includes(askedPosition(t.replace(/\bdefen[cs]es?\b|\bdst\b/g, '')))) return 'defenses';
    if (/matchups\b|(easy|easiest|tough|toughest|hard|hardest|good|best|bad|worst) matchup/.test(t)) return 'matchuplist';
    if (/\btop\b|\bbest\b|\brank|\b(qb|rb|wr|te)1\b/.test(t) && askedPosition(t) && !/\bshould\b|\bmy (qb|rb|wr|te)\d/.test(t)) return 'rankings';
    if (/sleeper|best (\w+ )?available|available players/.test(t)) return 'rankings';
    if (/weakest (starter|link|player)|worst starter|weak link/.test(t)) return 'weakest';
    if (/\broom\b|good enough|\bneeds?\b|\bthin\b|\bweak\b|(what|which) position|weakest position|strongest position|weak spot|weakness|\bweak\b|strengths?\b|thin at|\bdeep\b|\bdepth\b|missing|holes?\b/.test(t)) return 'needs';
    if (/\bbench\b/.test(t) && !/\b(should|start|sit)\b/.test(t)) return 'bench';
    if (/underperform|overperform|\bcold\b|\bhot\b|slump|struggl|trending|breakout|on fire|disappoint/.test(t)) return 'trending';
    if (/(best|most valuable|top) player|\bmvp\b|my best (guy|asset)/.test(t)) return 'best';
    if (/start|sit|lineup|bench|\bplay\b|\bflex\b|optimi|set my|should be my|put in|goes in|who to play|who(s| is) my (flex|qb|rb|wr|te|kicker|defense)|score this week|points will (i|we|my team)|my team score|my projection/.test(t)) return 'lineup';
    if (/better|improve|help me win|\bwin\b|win (my|the) league|win it all|get better|help my team|what (should|do) i do|advice|\btips?\b|upgrade|stinks|sucks|\bbad\b|struggling|\bmoves?\b|fix my team/.test(t)) return 'plan';
    return 'unknown';
  }
  if (n >= 2) {
    if (/rest of|\bros\b|long term|dynasty|rather have|\bkeep\b|season long|for the season|better player|overall/.test(t)) return 'comparevalue';
    if (/schedule/.test(t)) return 'compareschedule';
    if (/targets|carries|touches|workload|usage|snaps?\b|volume|opportunit/.test(t)) return 'compareusage';
    if (/upside|ceiling|boom|explosive/.test(t)) return 'compareceiling';
    if (/\bsafe|floor|consistent|reliable/.test(t)) return 'comparefloor';
    return 'compare';
  }
  if (/^who (does|do|is|are|will)\b.*\b(play|playing|facing|face)\b/.test(t) && !/next (few |\d )?(games|weeks)|upcoming|schedule|coming up|rest of/.test(t)) return 'matchup';
  if (NEWS.test(t) && !/\b(hurt|injur|injured|status)\b/.test(t)) return 'news';
  if (/\bnews\b|headlines?/.test(t)) return 'news';
  if (/going on with|what is up with|update on|\bnews\b|^is playing( this week| right now| today| tonight| sunday| monday| thursday)?$|\bplaying (or not|still)\b/.test(t)) return 'injury';
  if (/hurt|injur|\bback\b|return|status|healthy|\bout\b|questionable|doubtful|\bir\b|going to play|gonna play|will (he |they )?play|\bplay(ing)? (this week|sunday|monday|thursday|tonight|today)|suit up|\bactive\b/.test(t)) return 'injury';
  if (/replace|instead of|in (his|their) place|fill in for|who (plays|starts) (if|when)/.test(t)) return 'replace';
  if (/schedule|upcoming|next (few |\d )?(games|weeks)|coming up/.test(t)) return 'schedule';
  if (/who (does|do|is|are) (\w+ )?(play|playing|facing|face)\b|opponent|matchup|against|defen[cs]e|\bvs\b|facing/.test(t)) return 'matchup';
  if (/\brank|\b(qb|rb|wr|te)\d+\b|\btier\b/.test(t)) return 'rank';
  if (/worth (starting|a start|playing|putting in)/.test(t)) return 'player';
  if (/worth|value|rest of|\bros\b|outlook|\bkeep\b|\bhold\b|\bsell\b|\bbuy\b|dynasty|long term/.test(t)) return 'value';
  if (/stat|project|how many|targets|snaps?\b|carries|touches|average|\bavg\b|last \d|last (few|three|two)|trending|been playing|\bdoing\b|tell me about|how good|lately|recent|usage|share|points|scor|\bnumbers\b|look(ing)? like|\bppg\b|what happened|\bbust\b|\bgood\b|breakout/.test(t)) return 'stats';
  return 'player';
}

const HELP_EXAMPLES = [
  ...EXAMPLE_QUESTIONS,
  'Top 10 WRs this week',
  "Who's hurt on my team?",
  'What does my team need?',
  'Who are good buy-low targets?',
  'Is Tank Bigsby available?',
  'Who has the easiest matchups this week?',
  'How can I make my team better?',
];

const helpAnswer = (lead, examples = EXAMPLE_QUESTIONS) => ({
  text: lead || 'Ask me about your lineup, a player, a trade or the waiver wire. For example:',
  examples,
});
const NOT_FOUND = "I didn't find a player or a question I know in that. Try one of these:";
// A question the chat couldn't answer: saved (question only) so new rules can be written for it.
const missed = () => ({ ...helpAnswer(NOT_FOUND), miss: true });

/** "Name (WR12 · BUF vs KC)" style line for one player. */
export const playerLine = (p) => [
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
const slotFor = (lineup, position, nth = 1) => {
  if (!position) return null;
  const fits = (s) => {
    const p = s.slot.positions;
    if (position === 'FLEX') return p.length > 1 && !p.includes('QB');
    if (position === 'SUPERFLEX') return p.length > 1 && p.includes('QB');
    return p.length === 1 && p[0] === position;
  };
  const slots = lineup.starters.filter(fits);
  return slots[Math.min(nth, slots.length) - 1];
};

function answerLineup(text, ctx) {
  const { lineup } = ctx;
  if (!lineup.starters.length) return helpAnswer('Pick your team at the top of the page first, then ask again.');
  const position = askedPosition(text);
  const nth = Number((tidy(text).match(/\b(?:qb|rb|wr|te)(\d)\b/) || [])[1]) || 1;
  const entry = slotFor(lineup, position, nth);
  if (entry?.player) {
    const why = explainStarter(lineup, entry.slot.key, ctx.whyCtx);
    return { text: `Start ${entry.player.name} at ${entry.slot.label}.`, why };
  }
  return {
    text: `Your best lineup projects ${pts(lineup.total)}:`,
    items: lineup.starters.map((s) => ({
      label: s.slot.label,
      name: s.player ? s.player.name : 'Empty',
      detail: s.player ? playerLine(s.player) : `Nobody on your roster can play here this week. Ask "best ${s.slot.label} on waivers".`,
      value: s.player ? s.player.points : null,
    })),
    sections: lineup.bench.length ? [{
      title: 'On your bench:',
      items: lineup.bench.map((p) => ({ label: p.position, name: p.name, detail: benchReason(p) || playerLine(p), value: p.points })),
    }] : [],
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
  if (outlook?.backWeek && isUnavailable(p.injury)) lines.push(`Sleeper's projections have them back in week ${outlook.backWeek}.`);
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

function answerRank(text, found, ctx) {
  const p = ctx.scored(found[0].player);
  const season = ctx.seasonRankOf?.(p) || null;
  const bits = [];
  if (p.posRank) bits.push(`${rankLabel(p.position, p.posRank)} this week (${pts(p.points)} projected)`);
  else bits.push(`not ranked this week${p.onBye ? ' (bye)' : ''}`);
  if (season) bits.push(`${rankLabel(p.position, season)} in the season rankings`);
  const trend = trendFor(p, ctx.scoring);
  if (trend.direction !== 'flat') bits.push(`trending ${trend.direction} (${trend.lastThree} a game over the last 3, ${trend.season} for the season)`);
  // "Is Kyren an RB1?": tiers of 12 (RB1 is top 12, RB2 the next 12).
  const tier = Number((tidy(text).match(/\b(?:qb|rb|wr|te)(\d)\b/) || [])[1]);
  const rank = p.posRank || season;
  const tierLine = tier && rank
    ? ` ${Math.ceil(rank / 12) === tier ? 'So yes' : 'So no'}: ${p.position}${tier} means ${p.position}${(tier - 1) * 12 + 1}-${tier * 12}, and ${firstName(p)} is ${p.position}${Math.ceil(rank / 12)} range.`
    : '';
  return { text: `${p.name} is ${bits.join(', ')}.${tierLine}`, note: ambiguityNote(found) };
}

/** A straight answer to "should I keep / buy low / sell high on X?", from the outlook, recent games and the market. */
const valueVerdict = (text, p, outlook, tag, ctx) => {
  const t = tidy(text);
  const trend = trendFor(p, ctx.scoring);
  const recent = Number(trend.lastThree);
  const mine = ctx.roster.some((r) => r.id === p.id);
  if (/buy ?low|\bbuy\b/.test(t)) {
    if (mine) return `${p.name} is already yours.`;
    if (tag?.key === 'buy' || outlook.value > recent + 1) {
      return `Yes, a buy-low: ${firstName(p)} has scored ${recent} a game over the last 3, below the ${outlook.value.toFixed(1)} we expect from here.`;
    }
    return `Not really a buy-low: ${firstName(p)}'s recent games (${recent} a game over the last 3) aren't below what we expect from here (${outlook.value.toFixed(1)}).`;
  }
  if (/sell ?high|\bsell\b/.test(t)) {
    if (tag?.key === 'sell' || recent > outlook.value + 2) {
      return `Yes, sell high: ${firstName(p)} has scored ${recent} a game over the last 3, more than the ${outlook.value.toFixed(1)} we expect from here.`;
    }
    if (recent < outlook.value - 2) {
      return `Not now: ${firstName(p)}'s recent ${recent} a game is below the ${outlook.value.toFixed(1)} we expect from here, so you'd be selling low.`;
    }
    return `Only for a fair price: ${firstName(p)}'s recent ${recent} a game is about what we expect from here (${outlook.value.toFixed(1)}), so there's no hot streak to cash in.`;
  }
  if (/\b(keep|hold|holding|drop)\b/.test(t) && mine) {
    if (startsForYou(p, ctx)) return `Keep ${p.name}: ${firstName(p)} is one of your starters.`;
    return outlook.value >= 8
      ? `Hold ${p.name}: worth more than most waiver players, even from your bench.`
      : `${p.name} is fine to move if you need the roster spot.`;
  }
  return null;
};

function answerValue(text, found, ctx) {
  const p = ctx.scored(found[0].player);
  const value = ctx.valueOf(p);
  const outlook = ctx.outlookOf(p);
  if (!outlook) return { text: `I don't have enough on ${p.name} to put a value on yet.` };
  const tag = value?.tag ? ` The market and our projections disagree: ${value.tag.label.toLowerCase()}.` : '';
  const verdict = valueVerdict(text, p, outlook, value?.tag, ctx);
  return {
    text: `${verdict ? `${verdict} ` : ''}${p.name} is worth about ${outlook.perGame.toFixed(1)} pts a game when playing, ${outlook.value.toFixed(1)} a game across the ${Math.round(outlook.remaining)} games left once missed time is counted.`
      + (value?.label ? ` Trade value: ${value.label}.` : '') + tag,
    items: reasonNotes(outlook).slice(0, 5).map((note) => ({ name: note })),
    itemsTitle: reasonNotes(outlook).length ? 'What goes into it:' : null,
    sections: [scheduleSection(p, ctx)].filter(Boolean),
    note: ambiguityNote(found),
  };
}

/** Rates one trade, keeping it as the conversation's trade so "is it fair?" or "what if I add X?" can follow. */
export function rateTrade(give, get, ctx, found = []) {
  const mine = new Set(ctx.roster.map((p) => p.id));
  if (get.length && get.every((p) => mine.has(p.id))) {
    return { text: `${get.map((p) => p.name).join(' and ')} ${get.length > 1 ? 'are' : 'is'} already on your team. Ask "start X or Y?" to compare them.` };
  }
  if (give.length && give.every((p) => !mine.has(p.id))) {
    return { text: `${give.map((p) => p.name).join(' and ')} ${give.length > 1 ? "aren't" : "isn't"} on your team. To get ${give.length > 1 ? 'them' : firstName(give[0])}, ask "what would it take to get ${give[0].name}?"` };
  }
  const rated = ctx.trades.rate(give, get);
  if (rated.error) return { text: rated.error, note: ambiguityNote(found) };
  return {
    text: rated.text,
    why: rated.why,
    note: [rated.note, ambiguityNote(found)].filter(Boolean).join(' ') || null,
    context: { type: 'trade', trade: { give, get, partnerName: rated.partnerName }, players: [...give, ...get], team: rated.partnerName },
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
  // People sometimes name the sides the other way round ("trade for X, give Y", "I was offered X for Y").
  if (give.length && get.length && give.every((p) => !mine.has(p.id)) && get.every((p) => mine.has(p.id))) [give, get] = [get, give];
  if (!give.length && get.some((p) => mine.has(p.id))) {
    give = get.filter((p) => mine.has(p.id));
    get = get.filter((p) => !mine.has(p.id));
  }
  if (give.length && get.length) return rateTrade(give, get, ctx, found);
  if (!give.length && get.length >= 2 && forBetween(text, found)) {
    // "Is Bijan for Chase fair?" about two other teams: compare what each is worth.
    const compared = answerCompareLong(found, 'value', ctx);
    return { ...compared, text: `Neither is on your team, so here's what each is worth from here. ${compared.text}` };
  }

  const t = tidy(text);
  const position = askedPosition(text) || (/\b(that|it|one)\b/.test(t) && !found.length ? ctx.previous?.position || null : null);
  const partner = teamsNamed(text, (ctx.partnerNames || []).map((name) => ({ name })))[0]?.name || null;
  const shape = /\b(2|two) for (1|one)\b/.test(t) ? 'twoForOne' : null;
  if (give.length && !get.length && !position && !partner) return answerSellOne(give[0], found, ctx);
  if (!found.length && !position && !partner && /\baway\b|\bsell\b|\bshop|who (should|to|do) i trade$|who should i trade\b(?! for| with)/.test(t)) return answerSellList(ctx);
  const ideas = ctx.trades.find({ give, get, position, partner, shape });
  const target = [
    get.length ? `for ${get.map((p) => p.name).join(' and ')}` : give.length ? `using ${give.map((p) => p.name).join(' and ')}` : position ? `for a ${position}` : '',
    partner ? `with ${partner}` : '',
  ].filter(Boolean).join(' ');
  const kind = shape ? 'Two-for-one trades' : 'Trades';
  const offers = !ideas.length && (give.length || get.length) && ctx.trades.offers ? ctx.trades.offers({ give, get, partner }) : [];
  if (offers.length) {
    return {
      text: `No trade ${target} clearly helps your lineup, but these are about even in value, so the other team could say yes:`.replace(/ {2,}/g, ' '),
      items: ideaItems(offers),
      note: 'Ask "should I trade X for Y?" about any of these for the full breakdown.',
      context: { type: 'trade', players: [...give, ...get], team: offers[0].partnerName },
    };
  }
  if (!ideas.length) {
    return {
      text: `I couldn't find a ${shape ? 'two-for-one ' : ''}trade ${target} that helps your lineup and is close enough in value for them to take.`.replace(/ {2,}/g, ' '),
      note: 'Set one up yourself in the Trade check below to see how it rates.',
      context: { type: 'trade', players: [...give, ...get], team: partner },
    };
  }
  return {
    text: `${kind} ${target} that help your lineup and are close in value:`.replace(/ {2,}/g, ' '),
    items: ideaItems(ideas),
    note: 'Ask "should I trade X for Y?" about any of these for the full breakdown.',
    context: { type: 'trade', players: [...give, ...get], team: partner || (ideas.every((i) => i.partnerName === ideas[0].partnerName) ? ideas[0].partnerName : null) },
  };
}

const tradeLabel = (trade) => `trading ${trade.give.map((p) => p.name).join(' and ')} for ${trade.get.map((p) => p.name).join(' and ')}`;
const pointsChange = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;

/** A follow-up on the last trade ("who else should I add to that trade?"): what evens it out. */
function answerBalance(trade, ctx) {
  const balanced = ctx.trades.balance(trade.give, trade.get);
  if (balanced.error) return { text: balanced.error };
  const partner = balanced.partnerName;
  const label = tradeLabel(trade);
  if (Math.abs(balanced.share) <= 0.15) {
    return { text: `${label[0].toUpperCase()}${label.slice(1)} is already about even in value, so nobody needs to add anything. Ask "should I trade X for Y?" with more players to try a bigger deal.` };
  }
  const youGiveMore = balanced.share < 0;
  const lead = youGiveMore
    ? `${label[0].toUpperCase()}${label.slice(1)}, you give more value than you get, so ask ${partner} to add something.`
    : `${label[0].toUpperCase()}${label.slice(1)}, you get more value than you give, so ${partner} will likely want you to add something.`;
  if (!balanced.options.length) {
    return {
      text: `${lead} No single ${youGiveMore ? `player on ${partner}` : 'player of yours'} evens it out, though.`,
      note: 'Try a different player in the trade, or set it up in the Trade check below to add draft picks.',
    };
  }
  const nameOf = (item) => item.name || item.label || 'a pick';
  return {
    text: lead,
    itemsTitle: 'Any one of these makes it about even:',
    items: balanced.options.map((option) => ({
      label: option.action === 'add' ? (option.side === 'get' ? partner : 'You') : 'Drop',
      name: option.action === 'add' ? `Add ${nameOf(option.item)}` : `Leave ${nameOf(option.item)} out`,
      detail: [option.item.position, option.item.team].filter(Boolean).join(' · ')
        + `${option.item.position ? '. ' : ''}Your lineup ${pointsChange(option.myChange)} pts a week after.`,
    })),
    note: 'Ask "should I trade X for Y and Z?" to see the full breakdown of any of these.',
    context: { type: 'trade', trade, players: [...trade.give, ...trade.get], team: partner },
  };
}

const positionsOf = (list) => [...new Set(list.map((p) => p.position))].join('/');

/** One trade idea as a list row, with the reason it helps: which spot gets better and what it costs. */
export const ideaItems = (ideas) => ideas.map((idea) => {
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
export const usageLine = (p) => {
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
    const best = bestFreeAgents(ctx, position);
    return {
      text: `No free agent${position ? ` at ${position}` : ''} is clearly worth more than anyone on your bench right now.${best.length ? ' The best ones out there:' : ''}`,
      items: best.length ? freeAgentItems(best) : null,
      context: { type: 'pickup', question: text, players: best.slice(0, 1).map((r) => r.p), position },
    };
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
    context: { type: 'pickup', players: [list[0].add.player], position },
  };
}

function answerDrop(found, ctx) {
  if (!ctx.waivers) return { text: 'Pick a Sleeper or Hood League team at the top of the page first, so I can compare your bench with who is free.' };
  const { drops, holds } = ctx.waivers();
  if (found.length) {
    const p = found[0].player;
    if (!ctx.roster.some((r) => r.id === p.id)) return answerAvailability(found, ctx);
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

/** "Who would replace him?": the best bench player who can fill that starter's spot. */
function answerReplace(found, ctx) {
  const p = ctx.scored(found[0].player);
  const entry = ctx.lineup.starters.find((s) => s.player?.id === p.id);
  if (!entry) {
    if (!ctx.roster.some((r) => r.id === p.id)) return { text: `${p.name} isn't on your team.` };
    if (!benchReason(p)) {
      return { text: `${p.name} is on your bench this week${p.injury ? ` (${p.injury})` : ''} anyway, so your lineup doesn't change.` };
    }
    // Out or on bye: who your best lineup already plays at that position instead.
    const covering = ctx.lineup.starters.filter((s) => s.player && s.player.position === p.position);
    const next = ctx.lineup.bench.filter((b) => b.position === p.position && !benchReason(b)).sort((a, b) => (b.points || 0) - (a.points || 0))[0];
    return {
      text: `${p.name} ${p.onBye ? 'is on bye' : `is ${p.injury || 'out'}`}, so your best lineup plays ${covering.length ? covering.map((s) => `${s.player.name} at ${s.slot.label}`).join(', ') : `nobody at ${p.position}`} instead.`
        + (next ? ` Next up on your bench: ${next.name} (${pts(next.points)}).` : ` Nobody else on your bench plays ${p.position}; ask "best ${p.position} on waivers" for a pickup.`),
      items: covering.map((s) => ({ label: s.slot.label, name: s.player.name, detail: playerLine(s.player), value: s.player.points })),
      context: { players: [p] },
    };
  }
  const options = ctx.lineup.bench
    .filter((b) => entry.slot.positions.includes(b.position) && !benchReason(b))
    .sort((a, b) => (b.points || 0) - (a.points || 0));
  if (!options.length) {
    return { text: `Nobody on your bench can play ${entry.slot.label}. Ask "best ${p.position} on waivers" for a pickup.`, context: { position: p.position } };
  }
  const next = options[0];
  return {
    text: `${p.injury ? `If ${firstName(p)} can't play, ` : ''}${next.name} would step in at ${entry.slot.label}: ${pts(next.points)} projected, vs ${pts(p.points)} for ${firstName(p)}.`,
    items: options.slice(0, 3).map((b) => ({ label: b.position, name: b.name, detail: playerLine(b), value: b.points })),
    itemsTitle: 'Your bench options for that spot:',
    context: { players: [next, p] },
  };
}

const LEAGUE_WORDS = /power rank|rank(ing)? (all )?(the|every) teams|rank all teams|\brecord\b|\bcontender\b|team rank|best team|worst team|strongest team|weakest team|top team|playoff|postseason|championship|\btitle\b|win (it all|the league|the chip)|\bchip\b|toilet|last place|finish last|standings|trajector|my team doing|how (is|are) (my team|we|our team)|win my (matchup|game)|will (i|we) win|who (am i|are we) (playing|facing|up against)|who (do|will) (i|we) (play|face)|my opponent|my (fantasy )?matchup this week/;
const ODDS_WORDS = /\bodds\b|\bchances?\b/;
const NOT_LEAGUE = /\btrade|\bstart\b|\bsit\b|\bdrop\b|pick ?up|waiver|\bbench\b|\bschedule\b/;

/** The league teams named in a question ("my team", "we" or a team's name). */
const teamsNamed = (text, teams) => {
  const t = ` ${tidy(text)} `;
  return teams.filter((team) => {
    const name = tidy(team.name);
    if (name.length < 3) return false;
    if (t.includes(` ${name} `)) return true;
    // One misspelled word in a name of two or more ("racing with rggs").
    const parts = name.split(' ');
    const words = t.trim().split(' ');
    if (parts.length < 2) return false;
    return words.some((_, i) => {
      const here = words.slice(i, i + parts.length);
      if (here.length < parts.length) return false;
      const off = parts.filter((part, k) => part !== here[k]);
      return off.length === 1 && off[0].length >= 4
        && typoDistance(here[parts.indexOf(off[0])], off[0]) <= Math.max(1, typosAllowed(off[0]));
    });
  });
};

/** The question with each word of a league team's name swapped for "team" (word positions stay put), so they can't match players. */
const maskTeams = (text, names) => {
  let t = ` ${tidy(text)} `;
  names.map(tidy).filter((name) => name.length >= 3).sort((a, b) => b.length - a.length)
    .forEach((name) => { t = t.split(` ${name} `).join(` ${name.split(' ').map(() => 'team').join(' ')} `); });
  return t.trim();
};

/** A question about the league's teams (rankings, odds) rather than a player. teamNames are the league's teams, when known. */
export const isLeagueQuestion = (raw, teamNames = [], players = []) => {
  const text = cleanQuestion(raw, { teamNames, players });
  const t = tidy(text);
  if (RULES.test(t)) return true;
  if (NOT_LEAGUE.test(t)) return false;
  if (LEAGUE_WORDS.test(t) || OPINION.test(t)) return true;
  if (ODDS_WORDS.test(t) && /\b(my|our|we|team|teams|league)\b/.test(t)) return true;
  return /doing|outlook|look(ing)?\b|headed|ranked|how good|any good|strong|legit/.test(t) && teamsNamed(text, teamNames.map((name) => ({ name }))).length > 0;
};

const teamLabel = (team) => `${team.name}${team.mine ? ' (you)' : ''}`;

/** This week's head-to-head: who you play and how often you win it in the simulations. */
function answerWeekMatchup(mine, outlook, note) {
  const game = mine.opponents.find((o) => o.week === outlook.nextWeek) || mine.opponents[0];
  const opponent = game ? outlook.byId.get(game.rosterId) : null;
  if (!opponent) return { text: 'You have no game left on the schedule this regular season.', note };
  const chance = mine.winNext;
  const favored = chance == null ? '' : chance >= 0.55 ? ' You are the favorite' : chance <= 0.45 ? ' They are the favorite' : ' It is close to a coin flip';
  return {
    text: `Week ${game.week}: you play ${opponent.name} (${recordText(opponent.record)}).${favored}${chance == null ? '' : `, winning ${percent(chance)} of the simulations`}.`
      + ` Your best lineup projects about ${Math.round(mine.strength)} a week from here, theirs ${Math.round(opponent.strength)}.`,
    note,
  };
}

export function answerLeague(text, ctx) {
  const league = ctx.league;
  const t = tidy(text);
  const opinion = OPINION.test(t) && !/\b(odds|chances?|title|championship|toilet|power|standings)\b/.test(t);
  if (!league || league.status === 'none') {
    if (opinion) return { ...answerPlan(ctx), note: 'Pick your Sleeper league at the top of this page and I can tell you your playoff odds too.' };
    return { text: 'Team rankings and odds need a Sleeper league, since they use its schedule and standings. Pick your Sleeper league at the top of this page.' };
  }
  if (league.status === 'error') return { text: `I couldn't load your league's standings: ${league.error}` };
  const outlook = league.outlook;
  const named = teamsNamed(text, outlook.teams);
  const mine = outlook.teams.find((team) => team.mine) || null;
  const asksAboutMe = /\b(my|me|we|us|our|i)\b/.test(t);
  const subject = named[0] || (asksAboutMe ? mine : null);
  const oddsItem = (team, chance, rank) => ({
    label: `#${rank}`, name: teamLabel(team), detail: team.record.games ? `${recordText(team.record)} · ${Math.round(team.record.pointsFor)} pts` : null, valueText: percent(chance),
  });
  const sortedBy = (key) => [...outlook.teams].sort((a, b) => b[key] - a[key] || a.powerRank - b.powerRank);
  const note = 'From playing out the rest of the season thousands of times with each team\'s projected lineup. See every team on the Rankings page under Teams.';

  if (/win my (matchup|game)|will (i|we) win|who (am i|are we) (playing|facing|up against)|who (do|will) (i|we) (play|face)|my opponent|my (fantasy )?matchup/.test(t) && mine) {
    return answerWeekMatchup(mine, outlook, note);
  }
  if (/standings/.test(t) && !subject) {
    return {
      text: `Standings in ${outlook.leagueName}:`,
      items: outlook.standings.map((team) => ({
        label: `#${team.standing}`, name: teamLabel(team), detail: `${recordText(team.record)} · ${Math.round(team.record.pointsFor)} pts`, valueText: `playoffs ${percent(team.playoffs)}`,
      })),
      note: 'Ask "what are my playoff odds?" or "how is TEAM doing?" for more.',
    };
  }
  if (/toilet|last place|finish last|worst|weakest team|bottom/.test(t)) {
    const list = sortedBy('last');
    const lead = subject
      ? `${teamLabel(subject)}: ${percent(subject.last)} chance of finishing last.`
      : `Toilet bowl watch: ${teamLabel(list[0])} is the most likely to finish last (${percent(list[0].last)}).`;
    return { text: lead, itemsTitle: 'Chance of finishing last in the regular season:', items: list.map((team, i) => oddsItem(team, team.last, i + 1)), note };
  }
  if (/championship|\btitle\b|win (it all|the league|the chip)|\bchip\b/.test(t)) {
    const list = sortedBy('title');
    const lead = subject
      ? `${teamLabel(subject)}: ${percent(subject.title)} to win the title.`
      : `${teamLabel(list[0])} is the title favorite at ${percent(list[0].title)}.`;
    return { text: lead, itemsTitle: 'Chance to win the championship:', items: list.map((team, i) => oddsItem(team, team.title, i + 1)), note };
  }
  if (opinion && mine && (!subject || subject === mine)) {
    return { text: `${opinionLead(mine)} ${trajectoryText(mine, outlook)}`, note };
  }
  if (subject && !/power|best team|strongest|rank/.test(t)) {
    return { text: trajectoryText(subject, outlook), note };
  }
  if (/playoff|postseason|odds|chances?|trajector|standings/.test(t) && !/power|best team|strongest/.test(t)) {
    const list = sortedBy('playoffs');
    const lead = mine ? trajectoryText(mine, outlook) : `Playoff odds for ${outlook.leagueName} (top ${outlook.playoffTeams} make it):`;
    return { text: lead, itemsTitle: `Chance to make the playoffs (top ${outlook.playoffTeams}):`, items: list.map((team, i) => oddsItem(team, team.playoffs, i + 1)), note };
  }
  const top = outlook.powerOrder[0];
  return {
    text: `${teamLabel(top)} has the best team right now, projecting ${Math.round(top.strength)} points a week the rest of the way.${mine && mine !== top ? ` You're #${mine.powerRank}.` : ''}`,
    itemsTitle: 'Power rankings, by what each best lineup should score a week from here:',
    items: outlook.powerOrder.map((team) => ({
      label: `#${team.powerRank}`,
      name: teamLabel(team),
      detail: [team.record.games ? recordText(team.record) : null, `playoffs ${percent(team.playoffs)}`, `title ${percent(team.title)}`].filter(Boolean).join(' · '),
      value: team.strength,
      valueLabel: 'a week',
    })),
    note: 'Ask "what are my playoff odds?", "who wins the title?" or "toilet bowl odds" for more.',
  };
}

// Follow-ups that point back at the last answer: "that trade", "who else should I add", "him", "why?".
const BACK_TO_TRADE = /\b(that|this|the|same|my) (trade|deal|offer)\b|\bsweeten|\bbalance|\bfair\b|\beven (it|out)\b|throw in|\b(add|give|offer|ask for)\b.*\b(else|more|trade|deal|it|they|them)\b|\belse\b.*\b(add|give|offer|throw)\b/;
const PRONOUNS = new Set(['he', 'him', 'his', 'hes', 'they', 'them', 'their', 'it']);
const ASK_WHY = /^(why|how come|explain|whats the reason|reasons?|how so|what makes you say)\b/;
const ASK_SURE = /^(are you sure|you sure|really|for real|seriously|how sure|how confident|confident|is that right)\b/;
const WHAT_ABOUT = /^(what|how) about\b|^and\b|^also\b|\binstead\b|^what if\b|^now\b/;

/** Just the parts of an answer worth showing again for "why?". */
const snapshot = (answer) => ({ text: answer.text, why: answer.why || null, items: answer.items || null, itemsTitle: answer.itemsTitle || null, sections: answer.sections || null });

/** The league's team names: from the standings when loaded, otherwise the trade partners. */
const leagueTeamNames = (ctx) => (ctx.league?.outlook?.teams || []).map((t) => t.name).concat(ctx.partnerNames || []);

/** A question with its position swapped ("top 10 WRs" + RB → "top 10 rb"). */
const withPosition = (text, position) => {
  const words = tidy(text).split(' ');
  const kept = words.filter((w, i) => !(POSITION_WORDS[w] || /^(qb|rb|wr|te)\d{1,2}$/.test(w)
    || (w === 'running' && words[i + 1]?.startsWith('back')) || (words[i - 1] === 'running' && w.startsWith('back'))
    || (w === 'tight' && words[i + 1]?.startsWith('end')) || (words[i - 1] === 'tight' && w.startsWith('end'))
    || (w === 'wide' && words[i + 1]?.startsWith('receiver')) || (words[i - 1] === 'wide' && w.startsWith('receiver'))));
  return `${kept.join(' ')} ${position.toLowerCase()}`;
};

/**
 * Answers a question. Returns { text, why?, items?, itemsTitle?, sections?, note?, examples?, context? }:
 * `why` is a "?"-card object, `items` a short list, and `context` what the conversation is about now
 * (players, a trade, a team, the question and answer), which comes back as ctx.previous with the next
 * question so "him", "that trade", "why?" and "what about RBs?" work. ctx carries the page's model:
 * { allPlayers, roster, lineup, whyCtx, scoring, week, defense, myIds, leagueIds, scored(p), outlookOf(p),
 * valueOf(p), seasonRankOf(p), ownerOf(p), byeOf(p), partnerNames, freeAgents(), needs(), trades, waivers,
 * waiverNote, league, previous }, where trades, waivers and needs are null without a league and league is
 * { status, outlook?, error? } for team questions.
 */
/**
 * A message with more than one question in it ("Start Bijan or Puka? Also who do I drop"), split into
 * its questions so each gets an answer. Pieces shorter than two words stay with the one before.
 */
const SPLIT_WORDS = /\s*(?:[?!]+|;|,?\s+also\s+|,?\s+and\s+(?=(?:who|what|whats|should|shud|shld|is|how|where|when|can|do|does|are)\b)|,\s*(?=if not\b))\s*/i;
export const splitQuestion = (raw) => {
  // A full stop ends a question, but not one after initials or "St." (J.K. Dobbins, St. Brown).
  const pieces = String(raw || '').replace(/(\w{3,})\.\s+/g, '$1? ').split(SPLIT_WORDS).map((piece, i) => (i ? piece.trim().replace(/^(also|and|plus)\s+/i, '') : piece.trim())).filter(Boolean);
  return pieces.reduce((parts, piece) => {
    if (parts.length && (piece.split(/\s+/).length < 2 || parts[parts.length - 1].split(/\s+/).length < 2)) {
      parts[parts.length - 1] = `${parts[parts.length - 1]} ${piece}`;
    } else parts.push(piece);
    return parts;
  }, []);
};

export function answerQuestion(raw, ctx) {
  const text = cleanQuestion(raw, { players: ctx.allPlayers, teamNames: leagueTeamNames(ctx) }) || tidy(raw);
  const answer = answerFresh(text, ctx);
  if (answer.context === false) {
    // Small talk and help leave the conversation where it was.
    answer.context = ctx.previous || null;
    return answer;
  }
  answer.context = { ...(answer.context || {}), question: answer.context?.question || text, answer: snapshot(answer) };
  return answer;
}

function answerFresh(text, ctx) {
  const previous = ctx.previous || null;
  const t = tidy(text);
  if (previous) {
    const followUp = answerFollowUp(text, ctx, previous);
    if (followUp) return followUp;
  }
  if (RULES.test(t)) return { ...answerRules(text, ctx), context: { type: 'rules' } };
  // League team names ("Dicker Lickers") aren't players, so hide them before looking for names.
  const teamNames = leagueTeamNames(ctx);
  const playerText = maskTeams(text, teamNames).replace(new RegExp(VEGAS_RAW.source, 'g'), 'betting $1');
  const lookup = () => matchPositions(findPlayers(playerText, ctx.allPlayers, { myIds: ctx.myIds, leagueIds: ctx.leagueIds, prefer: new Set((previous?.players || []).map((p) => p.id)) }));
  let found = null;
  if (isLeagueQuestion(text, teamNames, ctx.allPlayers)) {
    // "Should I panic about Bijan?" is about the player; "should I panic?" is about the team.
    const opinionOnly = OPINION.test(t) && !LEAGUE_WORDS.test(t) && !ODDS_WORDS.test(t);
    const gameDayOnly = (WEATHER.test(t) || VEGAS.test(t)) && !LEAGUE_WORDS.test(t);
    // "Should I tank?" isn't about Tank Bigsby.
    found = gameDayOnly ? lookup() : opinionOnly ? lookup().filter((f) => !(questionTokens(playerText)[f.at] === 'tank' && questionTokens(playerText)[f.at + 1] !== 'bigsby')) : [];
    if (!found.length && !gameDayOnly) return { ...answerLeague(text, ctx), context: { type: 'league' } };
  }
  if (!found) found = lookup();
  if (!found.length && previous?.trade && ctx.trades && BACK_TO_TRADE.test(t)) return answerBalance(previous.trade, ctx);
  if (!found.length && previous?.team && /\bneeds?\b/.test(t) && /\b(they|them|their|that team|the other team|he|his)\b/.test(t)) return answerNeeds(text, ctx, previous.team);
  // "Who do I start instead?", "what do I do then?": about the last player, though they aren't named.
  if (!found.length && previous?.players?.length && /\binstead\b|replace|what (do|should) i do\b|then what|fill in|\bif not\b/.test(t)) {
    const answer = answerByType('replace', text, previous.players.slice(0, 1).map((player) => ({ player, alternatives: [], at: 0 })), ctx);
    return { ...answer, context: { type: 'replace', players: previous.players.slice(0, 1), ...(answer.context || {}) } };
  }
  // "Is he worth it?", "should I trade him?": the players from the last question.
  if (previous?.players?.length) {
    const words = questionTokens(text);
    const at = words.findIndex((w) => PRONOUNS.has(w));
    const single = previous.players.length === 1 && !found.some((f) => f.player.id === previous.players[0].id);
    if (at >= 0 && !found.length) found = previous.players.slice(0, 2).map((player) => ({ player, alternatives: [], at }));
    else if (at >= 0 && single && /^(he|him|his|hes)$/.test(words[at])) {
      found = [...found, { player: previous.players[0], alternatives: [], at }].sort((a, b) => a.at - b.at);
    }
  }
  const type = questionType(text, found);
  const answer = answerByType(type, text, found, ctx);
  if (answer.context === false) return answer;
  return { ...answer, context: { type, players: found.map((f) => f.player), ...(answer.context || {}) } };
}

/**
 * When a name fits players at different positions, pick the one at the same position as the other
 * players asked about, so the two could share a lineup spot ("Burrow or Williams" means the QB Williams).
 */
const lineupGroup = (p) => (['RB', 'WR', 'TE'].includes(p.position) ? 'FLEX' : p.position);
const matchPositions = (found) => {
  if (found.length < 2) return found;
  return found.map((f) => {
    const others = found.filter((o) => o !== f).map((o) => lineupGroup(o.player));
    if (others.includes(lineupGroup(f.player))) return f;
    const better = f.alternatives.find((a) => others.includes(lineupGroup(a)));
    return better ? { ...f, player: better, alternatives: [f.player, ...f.alternatives.filter((a) => a !== better)] } : f;
  });
};

/** "Why?", "are you sure?", "what about Higgins?", "what about RBs?", "what if I add X?" after an answer. */
function answerFollowUp(text, ctx, previous) {
  const t = tidy(text);
  const last = previous.answer || null;
  if (ASK_WHY.test(t) && t.split(' ').length <= 4 && last) {
    if (last.why) return { text: "Here's the reasoning:", why: last.why, context: previous };
    if (last.items || last.sections) return { text: 'It comes from these numbers:', items: last.items, itemsTitle: last.itemsTitle, sections: last.sections, context: previous };
    return { text: `${last.text} That's the model's read from projections, recent workload, matchups and injuries.`, context: previous };
  }
  if (ASK_SURE.test(t) && last) {
    const confidence = last.why?.confidence;
    if (confidence) {
      const lead = confidence.chance >= 66 ? 'Fairly sure.' : confidence.chance >= 57 ? 'It leans that way, but not by a lot.' : "No, it's close to a coin flip.";
      return { text: `${lead} ${confidence.text}`, why: last.why, context: previous };
    }
    return { text: "It's the model's best read from projections, recent workload, matchups and injuries. Close calls can go either way, so ask \"why?\" for the reasons.", context: previous };
  }
  if (!WHAT_ABOUT.test(t)) return null;

  const found = matchPositions(findPlayers(text, ctx.allPlayers, { myIds: ctx.myIds, leagueIds: ctx.leagueIds }));
  const mine = new Set(ctx.roster.map((p) => p.id));
  // Changing the last trade: "what if I add Higgins?", "what about for Puka instead?"
  if (previous.trade && found.length && ctx.trades) {
    const instead = /\binstead\b|\brather\b/.test(t);
    let { give, get } = previous.trade;
    const yours = found.filter((f) => mine.has(f.player.id)).map((f) => f.player);
    const theirs = found.filter((f) => !mine.has(f.player.id)).map((f) => f.player);
    if (yours.length) give = instead ? yours : [...give, ...yours.filter((p) => !give.some((g) => g.id === p.id))];
    if (theirs.length) get = instead || (/\bfor\b/.test(t) && !/\b(add|plus|and)\b/.test(t)) ? theirs : [...get, ...theirs.filter((p) => !get.some((g) => g.id === p.id))];
    return rateTrade(give, get, ctx, found);
  }
  const position = askedPosition(text);
  if (previous.type === 'league') {
    if (!ctx.league) return null;
    return { ...answerLeague(`${previous.question} ${text}`, ctx), context: { type: 'league', question: `${previous.question} ${text}` } };
  }
  if (found.length && previous.type) {
    // The same question about someone else; comparisons keep the earlier players in.
    const comparing = /^compare/.test(previous.type);
    const players = comparing
      ? [...(previous.players || []).filter((p) => !found.some((f) => f.player.id === p.id)).map((player) => ({ player, alternatives: [], at: -1 })), ...found]
      : found;
    const type = previous.type === 'pickup' ? 'availability' : ['lineup', 'rankings', 'teaminjuries', 'matchuplist', 'bench', 'trending', 'best', 'weakest', 'plan', 'needs', 'buylow', 'sellhigh', 'defenses', 'league', 'help', 'smalltalk', 'unknown', 'accuracy'].includes(previous.type)
      ? questionType(text.replace(WHAT_ABOUT, ''), found) : previous.type;
    const answer = answerByType(type === 'unknown' ? 'player' : type, previous.question || text, players, ctx);
    if (answer.context === false) return answer;
    return { ...answer, context: { type, players: players.map((f) => f.player), ...(answer.context || {}), question: previous.question } };
  }
  if (!found.length && !position && previous.players?.length && !/\b(he|him|his|they|them|their)\b/.test(t)) {
    const again = previous.players.slice(0, 3).map((player) => ({ player, alternatives: [], at: 0 }));
    const type = questionType(text.replace(WHAT_ABOUT, ''), again);
    if (['player', 'unknown', 'compare'].includes(type)) return null;
    const answer = answerByType(type, text, again, ctx);
    return { ...answer, context: { type, players: again.map((f) => f.player), ...(answer.context || {}) } };
  }
  if (position && previous.question && !found.length) {
    const question = withPosition(previous.question, position);
    const answer = answerFresh(question, { ...ctx, previous: null });
    return { ...answer, context: { ...(answer.context || {}), question } };
  }
  return null;
}

function answerByType(type, text, found, ctx) {
  const single = (fn) => (found.length ? fn() : missed());
  const t = tidy(text);
  const teamName = () => teamsNamed(text, (ctx.partnerNames || []).map((name) => ({ name })))[0]?.name || null;
  switch (type) {
    case 'help': return { ...helpAnswer('Ask me anything about your team: a player, your lineup, a trade, the waiver wire or your league. For example:', HELP_EXAMPLES), context: false };
    case 'smalltalk': return /^(thanks|thank you|thx|ty)\b/.test(t)
      ? { text: 'Anytime. Good luck this week!', context: false }
      : { ...helpAnswer('Hey! Ask me anything about your team. For example:'), context: false };
    case 'accuracy': return { text: 'Tap "Check past weeks" in the "How accurate are we?" card at the bottom of this page to see how our projections and calls did this season.', scrollTo: 'startsit-accuracy', context: false };
    case 'bye': return answerByes(text, found, ctx);
    case 'trade': return answerTrade(text, found, ctx);
    case 'availability': return single(() => answerAvailability(found, ctx));
    case 'handcuff': {
      if (found.length) return answerHandcuff(found, ctx);
      const rb = ctx.lineup.starters.map((s) => s.player).find((p) => p?.position === 'RB');
      return rb ? answerHandcuff([{ player: rb, alternatives: [] }], ctx) : { text: 'Name a player, like "who is the handcuff for Kyren Williams?"' };
    }
    case 'pickup': return answerPickup(text, ctx);
    case 'drop': return answerDrop(found, ctx);
    case 'buylow': return answerMarketList(text, ctx, 'buy');
    case 'sellhigh': return answerMarketList(text, ctx, 'sell');
    case 'teaminjuries': return answerTeamInjuries(ctx);
    case 'defenses': return answerDefenses(text, ctx);
    case 'matchuplist': return answerMatchupList(text, ctx);
    case 'rankings': return answerRankings(text, ctx);
    case 'needs': return answerNeeds(text, ctx, teamName());
    case 'bench': return answerBench(ctx);
    case 'trending': return answerTrending(text, ctx);
    case 'weakest': return answerWeakestStarter(ctx);
    case 'best': return answerBestPlayers(ctx);
    case 'plan': return answerPlan(ctx);
    case 'compare': return found.length >= 2 ? answerCompare(found, ctx) : single(() => answerPlayer(found, ctx));
    case 'comparevalue': return answerCompareLong(found, 'value', ctx);
    case 'compareschedule': return answerCompareLong(found, 'schedule', ctx);
    case 'compareusage': return answerCompareLong(found, 'usage', ctx);
    case 'compareceiling': return answerCompareLong(found, 'ceiling', ctx);
    case 'comparefloor': return answerCompareLong(found, 'floor', ctx);
    case 'lineup': return answerLineup(text, ctx);
    case 'injury': return single(() => answerInjury(found, ctx));
    case 'replace': return single(() => answerReplace(found, ctx));
    case 'matchup': return single(() => answerMatchup(found, ctx));
    case 'schedule': return single(() => answerSchedule(found, ctx));
    case 'rank': return single(() => answerRank(text, found, ctx));
    case 'value': return single(() => answerValue(text, found, ctx));
    case 'stats': return single(() => answerStats(found, ctx));
    case 'player': return single(() => answerPlayer(found, ctx));
    case 'news': return answerNews(found, ctx);
    case 'weather': return answerWeather(found, ctx);
    case 'vegas': return answerVegas(found, ctx);
    case 'rules': return answerRules(text, ctx);
    case 'about': return { ...answerAbout(text), context: false };
    default: return missed();
  }
}
