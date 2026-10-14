// League-specific scoring for Start/Sit, Rankings and the trade check. The API sends PPR, half-PPR
// and standard points plus each player's box score; a league whose rules differ from those (6-point
// passing TDs, TE premium, fumble penalties...) gets its own points by adjusting the closest standard
// format by the box-score difference. Kickers and defenses keep the standard points.
import { createContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../api';
import { SCORING_OPTIONS } from './startSitUtils';

const LEAGUE_PREFIX = 'league:';

/** The active league scoring profile (or null for a standard format), for components deep in a page. */
export const LeagueScoringContext = createContext(null);
const SCORING_SETTING = 'hl-startsit-scoring';
const SLEEPER_USER_SETTING = 'hl-startsit-sleeper-user';

// Points per stat in Sleeper's default scoring, before the reception value.
const STANDARD_WEIGHTS = {
  passYd: 0.04, passTd: 4, int: -1, rushYd: 0.1, rushTd: 6, rushAtt: 0, recYd: 0.1, recTd: 6, fumLost: -2, twoPt: 2,
};
const RECEPTION = { ppr: 1, half: 0.5, std: 0 };
// Sleeper scoring_settings key -> box score key.
const SETTING_KEYS = {
  pass_yd: 'passYd', pass_td: 'passTd', pass_int: 'int', rush_yd: 'rushYd', rush_td: 'rushTd', rush_att: 'rushAtt',
  rec_yd: 'recYd', rec_td: 'recTd', fum_lost: 'fumLost', rush_2pt: 'twoPt',
};
const BONUS_KEYS = { TE: 'bonus_rec_te', RB: 'bonus_rec_rb', WR: 'bonus_rec_wr' };

const round1 = (n) => Math.round(n * 10) / 10;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const describe = (diffs, bonus, rec, base) => {
  const parts = [];
  if (diffs.passTd != null) parts.push(`${plural(diffs.passTd, 'pt')} per passing TD`);
  if (diffs.passYd != null) parts.push(`1 pt per ${round1(1 / diffs.passYd)} passing yds`);
  if (diffs.int != null) parts.push(`${diffs.int} per interception`);
  if (diffs.rushTd != null) parts.push(`${plural(diffs.rushTd, 'pt')} per rushing TD`);
  if (diffs.recTd != null) parts.push(`${plural(diffs.recTd, 'pt')} per receiving TD`);
  if (diffs.rushYd != null) parts.push(`1 pt per ${round1(1 / diffs.rushYd)} rushing yds`);
  if (diffs.recYd != null) parts.push(`1 pt per ${round1(1 / diffs.recYd)} receiving yds`);
  if (diffs.rushAtt != null) parts.push(`${diffs.rushAtt} per carry`);
  if (diffs.fumLost != null) parts.push(`${diffs.fumLost} per lost fumble`);
  if (diffs.twoPt != null) parts.push(`${diffs.twoPt} per 2-pt conversion`);
  if (!near(rec, RECEPTION[base])) parts.push(`${rec} per catch`);
  Object.entries(bonus).forEach(([pos, value]) => { if (value) parts.push(`${pos} premium +${value} per catch`); });
  return parts;
};

/**
 * Scoring profile for an imported Sleeper team. key is what the points objects are indexed by: the
 * standard format ('ppr', 'half', 'std') when the league matches it, else `league:<leagueId>`.
 */
export const leagueProfile = (team) => {
  const settings = team?.scoringSettings || {};
  const rec = Number.isFinite(settings.rec) ? settings.rec : RECEPTION[team?.scoring] ?? 1;
  const base = rec >= 0.75 ? 'ppr' : rec >= 0.25 ? 'half' : 'std';
  const weights = { ...STANDARD_WEIGHTS };
  Object.entries(SETTING_KEYS).forEach(([setting, key]) => {
    if (Number.isFinite(settings[setting])) weights[key] = settings[setting];
  });
  const diffs = {};
  Object.keys(STANDARD_WEIGHTS).forEach((key) => { if (!near(weights[key], STANDARD_WEIGHTS[key])) diffs[key] = weights[key]; });
  const bonus = {};
  Object.entries(BONUS_KEYS).forEach(([pos, setting]) => { if (settings[setting]) bonus[pos] = settings[setting]; });
  const details = describe(diffs, bonus, rec, base);
  const custom = Object.keys(diffs).length > 0 || Object.keys(bonus).length > 0 || !near(rec, RECEPTION[base]);
  return {
    value: `${LEAGUE_PREFIX}${team?.leagueId}`,
    key: custom ? `${LEAGUE_PREFIX}${team?.leagueId}` : base,
    base,
    custom,
    leagueName: team?.leagueName || 'League',
    label: `${team?.leagueName || 'League'} scoring`,
    details,
    weights,
    rec,
    bonus,
  };
};

/** Points this league scores on top of its base format for one box score. */
const adjustment = (stats, position, profile) => {
  if (!stats) return 0;
  let total = 0;
  Object.keys(STANDARD_WEIGHTS).forEach((key) => {
    total += (profile.weights[key] - STANDARD_WEIGHTS[key]) * (stats[key] || 0);
  });
  total += (profile.rec - RECEPTION[profile.base] + (profile.bonus[position] || 0)) * (stats.rec || 0);
  return total;
};

/** Adds the league's points to a { ppr, half, std } points object, using that game's box score. */
export const withLeaguePoints = (points, stats, position, profile) => {
  if (!points || !profile?.custom) return points;
  return { ...points, [profile.key]: round1((points[profile.base] ?? 0) + adjustment(stats, position, profile)) };
};

/** The /startsit response with every player's projection, recent games and season average (and the defense table) scored for the league. */
export const applyLeagueScoring = (projections, profile) => {
  if (!projections || !profile?.custom) return projections;
  const players = (projections.players || []).map((p) => ({
    ...p,
    points: withLeaguePoints(p.points, p.stats, p.position, profile),
    seasonAvg: withLeaguePoints(p.seasonAvg, p.seasonStats, p.position, profile),
    recent: (p.recent || []).map((game) => ({ ...game, points: withLeaguePoints(game.points, game.stats, p.position, profile) })),
    upcoming: (p.upcoming || []).map((game) => ({ ...game, points: withLeaguePoints(game.points, game.stats, p.position, profile) })),
  }));
  const defense = {};
  Object.entries(projections.defense || {}).forEach(([team, byPosition]) => {
    defense[team] = {};
    Object.entries(byPosition).forEach(([position, entry]) => {
      defense[team][position] = {
        ...entry,
        points: withLeaguePoints(entry.points, entry.box, position, profile),
        top: (entry.top || []).map((game) => ({ ...game, points: withLeaguePoints(game.points, game.box, position, profile) })),
      };
    });
  });
  return { ...projections, players, defense };
};

/** Past games against an opponent, scored for the league. */
export const applyLeagueScoringToMatchup = (matchup, position, profile) => {
  if (!matchup || !profile?.custom) return matchup;
  const games = (matchup.games || []).map((game) => ({ ...game, points: withLeaguePoints(game.points, game.box, position, profile) }));
  const average = games.length
    ? { ...matchup.average, [profile.key]: round1(games.reduce((sum, g) => sum + (g.points[profile.key] || 0), 0) / games.length) }
    : matchup.average;
  return { ...matchup, games, average };
};

const readSetting = (key, fallback) => {
  try {
    const value = window.localStorage.getItem(key);
    return value == null ? fallback : JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};
const writeSetting = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Storage can be blocked (private windows); nothing to do.
  }
};

/**
 * The scoring choice shared by Start/Sit and Rankings: a standard format or one of the imported
 * Sleeper leagues. Remembered in the browser, so picking a league on one page carries to the other.
 * Returns the choice, the key points are indexed by, the league profile and the dropdown options.
 */
export const useLeagueScoring = (sleeperTeams = []) => {
  const [choice, setChoice] = useState(() => readSetting(SCORING_SETTING, 'ppr'));
  useEffect(() => writeSetting(SCORING_SETTING, choice), [choice]);
  const profiles = useMemo(() => sleeperTeams.map(leagueProfile), [sleeperTeams]);
  const profile = profiles.find((p) => p.value === choice) || null;
  const isStandard = SCORING_OPTIONS.some((o) => o.value === choice);
  // A league that isn't loaded (yet) falls back to PPR.
  const scoring = profile ? profile.key : (isStandard ? choice : 'ppr');
  const options = [
    ...profiles.map((p) => ({ value: p.value, label: `${p.leagueName} (league)` })),
    ...SCORING_OPTIONS,
  ];
  return {
    choice: profile || isStandard ? choice : 'ppr', setChoice, scoring, profile, options, leagueValue: (leagueId) => `${LEAGUE_PREFIX}${leagueId}`,
  };
};

/** The viewer's Sleeper teams, from the username saved on Start/Sit (none when they haven't imported). */
export const useSavedSleeperTeams = () => {
  const [teams, setTeams] = useState([]);
  useEffect(() => {
    const username = readSetting(SLEEPER_USER_SETTING, '');
    if (!username) return undefined;
    let cancelled = false;
    axios.get(`${API_BASE_URL}/startsit/sleeper?username=${encodeURIComponent(username)}`)
      .then((response) => {
        if (cancelled) return;
        // Each team carries when its rosters were read, for "Rosters checked" labels.
        setTeams((response.data?.teams || []).map((team) => ({ ...team, fetchedAt: response.data.fetchedAt })));
      })
      .catch(() => { /* Rankings still works with the standard formats. */ });
    return () => { cancelled = true; };
  }, []);
  return teams;
};
