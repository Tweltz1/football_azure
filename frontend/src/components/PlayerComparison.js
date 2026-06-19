import React, { useMemo } from 'react';
import { playerInsightsMeta, playerStatsById, positionAverages } from '../data/playerInsights';
import { getEstimatedAuctionValue, getPlayerAvailability } from '../data/strategyUtils';
import './PlayerComparison.css';

const PlayerComparison = ({ players, allPlayers = [], scoringLabel, maxPlayers = 3, onRemove, onClear }) => {
  const positionRanks = useMemo(() => buildPositionRankMap(allPlayers), [allPlayers]);
  const analysis = useMemo(() => buildComparisonAnalysis(players, positionRanks), [players, positionRanks]);
  const comparisonRows = useMemo(() => getComparisonRows(scoringLabel, playerInsightsMeta.statsSeason), [scoringLabel]);

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

      {players.length < 2 ? (
        <div className="compare-empty-state">
          <strong>{players[0].name} is ready to compare.</strong>
          <span>Select {maxPlayers - players.length === 1 ? '1 more player' : `up to ${maxPlayers - players.length} more players`} for the side-by-side view.</span>
        </div>
      ) : (
        <>
          <div className="compare-insight-grid" aria-label="Comparison summary">
            <ComparisonInsight label="Best Rank" value={formatPlayerRank(analysis.bestOverall)} />
            <ComparisonInsight label="Best Value" value={formatPlayerValue(analysis.bestValue)} />
            <ComparisonInsight label="Bye Overlap" value={analysis.byeOverlapLabel} tone={analysis.hasByeOverlap ? 'warn' : 'good'} />
            <ComparisonInsight label="Positions" value={analysis.positionMix} />
            <ComparisonInsight label="Stats" value={formatStatsSeason(playerInsightsMeta.statsSeason)} />
          </div>

          <div className="compare-table-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  <th className="compare-label-col">Metric</th>
                  {players.map((player) => (
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
                    {players.map((player) => (
                      <td key={player.id} className={getCellClassName(row, player, analysis, players)}>
                        <CompareValue player={player} row={row} analysis={analysis} positionRanks={positionRanks} />
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

const CompareValue = ({ player, row, analysis, positionRanks }) => {
  if (row.type === 'stat') {
    return <StatValue stat={row.render(player)} />;
  }

  if (row.key === 'position') {
    return <span className="position-badge">{player.position}</span>;
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

const StatValue = ({ stat }) => {
  if (!stat || stat.value === null || stat.value === undefined || stat.value === '') {
    return <span className="compare-muted">-</span>;
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
      key: 'pprPerGame',
      label: 'PPR / Week',
      type: 'stat',
      higherIsBetter: true,
      render: (player) => renderStat(player, ['perGame', 'fantasyPointsPpr'], formatDecimal, 'per game'),
      getNumericValue: (player) => getStatsNumber(player, ['perGame', 'fantasyPointsPpr']),
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

const getPlayerStats = (player) => playerStatsById[player.id];

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

const formatInteger = (value) => {
  if (!Number.isFinite(value)) return '-';
  return Math.round(value).toLocaleString();
};

const formatDecimal = (value) => {
  if (!Number.isFinite(value)) return '-';
  return Number(value).toFixed(1);
};

const formatStatsSeason = (season) => (season ? `${season} stats` : 'Pending');

const formatPlayerRank = (player) => {
  if (!player) return '-';
  return `${player.name} #${player.scoringRank}`;
};

const formatPlayerValue = (player) => {
  if (!player) return '-';
  return `${player.name} $${getEstimatedAuctionValue(player)}`;
};

export default PlayerComparison;
