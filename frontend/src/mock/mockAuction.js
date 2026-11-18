// Guest mock auction draft: you against 9 bots, no sign-in, nothing saved. Pure logic so it can be tested.
// Each player goes up for auction; bots value players by rank (the same estimate the Auction Lab uses),
// with a personality and what their roster still needs. You raise or pass; bots answer right away.
import { getEstimatedAuctionValue } from '../data/strategyUtils';

export const BUDGET = 200;
export const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN', 'BN'];
export const BOT_NAMES = ['Value Hawk', 'Stars Scrambler', 'Late-Round Larry', 'Zero-RB Zach', 'Homer Hank', 'Spreadsheet Sue', 'Big Spender Bo', 'Patient Pat', 'Rookie Rita'];
const STYLE = [0.92, 1.18, 0.85, 1.0, 1.05, 0.98, 1.25, 0.9, 1.08];
const FLEX = ['RB', 'WR', 'TE'];
const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

export const mulberry = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Which open slot a player would fill on a roster, or null when it's full for them. */
export function slotFor(roster, position) {
  const used = SLOTS.map(() => false);
  roster.forEach((pick) => { if (pick.slot >= 0) used[pick.slot] = true; });
  const open = (want) => SLOTS.findIndex((s, i) => !used[i] && s === want);
  let i = open(position);
  if (i < 0 && FLEX.includes(position)) i = open('FLEX');
  if (i < 0) i = open('BN');
  return i < 0 ? null : i;
}

export const spotsLeft = (team) => SLOTS.length - team.roster.length;
/** The most a team can bid and still fill every other spot at $1. */
export const maxBid = (team) => (spotsLeft(team) <= 0 ? 0 : team.budget - (spotsLeft(team) - 1));

export function newDraft(players, seed = Date.now()) {
  const rand = mulberry(seed);
  const pool = players
    .filter((p) => POSITIONS.includes(p.position))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 160)
    .map((p) => ({ ...p, value: getEstimatedAuctionValue({ ...p, scoringRank: p.rank }) }));
  const teams = [{ id: 'you', name: 'You', bot: false, budget: BUDGET, roster: [] }]
    .concat(BOT_NAMES.map((name, i) => ({ id: `bot${i}`, name, bot: true, style: STYLE[i] * (0.94 + rand() * 0.12), budget: BUDGET, roster: [] })));
  const d = { seed, rand, pool, teams, lot: null, log: [], nominator: Math.floor(rand() * teams.length), done: false };
  nextLot(d);
  return d;
}

/** What a bot would pay, at most, for this player right now. */
export function botLimit(d, team, player) {
  if (slotFor(team.roster, player.position) === null) return 0;
  const slot = SLOTS[slotFor(team.roster, player.position)];
  let want = player.value * team.style;
  if (slot === 'BN') want *= 0.45;
  if (player.position === 'QB' && team.roster.some((p) => p.player.position === 'QB')) want *= 0.3;
  // A little noise per bot and player, the same every time it's asked.
  const noise = mulberry(d.seed ^ (player.rank * 131) ^ (team.id.charCodeAt(3) * 7919))();
  want *= 0.9 + noise * 0.2;
  return Math.max(1, Math.min(maxBid(team), Math.round(want)));
}

const available = (d) => d.pool.filter((p) => !d.log.some((l) => l.player.id === p.id));
export const youOf = (d) => d.teams[0];

function nextLot(d) {
  const open = d.teams.filter((t) => spotsLeft(t) > 0);
  if (!open.length || !available(d).length) { d.lot = null; d.done = true; return; }
  // Nominations go around the table, skipping full rosters.
  let n = d.nominator;
  for (let k = 0; k < d.teams.length; k += 1) {
    n = (n + 1) % d.teams.length;
    if (spotsLeft(d.teams[n]) > 0) break;
  }
  d.nominator = n;
  const team = d.teams[n];
  if (!team.bot) { d.lot = { player: null, price: 0, leader: null, yourTurn: true }; return; }
  // Bots nominate one of the best few players left that fits their roster.
  const fits = available(d).filter((p) => slotFor(team.roster, p.position) !== null).slice(0, 4);
  const player = fits[Math.floor(d.rand() * fits.length)] || available(d)[0];
  d.lot = { player, price: 1, leader: team.id, yourTurn: false };
}

/** You put a player up (when it's your turn to nominate) with an opening bid. */
export function nominate(d, playerId, opening = 1) {
  const player = available(d).find((p) => p.id === playerId);
  const you = youOf(d);
  if (!player || !d.lot?.yourTurn || slotFor(you.roster, player.position) === null) return d;
  d.lot = { player, price: Math.max(1, Math.min(maxBid(you), opening)), leader: 'you', yourTurn: false };
  return answer(d);
}

/** You raise to `amount`. Bots answer at once; if nobody tops you, you're still leading. */
export function bid(d, amount) {
  const you = youOf(d);
  if (!d.lot?.player || d.lot.leader === 'you') return d;
  const cap = maxBid(you);
  if (slotFor(you.roster, d.lot.player.position) === null || amount <= d.lot.price || amount > cap) return d;
  d.lot = { ...d.lot, price: amount, leader: 'you' };
  return answer(d);
}

/** The bot that wants the player most raises by $1, if it is still under its limit. */
function answer(d) {
  const { player, price } = d.lot;
  const best = d.teams
    .filter((t) => t.bot && t.id !== d.lot.leader)
    .map((t) => ({ t, limit: botLimit(d, t, player) }))
    .sort((a, b) => b.limit - a.limit)[0];
  if (best && best.limit > price) d.lot = { ...d.lot, price: price + 1, leader: best.t.id };
  return d;
}

/** Ends the auction: whoever leads wins. When a bot leads and you let it go, bots bid it up among themselves. */
export function sold(d) {
  if (!d.lot?.player) return d;
  let { price, leader } = d.lot;
  if (leader !== 'you') {
    const limits = d.teams.filter((t) => t.bot)
      .map((t) => ({ t, limit: botLimit(d, t, d.lot.player) }))
      .filter((x) => x.limit > 0)
      .sort((a, b) => b.limit - a.limit);
    if (limits.length) {
      leader = limits[0].t.id;
      price = Math.max(price, Math.min(limits[0].limit, (limits[1]?.limit || 0) + 1));
    }
  }
  const team = d.teams.find((t) => t.id === leader);
  const slot = slotFor(team.roster, d.lot.player.position);
  if (slot === null) { d.lot = null; nextLot(d); return d; }
  team.budget -= price;
  team.roster.push({ player: d.lot.player, price, slot });
  d.log.push({ player: d.lot.player, price, teamId: team.id });
  nextLot(d);
  return d;
}

/** Fills your empty spots with $1 players and lets the bots finish. */
export function finish(d) {
  let guard = 0;
  while (!d.done && guard < 400) {
    guard += 1;
    if (d.lot?.yourTurn) {
      const you = youOf(d);
      const pick = available(d).find((p) => slotFor(you.roster, p.position) !== null && d.teams.slice(1).every((t) => botLimit(d, t, p) <= 1));
      const p = pick || available(d).find((x) => slotFor(you.roster, x.position) !== null);
      if (!p) { d.lot = null; d.nominator = 0; nextLot(d); continue; }
      d.lot = { player: p, price: 1, leader: 'you', yourTurn: false };
      if (pick) { sold(d); continue; }
      answer(d);
    }
    sold(d);
  }
  return d;
}

/** Players you can nominate now, best first. */
export const nominationChoices = (d) => available(d).filter((p) => slotFor(youOf(d).roster, p.position) !== null).slice(0, 30);

/** Your result: value you got for what you spent, and a grade. */
export function grade(d) {
  const you = youOf(d);
  const value = you.roster.reduce((s, p) => s + p.player.value, 0);
  const spent = BUDGET - you.budget;
  const rank = [...d.teams]
    .map((t) => ({ id: t.id, value: t.roster.reduce((s, p) => s + p.player.value, 0) }))
    .sort((a, b) => b.value - a.value)
    .findIndex((t) => t.id === 'you') + 1;
  const letter = rank <= 1 ? 'A+' : rank <= 2 ? 'A' : rank <= 4 ? 'B' : rank <= 7 ? 'C' : 'D';
  return { value, spent, rank, letter };
}
