import React, { useEffect, useMemo, useState } from 'react';
import { playerInsightsMeta, playerStatsById, positionAverages } from '../data/playerInsights';
import { getEstimatedAuctionValue, getPlayerAvailability } from '../data/strategyUtils';
import UpdatedAt from './UpdatedAt';
import './PlayerComparison.css';

const SLEEPER_PLAYER_STATS_BASE_URL = 'https://api.sleeper.app/stats/nfl/player';
const liveStatsCache = new Map();
// When each cached live stat line was fetched, keyed like liveStatsCache.
const liveStatsFetchedAt = new Map();

const PlayerComparison = ({ players, allPlayers = [], scoringLabel, maxPlayers = 3, onRemove, onClear }) => {
  const statsSeason = String(playerInsightsMeta.statsSeason || getDefaultStatsSeason());
  const liveStatsState = useLivePlayerStats(players, statsSeason);
  const playersWithStats = useMemo(
    () => hydratePlayersWithStats(players, liveStatsState.byPlayerId),
    [players, liveStatsState.byPlayerId]
  );
  const positionRanks = useMemo(() => buildPositionRankMap(allPlayers), [allPlayers]);
  const analysis = useMemo(() => buildComparisonAnalysis(playersWithStats, positionRanks), [playersWithStats, positionRanks]);
  const comparisonRows = getComparisonRows(scoringLabel, statsSeason);
  const statsStatus = getStatsStatus(playersWithStats, liveStatsState, statsSeason);

  if (!players || players.length === 0) return null;

  return (
    <div className="compare-panel">
      <div className="compare-header">
        <div>
          <p className="section-kicker">Side-by-side</p>
          <h3>Player Comparison</h3>
        </div>
        <button type="button" className="compare-clear-btn" onClick={onClear}>
          Clear All
        </button>
      </div>

      {playersWithStats.length < 2 ? (
        <div className="compare-empty-state">
          <strong>{playersWithStats[0].name} is ready to compare.</strong>
          <span>Select {maxPlayers - playersWithStats.length === 1 ? '1 more player' : `up to ${maxPlayers - playersWithStats.length} more players`} for the side-by-side view.</span>
        </div>
      ) : (
        <>
          <div className="compare-insight-grid" aria-label="Comparison summary">
            <ComparisonInsight label="Best Rank" value={formatPlayerRank(analysis.bestOverall)} />
            <ComparisonInsight label="Best Value" value={formatPlayerValue(analysis.bestValue)} />
            <ComparisonInsight label="Bye Overlap" value={analysis.byeOverlapLabel} tone={analysis.hasByeOverlap ? 'warn' : 'good'} />
            <ComparisonInsight label="Positions" value={analysis.positionMix} />
            <ComparisonInsight label="Stats" value={statsStatus.label} tone={statsStatus.tone} />
          </div>

          <div className="updated-row">
            {liveStatsState.fetchedAt && <UpdatedAt at={liveStatsState.fetchedAt} label={`${statsSeason} stats updated`} />}
            {!liveStatsState.fetchedAt && !liveStatsState.loading && (
              <UpdatedAt at={playerInsightsMeta.generatedAt} label={`${statsSeason} stats snapshot taken`} staleAfterHours={8 * 24} />
            )}
            <UpdatedAt at={playerInsightsMeta.playerPoolFetchedAt || playerInsightsMeta.generatedAt} label="Ranks and ADP updated" staleAfterHours={8 * 24} />
          </div>

          <div className="compare-table-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  <th className="compare-label-col">Metric</th>
                  {playersWithStats.map((player) => (
                    <th key={player.id} className="compare-player-col">
                      <div className="compare-player-header">
                        <span className="compare-player-name">{player.name}</span>
                        <button
                          type="button"
                          className="compare-remove-btn"
                          onClick={() => onRemove(player.id)}
                          aria-label={`Remove ${player.name}`}
                        >
                          &times;
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.key}>
                    <td className="compare-label-cell">{row.label}</td>
                    {playersWithStats.map((player) => (
                      <td key={player.id} className={getCellClassName(row, player, analysis, playersWithStats)}>
                        <CompareValue player={player} row={row} analysis={analysis} positionRanks={positionRanks} statsLoading={liveStatsState.loading} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

const ComparisonInsight = ({ label, value, tone }) => (
  <div className={`compare-insight${tone ? ` ${tone}` : ''}`}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const CompareValue = ({ player, row, analysis, positionRanks, statsLoading }) => {
  if (row.type === 'stat') {
    return <StatValue stat={row.render(player)} loading={statsLoading} />;
  }

  if (row.key === 'position') {
    return <span className={`position-badge pos-${String(player.position || '').toLowerCase()}`}>{player.position}</span>;
  }

  if (row.key === 'team') {
    return <span className="team-badge">{player.team}</span>;
  }

  if (row.key === 'status') {
    const availability = getPlayerAvailability(player);
    return <span className={`status-badge ${availability.tone}`}>{availability.label}</span>;
  }

  if (row.key === 'bye') {
    return <span>{player.bye ? `Week ${player.bye}` : '-'}</span>;
  }

  if (row.key === 'overallRank') {
    return <RankValue value={player.scoringRank} note={getOverallRankNote(player, analysis)} />;
  }

  if (row.key === 'positionRank') {
    return <RankValue value={positionRanks[player.id]} note={`${player.position} board`} />;
  }

  if (row.key === 'estimatedValue') {
    return <RankValue value={`$${getEstimatedAuctionValue(player)}`} note="est. auction" />;
  }

  if (row.key === 'rankGap') {
    const gap = player.scoringRank - analysis.bestRank;
    return <span>{gap === 0 ? 'Best selected' : `+${gap} picks`}</span>;
  }

  if (row.key === 'scoring') {
    return <span>{row.value}</span>;
  }

  return player[row.key] ?? '-';
};

const RankValue = ({ value, note }) => (
  <span className="compare-rank-value">
    <strong>{typeof value === 'number' ? `#${value}` : value || '-'}</strong>
    {note && <small>{note}</small>}
  </span>
);

const StatValue = ({ stat, loading }) => {
  if (!stat || stat.value === null || stat.value === undefined || stat.value === '') {
    return <span className="compare-muted">{loading ? 'Loading...' : '-'}</span>;
  }

  return (
    <span className="compare-stat-value">
      <strong>{stat.value}</strong>
      {stat.note && <small>{stat.note}</small>}
    </span>
  );
};

const getComparisonRows = (scoringLabel, statsSeason) => {
  const seasonLabel = statsSeason || 'Last';
  const fantasyPointsKey = getFantasyPointsKey(scoringLabel);
  const fantasyLabel = `${getShortScoringLabel(scoringLabel)} / Week`;

  return [
    { key: 'overallRank', label: 'Overall Rank' },
    { key: 'positionRank', label: 'Position Rank' },
    { key: 'estimatedValue', label: 'Est. Value' },
    { key: 'rankGap', label: 'Gap vs Best' },
    { key: 'status', label: 'Status' },
    { key: 'bye', label: 'Bye Week' },
    { key: 'position', label: 'Position' },
    { key: 'team', label: 'Team' },
    { key: 'scoring', label: 'Scoring', value: scoringLabel },
    {
      key: 'games',
      label: `${seasonLabel} Games`,
      type: 'stat',
      higherIsBetter: true,
      render: (player) => renderStat(player, ['games'], formatInteger),
      getNumericValue: (player) => getStatsNumber(player, ['games']),
    },
    {
      key: 'fantasyPerGame',
      label: fantasyLabel,
      type: 'stat',
      higherIsBetter: true,
      render: (player) => renderStat(player, ['perGame', fantasyPointsKey], formatDecimal, 'per game'),
      getNumericValue: (player) => getStatsNumber(player, ['perGame', fantasyPointsKey]),
    },
    {
      key: 'totalPprPoints',
      label: 'Total PPR',
      type: 'stat',
      higherIsBetter: true,
      render: (player) => renderTotalFantasyPoints(player, 'fantasyPointsPpr', `${seasonLabel} total`),
      getNumericValue: (player) => getTotalFantasyPoints(player, 'fantasyPointsPpr'),
    },
    {
      key: 'totalHalfPprPoints',
      label: 'Total Half PPR',
      type: 'stat',
      higherIsBetter: true,
      render: (player) => renderTotalFantasyPoints(player, 'fantasyPointsHalfPpr', `${seasonLabel} total`),
      getNumericValue: (player) => getTotalFantasyPoints(player, 'fantasyPointsHalfPpr'),
    },
    {
      key: 'yardsPerGame',
      label: 'Yards / Week',
      type: 'stat',
      higherIsBetter: true,
      render: (player) => renderStat(player, ['perGame', 'totalYards'], formatDecimal, 'pass + rush + rec'),
      getNumericValue: (player) => getStatsNumber(player, ['perGame', 'totalYards']),
    },
    {
      key: 'tdsPerGame',
      label: 'TD / Week',
      type: 'stat',
      higherIsBetter: true,
      render: (player) => renderStat(player, ['perGame', 'totalTds'], formatDecimal, 'pass + rush + rec'),
      getNumericValue: (player) => getStatsNumber(player, ['perGame', 'totalTds']),
    },
    {
      key: 'receptionsPerGame',
      label: 'Rec / Week',
      type: 'stat',
      higherIsBetter: true,
      render: (player) => renderStat(player, ['perGame', 'receptions'], formatDecimal),
      getNumericValue: (player) => getStatsNumber(player, ['perGame', 'receptions']),
    },
    {
      key: 'targetsPerGame',
      label: 'Targets / Week',
      type: 'stat',
      higherIsBetter: true,
      render: (player) => renderStat(player, ['perGame', 'targets'], formatDecimal),
      getNumericValue: (player) => getStatsNumber(player, ['perGame', 'targets']),
    },
    {
      key: 'carriesPerGame',
      label: 'Carries / Week',
      type: 'stat',
      higherIsBetter: true,
      render: (player) => renderStat(player, ['perGame', 'carries'], formatDecimal),
      getNumericValue: (player) => getStatsNumber(player, ['perGame', 'carries']),
    },
    {
      key: 'passingPerGame',
      label: 'Pass / Week',
      type: 'stat',
      higherIsBetter: true,
      render: renderPassingPerGame,
      getNumericValue: (player) => getStatsNumber(player, ['perGame', 'passingYards']),
    },
    {
      key: 'vsPositionAverage',
      label: 'Vs Pos Avg',
      type: 'stat',
      higherIsBetter: true,
      render: renderPositionAverage,
      getNumericValue: (player) => getPositionAverageDelta(player),
    },
    {
      key: 'totalYards',
      label: 'Total Yards',
      type: 'stat',
      higherIsBetter: true,
      render: renderTotalYards,
      getNumericValue: (player) => getStatsNumber(player, ['totals', 'totalYards']),
    },
    {
      key: 'totalTds',
      label: 'Total TDs',
      type: 'stat',
      higherIsBetter: true,
      render: renderTotalTds,
      getNumericValue: (player) => getStatsNumber(player, ['totals', 'totalTds']),
    },
    {
      key: 'catches',
      label: 'Catches',
      type: 'stat',
      higherIsBetter: true,
      render: (player) => renderStat(player, ['totals', 'receptions'], formatInteger),
      getNumericValue: (player) => getStatsNumber(player, ['totals', 'receptions']),
    },
    {
      key: 'targets',
      label: 'Targets',
      type: 'stat',
      higherIsBetter: true,
      render: (player) => renderStat(player, ['totals', 'targets'], formatInteger),
      getNumericValue: (player) => getStatsNumber(player, ['totals', 'targets']),
    },
    {
      key: 'receivingYards',
      label: 'Rec Yards',
      type: 'stat',
      higherIsBetter: true,
      render: (player) => renderStat(player, ['totals', 'receivingYards'], formatInteger),
      getNumericValue: (player) => getStatsNumber(player, ['totals', 'receivingYards']),
    },
    {
      key: 'carries',
      label: 'Carries',
      type: 'stat',
      higherIsBetter: true,
      render: (player) => renderStat(player, ['totals', 'carries'], formatInteger),
      getNumericValue: (player) => getStatsNumber(player, ['totals', 'carries']),
    },
    {
      key: 'rushingYards',
      label: 'Rush Yards',
      type: 'stat',
      higherIsBetter: true,
      render: (player) => renderStat(player, ['totals', 'rushingYards'], formatInteger),
      getNumericValue: (player) => getStatsNumber(player, ['totals', 'rushingYards']),
    },
    {
      key: 'passingLine',
      label: 'Passing',
      type: 'stat',
      higherIsBetter: true,
      render: renderPassingLine,
      getNumericValue: (player) => getStatsNumber(player, ['totals', 'attempts']),
    },
    {
      key: 'passingYards',
      label: 'Pass Yards',
      type: 'stat',
      higherIsBetter: true,
      render: (player) => renderStat(player, ['totals', 'passingYards'], formatInteger),
      getNumericValue: (player) => getStatsNumber(player, ['totals', 'passingYards']),
    },
    {
      key: 'bestWeek',
      label: 'Best Week',
      type: 'stat',
      higherIsBetter: true,
      render: renderBestWeek,
      getNumericValue: (player) => getBestWeekScore(player),
    },
  ];
};

const renderStat = (player, path, formatter = formatInteger, note = null) => {
  const stats = getPlayerStats(player);
  if (!stats) return null;
  const value = getPathValue(stats, path);
  if (!Number.isFinite(value)) return null;
  return { value: formatter(value), note };
};

const renderTotalFantasyPoints = (player, pointsKey, note) => {
  const value = getTotalFantasyPoints(player, pointsKey);
  if (!Number.isFinite(value)) return null;
  return { value: formatDecimal(value), note };
};

const getTotalFantasyPoints = (player, pointsKey) => {
  const stats = getPlayerStats(player);
  const totals = stats?.totals || {};
  const directValue = totals[pointsKey];
  if (Number.isFinite(directValue)) return directValue;

  if (pointsKey === 'fantasyPointsHalfPpr') {
    const standardPoints = totals.fantasyPoints;
    const receptions = totals.receptions;
    if (Number.isFinite(standardPoints) && Number.isFinite(receptions)) {
      return standardPoints + receptions * 0.5;
    }
  }

  return null;
};

const renderTotalYards = (player) => {
  const stats = getPlayerStats(player);
  if (!stats) return null;
  const totals = stats.totals || {};
  return {
    value: formatInteger(totals.totalYards),
    note: `${formatInteger(totals.passingYards)} pass / ${formatInteger(totals.rushingYards)} rush / ${formatInteger(totals.receivingYards)} rec`,
  };
};

const renderTotalTds = (player) => {
  const stats = getPlayerStats(player);
  if (!stats) return null;
  const totals = stats.totals || {};
  return {
    value: formatInteger(totals.totalTds),
    note: `${formatInteger(totals.passingTds)} pass / ${formatInteger(totals.rushingTds)} rush / ${formatInteger(totals.receivingTds)} rec`,
  };
};

const renderPassingLine = (player) => {
  const stats = getPlayerStats(player);
  if (!stats) return null;
  const completions = getPathValue(stats, ['totals', 'completions']);
  const attempts = getPathValue(stats, ['totals', 'attempts']);
  if (!attempts) return null;
  return { value: `${formatInteger(completions)}/${formatInteger(attempts)}`, note: 'comp/att' };
};

const renderPassingPerGame = (player) => {
  const stats = getPlayerStats(player);
  if (!stats) return null;
  const attempts = getPathValue(stats, ['perGame', 'attempts']);
  const passingYards = getPathValue(stats, ['perGame', 'passingYards']);
  if (!attempts && !passingYards) return null;
  return {
    value: formatDecimal(passingYards || 0),
    note: `${formatDecimal(attempts || 0)} att/week`,
  };
};

const renderBestWeek = (player) => {
  const stats = getPlayerStats(player);
  const bestWeek = stats?.bestWeek;
  if (!bestWeek?.week) return null;

  return {
    value: `Week ${bestWeek.week}`,
    note: `${formatDecimal(bestWeek.fantasyPointsPpr)} PPR, ${formatInteger(bestWeek.totalYards)} yds, ${formatInteger(bestWeek.totalTds)} TD`,
  };
};

const renderPositionAverage = (player) => {
  const stats = getPlayerStats(player);
  const playerAverage = stats?.perGame?.fantasyPointsPpr;
  const positionAverage = positionAverages[player.position]?.perGame?.fantasyPointsPpr;
  if (!Number.isFinite(playerAverage) || !Number.isFinite(positionAverage)) return null;

  const delta = playerAverage - positionAverage;
  return {
    value: `${delta >= 0 ? '+' : ''}${formatDecimal(delta)}`,
    note: `${formatDecimal(playerAverage)} vs ${formatDecimal(positionAverage)} ${player.position} avg`,
  };
};

// The oldest fetch among the players shown, so the label never overstates how fresh the table is.
const oldestFetch = (targets, season) => {
  const times = targets
    .map((target) => liveStatsFetchedAt.get(getLiveStatsCacheKey(season, target.sleeperId)))
    .filter(Boolean);
  return times.length ? Math.min(...times) : null;
};

const useLivePlayerStats = (players = [], statsSeason) => {
  const playerStatsKey = useMemo(
    () => players.map((player) => `${player.id}:${getSleeperPlayerId(player) || ''}`).join('|'),
    [players]
  );
  const [state, setState] = useState({ byPlayerId: {}, loading: false, error: null, season: statsSeason, fetchedAt: null });

  useEffect(() => {
    const targets = players
      .map((player) => ({ playerId: player.id, sleeperId: getSleeperPlayerId(player) }))
      .filter((target) => target.sleeperId);

    if (!statsSeason || targets.length === 0) {
      setState({ byPlayerId: {}, loading: false, error: null, season: statsSeason, fetchedAt: null });
      return undefined;
    }

    const cachedStats = {};
    const missingTargets = [];

    for (const target of targets) {
      const cacheKey = getLiveStatsCacheKey(statsSeason, target.sleeperId);
      if (liveStatsCache.has(cacheKey)) {
        cachedStats[target.playerId] = liveStatsCache.get(cacheKey);
      } else {
        missingTargets.push(target);
      }
    }

    setState({
      byPlayerId: cachedStats, loading: missingTargets.length > 0, error: null, season: statsSeason, fetchedAt: oldestFetch(targets, statsSeason),
    });
    if (missingTargets.length === 0) return undefined;

    let isActive = true;
    const controller = new AbortController();

    Promise.allSettled(missingTargets.map(async (target) => {
      const stats = await fetchSleeperSeasonStats(target.sleeperId, statsSeason, controller.signal);
      return { ...target, stats };
    })).then((results) => {
      if (!isActive) return;
      const nextStats = { ...cachedStats };
      const errors = [];

      for (const result of results) {
        if (result.status === 'fulfilled') {
          nextStats[result.value.playerId] = result.value.stats;
        } else if (result.reason?.name !== 'AbortError') {
          errors.push(result.reason?.message || 'Unknown stats error');
        }
      }

      setState({
        byPlayerId: nextStats,
        loading: false,
        error: errors[0] || null,
        season: statsSeason,
        fetchedAt: oldestFetch(targets, statsSeason),
      });
    });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [players, playerStatsKey, statsSeason]);

  return state;
};

const fetchSleeperSeasonStats = async (sleeperId, season, signal) => {
  const cacheKey = getLiveStatsCacheKey(season, sleeperId);
  if (liveStatsCache.has(cacheKey)) return liveStatsCache.get(cacheKey);

  const params = new URLSearchParams({
    season_type: 'regular',
    season: String(season),
    grouping: 'week',
  });
  const response = await fetch(`${SLEEPER_PLAYER_STATS_BASE_URL}/${encodeURIComponent(sleeperId)}?${params.toString()}`, { signal });

  if (!response.ok) {
    throw new Error(`Sleeper stats failed for ${sleeperId}: ${response.status}`);
  }

  const weeklyPayload = await response.json();
  const stats = aggregateSleeperWeeklyStats(weeklyPayload, season);
  liveStatsCache.set(cacheKey, stats);
  liveStatsFetchedAt.set(cacheKey, Date.now());
  return stats;
};

const aggregateSleeperWeeklyStats = (weeklyPayload, season) => {
  const weekly = Object.entries(weeklyPayload || {})
    .map(([weekKey, weekEntry]) => {
      const stats = weekEntry?.stats || {};
      const week = Number.parseInt(weekKey, 10) || Number.parseInt(weekEntry?.week, 10) || 0;
      const extracted = extractSleeperWeekStats(stats);
      return week && extracted.hasActivity ? { week, ...extracted } : null;
    })
    .filter(Boolean);

  const games = weekly.length;
  const totals = createEmptyTotals();

  for (const week of weekly) {
    for (const key of Object.keys(totals)) {
      totals[key] += week[key] || 0;
    }
  }

  const roundedTotals = Object.fromEntries(Object.entries(totals).map(([key, value]) => ([
    key,
    key.startsWith('fantasyPoints') ? roundNumber(value, 1) : roundInteger(value),
  ])));
  const divisor = Math.max(games, 1);
  const bestWeek = [...weekly].sort((a, b) => b.fantasyPointsPpr - a.fantasyPointsPpr || b.totalYards - a.totalYards)[0] || null;

  return {
    season: String(season),
    source: 'Sleeper live weekly stats',
    games,
    totals: roundedTotals,
    perGame: {
      fantasyPoints: roundNumber(roundedTotals.fantasyPoints / divisor, 1),
      fantasyPointsHalfPpr: roundNumber(roundedTotals.fantasyPointsHalfPpr / divisor, 1),
      fantasyPointsPpr: roundNumber(roundedTotals.fantasyPointsPpr / divisor, 1),
      totalYards: roundNumber(roundedTotals.totalYards / divisor, 1),
      totalTds: roundNumber(roundedTotals.totalTds / divisor, 2),
      completions: roundNumber(roundedTotals.completions / divisor, 1),
      attempts: roundNumber(roundedTotals.attempts / divisor, 1),
      carries: roundNumber(roundedTotals.carries / divisor, 1),
      receptions: roundNumber(roundedTotals.receptions / divisor, 1),
      targets: roundNumber(roundedTotals.targets / divisor, 1),
      passingYards: roundNumber(roundedTotals.passingYards / divisor, 1),
      rushingYards: roundNumber(roundedTotals.rushingYards / divisor, 1),
      receivingYards: roundNumber(roundedTotals.receivingYards / divisor, 1),
    },
    bestWeek: bestWeek ? {
      week: bestWeek.week,
      fantasyPointsPpr: roundNumber(bestWeek.fantasyPointsPpr, 1),
      totalYards: roundInteger(bestWeek.totalYards),
      totalTds: roundInteger(bestWeek.totalTds),
      receptions: roundInteger(bestWeek.receptions),
      passingYards: roundInteger(bestWeek.passingYards),
      rushingYards: roundInteger(bestWeek.rushingYards),
      receivingYards: roundInteger(bestWeek.receivingYards),
    } : null,
  };
};

const extractSleeperWeekStats = (stats) => {
  const completions = statNumber(stats, ['pass_cmp']);
  const attempts = statNumber(stats, ['pass_att']);
  const passingYards = statNumber(stats, ['pass_yd']);
  const passingTds = statNumber(stats, ['pass_td']);
  const interceptions = statNumber(stats, ['pass_int']);
  const carries = statNumber(stats, ['rush_att']);
  const rushingYards = statNumber(stats, ['rush_yd']);
  const rushingTds = statNumber(stats, ['rush_td']);
  const receptions = statNumber(stats, ['rec']);
  const targets = statNumber(stats, ['rec_tgt']);
  const receivingYards = statNumber(stats, ['rec_yd']);
  const receivingTds = statNumber(stats, ['rec_td']);
  const fantasyPoints = statNumber(stats, ['pts_std']);
  const fantasyPointsHalfPpr = statNumber(stats, ['pts_half_ppr', 'pts_ppr']);
  const fantasyPointsPpr = statNumber(stats, ['pts_ppr', 'pts_half_ppr', 'pts_std']);
  const totalYards = passingYards + rushingYards + receivingYards;
  const totalTds = passingTds + rushingTds + receivingTds;
  const hasActivity = [
    completions,
    attempts,
    passingYards,
    passingTds,
    interceptions,
    carries,
    rushingYards,
    rushingTds,
    receptions,
    targets,
    receivingYards,
    receivingTds,
    fantasyPoints,
    fantasyPointsPpr,
  ].some((value) => Number.isFinite(value) && Math.abs(value) > 0);

  return {
    completions,
    attempts,
    passingYards,
    passingTds,
    interceptions,
    carries,
    rushingYards,
    rushingTds,
    receptions,
    targets,
    receivingYards,
    receivingTds,
    fantasyPoints,
    fantasyPointsHalfPpr,
    fantasyPointsPpr,
    totalYards,
    totalTds,
    hasActivity,
  };
};

const createEmptyTotals = () => ({
  completions: 0,
  attempts: 0,
  passingYards: 0,
  passingTds: 0,
  interceptions: 0,
  carries: 0,
  rushingYards: 0,
  rushingTds: 0,
  receptions: 0,
  targets: 0,
  receivingYards: 0,
  receivingTds: 0,
  fantasyPoints: 0,
  fantasyPointsHalfPpr: 0,
  fantasyPointsPpr: 0,
  totalYards: 0,
  totalTds: 0,
});

const hydratePlayersWithStats = (players = [], liveStatsByPlayerId = {}) => players.map((player) => ({
  ...player,
  comparisonStats: liveStatsByPlayerId[player.id] || playerStatsById[player.id] || null,
}));

const getStatsStatus = (players, liveStatsState, statsSeason) => {
  const hasLiveStats = players.some((player) => liveStatsState.byPlayerId[player.id]);
  const hasAnyStats = players.some((player) => getPlayerStats(player));

  if (liveStatsState.loading) {
    return { label: `Loading ${statsSeason} live`, tone: null };
  }

  if (hasLiveStats) {
    return { label: `${statsSeason} live Sleeper`, tone: 'good' };
  }

  if (hasAnyStats) {
    return { label: formatStatsSeason(statsSeason), tone: 'good' };
  }

  if (liveStatsState.error) {
    return { label: `${statsSeason} unavailable`, tone: 'warn' };
  }

  return { label: `${statsSeason} pending`, tone: null };
};

const getCellClassName = (row, player, analysis, players) => {
  const classNames = ['compare-value-cell'];

  if (row.key === 'overallRank' && player.scoringRank === analysis.bestRank) {
    classNames.push('is-best');
  }

  if (row.key === 'positionRank' && analysis.bestPositionRankByPosition[player.position] === analysis.positionRanks[player.id]) {
    classNames.push('is-best');
  }

  if (row.key === 'estimatedValue' && player.id === analysis.bestValue?.id) {
    classNames.push('is-best');
  }

  if (row.key === 'bye' && player.bye && analysis.overlapByeWeeks.has(player.bye)) {
    classNames.push('is-warning');
  }

  if (row.key === 'status' && getPlayerAvailability(player).tone === 'danger') {
    classNames.push('is-warning');
  }

  if (row.type === 'stat' && row.higherIsBetter && row.getNumericValue) {
    const values = players.map((selectedPlayer) => row.getNumericValue(selectedPlayer)).filter(Number.isFinite);
    const bestValue = values.length ? Math.max(...values) : null;
    const currentValue = row.getNumericValue(player);
    if (Number.isFinite(bestValue) && bestValue > 0 && currentValue === bestValue) {
      classNames.push('is-best');
    }
  }

  return classNames.join(' ');
};

const buildComparisonAnalysis = (players = [], positionRanks = {}) => {
  const selectedRanks = players.map((player) => player.scoringRank).filter(Number.isFinite);
  const bestRank = selectedRanks.length ? Math.min(...selectedRanks) : 0;
  const worstRank = selectedRanks.length ? Math.max(...selectedRanks) : 0;
  const bestOverall = players.find((player) => player.scoringRank === bestRank) || players[0];
  const bestValue = [...players].sort((a, b) => getEstimatedAuctionValue(b) - getEstimatedAuctionValue(a))[0];
  const bestPositionRankByPosition = {};

  players.forEach((player) => {
    const currentBest = bestPositionRankByPosition[player.position];
    const playerPositionRank = positionRanks[player.id];
    if (!currentBest || playerPositionRank < currentBest) {
      bestPositionRankByPosition[player.position] = playerPositionRank;
    }
  });

  const byeGroups = players.reduce((groups, player) => {
    if (!player.bye) return groups;
    groups[player.bye] = [...(groups[player.bye] || []), player];
    return groups;
  }, {});
  const overlapByeWeeks = new Set(Object.entries(byeGroups)
    .filter(([, byePlayers]) => byePlayers.length > 1)
    .map(([bye]) => Number(bye)));
  const byeOverlapLabel = overlapByeWeeks.size
    ? [...overlapByeWeeks].map((bye) => `Week ${bye}`).join(', ')
    : 'None';
  const positionMix = [...new Set(players.map((player) => player.position).filter(Boolean))].join(' / ') || '-';

  return {
    bestRank,
    worstRank,
    bestOverall,
    bestValue,
    rankSpread: Math.max(0, worstRank - bestRank),
    bestPositionRankByPosition,
    positionRanks,
    overlapByeWeeks,
    hasByeOverlap: overlapByeWeeks.size > 0,
    byeOverlapLabel,
    positionMix,
  };
};

const buildPositionRankMap = (players = []) => {
  const countsByPosition = {};

  return [...players]
    .sort((a, b) => a.scoringRank - b.scoringRank)
    .reduce((rankMap, player) => {
      countsByPosition[player.position] = (countsByPosition[player.position] || 0) + 1;
      rankMap[player.id] = countsByPosition[player.position];
      return rankMap;
    }, {});
};

const getPlayerStats = (player) => player?.comparisonStats || playerStatsById[player?.id];

const getStatsNumber = (player, path) => {
  const value = getPathValue(getPlayerStats(player), path);
  return Number.isFinite(value) ? value : null;
};

const getBestWeekScore = (player) => {
  const value = getPlayerStats(player)?.bestWeek?.fantasyPointsPpr;
  return Number.isFinite(value) ? value : null;
};

const getPositionAverageDelta = (player) => {
  const stats = getPlayerStats(player);
  const playerAverage = stats?.perGame?.fantasyPointsPpr;
  const positionAverage = positionAverages[player.position]?.perGame?.fantasyPointsPpr;
  if (!Number.isFinite(playerAverage) || !Number.isFinite(positionAverage)) return null;
  return playerAverage - positionAverage;
};

const getPathValue = (source, path) => {
  const value = path.reduce((current, key) => current?.[key], source);
  return Number.isFinite(value) ? value : null;
};

const getOverallRankNote = (player, analysis) => {
  const gap = player.scoringRank - analysis.bestRank;
  return gap === 0 ? 'Best selected' : `+${gap} overall`;
};

const getSleeperPlayerId = (player) => {
  if (player?.sleeperId) return String(player.sleeperId);
  const match = String(player?.id || '').match(/^sleeper-(.+)$/);
  return match?.[1] || null;
};

const getLiveStatsCacheKey = (season, sleeperId) => `${season}:${sleeperId}`;

const getFantasyPointsKey = (scoringLabel = '') => {
  const normalized = String(scoringLabel).toLowerCase();
  if (normalized.includes('half')) return 'fantasyPointsHalfPpr';
  if (normalized.includes('standard') || normalized.includes('std')) return 'fantasyPoints';
  return 'fantasyPointsPpr';
};

const getShortScoringLabel = (scoringLabel = '') => {
  const normalized = String(scoringLabel).toLowerCase();
  if (normalized.includes('half')) return 'Half PPR';
  if (normalized.includes('standard') || normalized.includes('std')) return 'STD';
  return 'PPR';
};

const statNumber = (stats, keys) => {
  for (const key of keys) {
    const parsed = Number.parseFloat(stats?.[key]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const formatInteger = (value) => {
  if (!Number.isFinite(value)) return '-';
  return Math.round(value).toLocaleString();
};

const formatDecimal = (value) => {
  if (!Number.isFinite(value)) return '-';
  return Number(value).toFixed(1);
};

const roundInteger = (value) => Math.round(Number.isFinite(value) ? value : 0);

const roundNumber = (value, digits = 1) => {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
};

const formatStatsSeason = (season) => (season ? `${season} stats` : 'Pending');

const getDefaultStatsSeason = () => Math.max(2020, new Date().getUTCFullYear() - 1);

const formatPlayerRank = (player) => {
  if (!player) return '-';
  return `${player.name} #${player.scoringRank}`;
};

const formatPlayerValue = (player) => {
  if (!player) return '-';
  return `${player.name} $${getEstimatedAuctionValue(player)}`;
};

export default PlayerComparison;
