import {
  analyzeTrade, balanceTrade, buildLineup, findTrades, lineupChanges, teamNeeds,
} from './startSitUtils';

const player = (id, position, avg, extra = {}) => ({
  id, name: id, position, points: avg, seasonAvg: { ppr: avg }, gamesPlayed: 5, ...extra,
});
const slots = (defs) => ({ slots: defs.map(([label, positions]) => ({ label, positions })) });

const SUPERFLEX = slots([
  ['QB', ['QB']], ['RB', ['RB']], ['RB', ['RB']], ['WR', ['WR']], ['WR', ['WR']], ['TE', ['TE']],
  ['FLEX', ['RB', 'WR', 'TE']], ['FLEX', ['RB', 'WR', 'TE']], ['FLEX', ['RB', 'WR', 'TE']], ['SUPERFLEX', ['QB', 'RB', 'WR', 'TE']],
]);
const STANDARD = slots([
  ['QB', ['QB']], ['RB', ['RB']], ['RB', ['RB']], ['WR', ['WR']], ['WR', ['WR']], ['TE', ['TE']], ['FLEX', ['RB', 'WR', 'TE']],
]);

describe('lineupChanges', () => {
  const roster = [
    player('Stafford', 'QB', 20.9), player('Hurts', 'QB', 0, { injury: 'Out' }), player('Cousins', 'QB', 17.2),
    player('CMC', 'RB', 16.2), player('Spears', 'RB', 6.3), player('Evans', 'WR', 13.8), player('Golden', 'WR', 12.2),
    player('Kelce', 'TE', 10), player('Goedert', 'TE', 9.1), player('Strange', 'TE', 8.8), player('Kupp', 'WR', 5.8),
    player('Boutte', 'WR', 3.9),
  ];
  const lineup = buildLineup(roster, SUPERFLEX);
  const describe = (changes) => changes.map((c) => (c.start ? `${c.start.id}>${c.sit ? c.sit.id : '-'}${c.shuffle ? '*' : ''}` : `bench ${c.sit.id}`));

  test('pairs a QB with the QB it replaces, not a TE with a QB', () => {
    const current = ['Hurts', 'CMC', 'Spears', 'Evans', 'Golden', 'Goedert', 'Boutte', 'Strange', 'Kupp', 'Stafford'];
    expect(describe(lineupChanges(lineup, current, roster, current))).toEqual(['Cousins>Hurts', 'Kelce>Boutte']);
  });

  test('flags a swap that needs other starters to change slots', () => {
    const current = ['Stafford', 'CMC', 'Spears', 'Evans', 'Boutte', 'Goedert', 'Golden', 'Strange', 'Kupp', 'Hurts'];
    expect(describe(lineupChanges(lineup, current, roster, current))).toEqual(['Cousins>Hurts', 'Kelce>Boutte*']);
  });

  test('without slot info still prefers same-position swaps', () => {
    const current = ['Stafford', 'CMC', 'Spears', 'Evans', 'Boutte', 'Goedert', 'Golden', 'Strange', 'Kupp', 'Hurts'];
    expect(describe(lineupChanges(lineup, current, roster))).toEqual(['Cousins>Hurts', 'Kelce>Boutte']);
  });

  test('fills empty slots and lists extra benchings', () => {
    const current = ['Stafford', 'CMC', 'Spears', 'Evans', 'Golden', 'Kelce', 'Goedert', 'Strange', 'Kupp', null];
    expect(describe(lineupChanges(lineup, current.filter(Boolean), roster, current))).toEqual(['Cousins>-']);
  });

  test('says nothing when the lineup already matches', () => {
    const current = lineup.starters.map((s) => s.player.id);
    expect(lineupChanges(lineup, current, roster, current)).toEqual([]);
  });
});

// A 10-team league where every team has the same shape, so values are easy to reason about.
const league = () => {
  const mine = [
    player('myQB', 'QB', 20), player('myRB1', 'RB', 16), player('myRB2', 'RB', 6), player('myWR1', 'WR', 15),
    player('myWR2', 'WR', 14), player('myWR3', 'WR', 13), player('myWR4', 'WR', 12), player('myTE', 'TE', 9),
  ];
  const theirs = [
    player('thQB', 'QB', 19), player('thRB1', 'RB', 14), player('thRB2', 'RB', 13), player('thRB3', 'RB', 12),
    player('thWR1', 'WR', 11), player('thWR2', 'WR', 10), player('thTE', 'TE', 8),
  ];
  const filler = Array.from({ length: 60 }, (_, i) => player(`f${i}`, ['QB', 'RB', 'WR', 'TE'][i % 4], 8 - i * 0.1));
  return { mine, theirs, all: [...mine, ...theirs, ...filler] };
};
const trade = (giveIds, getIds, extra = {}) => {
  const { mine, theirs, all } = league();
  return {
    give: mine.filter((p) => giveIds.includes(p.id)),
    get: theirs.filter((p) => getIds.includes(p.id)),
    myRoster: mine, theirRoster: theirs, rosterSettings: STANDARD, scoring: 'ppr', allPlayers: all, teamCount: 10,
    ...extra,
  };
};

describe('analyzeTrade roster fit', () => {
  test('a fair trade that fills a weak starting spot is good for your team', () => {
    const result = analyzeTrade(trade(['myWR3'], ['thRB3']));
    expect(result.valueVerdict.tone).toBe('fair');
    expect(result.myChange).toBeGreaterThan(1.5);
    expect(result.verdict.label).toBe('Good trade for your team');
    expect(result.get[0].role).toBe('would start at RB');
    expect(result.give[0].role).toBe('your starting FLEX');
  });

  test('getting a player who would sit on your bench says so', () => {
    const result = analyzeTrade(trade(['myWR4'], ['thWR2']));
    expect(result.get[0].role).toBe('would sit on your bench');
    expect(result.verdict.detail).toMatch(/would sit on your bench/);
  });

  test('losing a starter for a backup hurts your lineup', () => {
    const result = analyzeTrade(trade(['myWR1'], ['thWR1']));
    expect(result.myChange).toBeLessThan(0);
    expect(result.verdict.tone).toBe('lose');
  });
});

describe('balanceTrade', () => {
  test('returns nothing for a trade that is already fair', () => {
    expect(balanceTrade(trade(['myWR3'], ['thRB3']))).toEqual([]);
  });

  test('suggests something to ask for when you give more', () => {
    const args = trade(['myWR1', 'myWR2'], ['thWR2']);
    expect(analyzeTrade(args).share).toBeLessThan(-0.15);
    const options = balanceTrade(args);
    expect(options.length).toBeGreaterThan(0);
    options.forEach((option) => {
      expect(Math.abs(option.share)).toBeLessThanOrEqual(0.15);
      expect(['get', 'give']).toContain(option.side);
    });
    // Applying the first suggestion really does make it fair.
    const first = options[0];
    const applied = first.action === 'add'
      ? { ...args, get: [...args.get, first.item] }
      : { ...args, give: args.give.filter((p) => p.id !== first.item.id) };
    expect(Math.abs(analyzeTrade(applied).share)).toBeLessThanOrEqual(0.15);
  });

  test('can add a draft pick in dynasty leagues', () => {
    const pick = { id: '2027-1-them', season: 2027, round: 1, originalTeam: 'Them' };
    const args = trade(['myWR1'], ['thWR2'], { dynasty: true, firstPickSeason: 2027 });
    const options = balanceTrade({ ...args, theirPickPool: [pick] });
    expect(options.some((o) => o.item.id === pick.id)).toBe(true);
  });
});

describe('findTrades', () => {
  test('finds trades that help your lineup and are fair enough to accept', () => {
    const { mine, theirs, all } = league();
    const ideas = findTrades({
      myRoster: mine, partners: [{ key: 'p1', name: 'Them', roster: theirs }], rosterSettings: STANDARD, scoring: 'ppr', allPlayers: all,
    });
    expect(ideas.length).toBeGreaterThan(0);
    expect(ideas.length).toBeLessThanOrEqual(2);
    ideas.forEach((idea) => {
      expect(idea.partnerName).toBe('Them');
      expect(idea.myChange).toBeGreaterThanOrEqual(1);
      expect(idea.theirChange).toBeGreaterThanOrEqual(-1);
    });
    // The obvious fit: some of your spare WR depth for one of their spare RBs.
    expect(ideas[0].get.map((p) => p.position)).toEqual(['RB']);
    expect(ideas[0].give.some((p) => p.position === 'WR')).toBe(true);
  });

  test('finds nothing when no trade helps', () => {
    const solo = [player('a', 'QB', 20)];
    expect(findTrades({
      myRoster: solo, partners: [{ key: 'p', name: 'P', roster: [player('b', 'K', 9)] }], rosterSettings: STANDARD, scoring: 'ppr', allPlayers: solo,
    })).toEqual([]);
  });
});

describe('teamNeeds', () => {
  test('ranks each team by position and marks strengths and needs', () => {
    const { mine, theirs } = league();
    const weak = [player('wQB', 'QB', 10), player('wRB', 'RB', 5), player('wRB2', 'RB', 4), player('wWR', 'WR', 6),
      player('wWR2', 'WR', 5), player('wTE', 'TE', 3), player('wWR3', 'WR', 4)];
    const needs = teamNeeds({
      teams: [{ key: 'me', name: 'Me', roster: mine, mine: true }, { key: 'them', name: 'Them', roster: theirs }, { key: 'weak', name: 'Weak', roster: weak }],
      rosterSettings: STANDARD,
      scoring: 'ppr',
    });
    const row = (key) => needs.rows.find((r) => r.key === key);
    expect(needs.positions).toEqual(['QB', 'RB', 'WR', 'TE']);
    expect(row('me').cells.WR).toMatchObject({ rank: 1, tier: 'strong' });
    expect(row('them').cells.RB).toMatchObject({ rank: 1, tier: 'strong' });
    expect(row('weak').cells.QB).toMatchObject({ rank: 3, tier: 'weak' });
    expect(row('me').mine).toBe(true);
    expect(needs.rows[needs.rows.length - 1].key).toBe('weak');
  });
});
