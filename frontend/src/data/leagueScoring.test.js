import { applyLeagueScoring, applyLeagueScoringToMatchup, leagueProfile } from './leagueScoring';

const team = (scoringSettings) => ({ leagueId: 'L1', leagueName: 'Dynasty', scoring: 'ppr', scoringSettings });

test('a league that matches a standard format keeps that format', () => {
  const profile = leagueProfile(team({ rec: 0.5, pass_td: 4 }));
  expect(profile.custom).toBe(false);
  expect(profile.key).toBe('half');
});

test('6-point passing TDs and TE premium give the league its own key and description', () => {
  const profile = leagueProfile(team({ rec: 1, pass_td: 6, bonus_rec_te: 0.5 }));
  expect(profile.custom).toBe(true);
  expect(profile.key).toBe('league:L1');
  expect(profile.details).toEqual(['6 pts per passing TD', 'TE premium +0.5 per catch']);
});

test('projections, recent games, season averages and defense are rescored from box scores', () => {
  const profile = leagueProfile(team({ rec: 1, pass_td: 6, bonus_rec_te: 0.5 }));
  const projections = {
    players: [
      {
        id: 'qb', position: 'QB', points: { ppr: 20, half: 20, std: 20 }, stats: { passTd: 2 },
        seasonAvg: { ppr: 18, half: 18, std: 18 }, seasonStats: { passTd: 1.5 },
        recent: [{ week: 1, points: { ppr: 22, half: 22, std: 22 }, stats: { passTd: 3 } }],
      },
      {
        id: 'te', position: 'TE', points: { ppr: 10, half: 8, std: 6 }, stats: { rec: 4 },
        seasonAvg: null, seasonStats: null, recent: [],
      },
      { id: 'k', position: 'K', points: { ppr: 8, half: 8, std: 8 }, stats: {}, recent: [] },
    ],
    defense: { KC: { TE: { points: { ppr: 12, half: 10, std: 8 }, box: { rec: 4 } } } },
  };
  const out = applyLeagueScoring(projections, profile);
  const [qb, te, k] = out.players;
  expect(qb.points['league:L1']).toBe(24);
  expect(qb.seasonAvg['league:L1']).toBe(21);
  expect(qb.recent[0].points['league:L1']).toBe(28);
  expect(te.points['league:L1']).toBe(12);
  expect(te.seasonAvg).toBeNull();
  expect(k.points['league:L1']).toBe(8);
  expect(out.defense.KC.TE.points['league:L1']).toBe(14);
});

test('half-PPR base plus a lost-fumble penalty', () => {
  const profile = leagueProfile(team({ rec: 0.5, fum_lost: -1 }));
  expect(profile.base).toBe('half');
  const out = applyLeagueScoring({ players: [{ id: 'rb', position: 'RB', points: { ppr: 15, half: 13, std: 11 }, stats: { rec: 4, fumLost: 1 } }] }, profile);
  expect(out.players[0].points['league:L1']).toBe(14);
});

test('past matchups get the league average', () => {
  const profile = leagueProfile(team({ rec: 1, pass_td: 6 }));
  const matchup = {
    games: [
      { points: { ppr: 20, half: 20, std: 20 }, box: { passTd: 2 } },
      { points: { ppr: 10, half: 10, std: 10 }, box: { passTd: 0 } },
    ],
    average: { ppr: 15, half: 15, std: 15 },
  };
  const out = applyLeagueScoringToMatchup(matchup, 'QB', profile);
  expect(out.games[0].points['league:L1']).toBe(24);
  expect(out.average['league:L1']).toBe(17);
});

test('standard formats leave the data untouched', () => {
  const projections = { players: [] };
  expect(applyLeagueScoring(projections, null)).toBe(projections);
});
