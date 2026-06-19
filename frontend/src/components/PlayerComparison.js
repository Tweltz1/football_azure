import React, { useMemo } from 'react';
import './PlayerComparison.css';

const PlayerComparison = ({ players, allPlayers = [], scoringLabel, maxPlayers = 3, onRemove, onClear }) => {
  const positionRanks = useMemo(() => buildPositionRankMap(allPlayers), [allPlayers]);
  const analysis = useMemo(() => buildComparisonAnalysis(players, positionRanks), [players, positionRanks]);

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
            <ComparisonInsight label="Rank Spread" value={`${analysis.rankSpread} spots`} />
            <ComparisonInsight label="Bye Overlap" value={analysis.byeOverlapLabel} tone={analysis.hasByeOverlap ? 'warn' : 'good'} />
            <ComparisonInsight label="Positions" value={analysis.positionMix} />
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
                {getComparisonRows(scoringLabel).map((row) => (
                  <tr key={row.key}>
                    <td className="compare-label-cell">{row.label}</td>
                    {players.map((player) => (
                      <td key={player.id} className={getCellClassName(row, player, analysis)}>
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
  if (row.key === 'position') {
    return <span className="position-badge">{player.position}</span>;
  }

  if (row.key === 'team') {
    return <span className="team-badge">{player.team}</span>;
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
    <strong>#{value || '-'}</strong>
    {note && <small>{note}</small>}
  </span>
);

const getComparisonRows = (scoringLabel) => [
  { key: 'overallRank', label: 'Overall Rank' },
  { key: 'positionRank', label: 'Position Rank' },
  { key: 'rankGap', label: 'Gap vs Best' },
  { key: 'bye', label: 'Bye Week' },
  { key: 'position', label: 'Position' },
  { key: 'team', label: 'Team' },
  { key: 'scoring', label: 'Scoring', value: scoringLabel },
];

const getCellClassName = (row, player, analysis) => {
  const classNames = ['compare-value-cell'];

  if (row.key === 'overallRank' && player.scoringRank === analysis.bestRank) {
    classNames.push('is-best');
  }

  if (row.key === 'positionRank' && analysis.bestPositionRankByPosition[player.position] === analysis.positionRanks[player.id]) {
    classNames.push('is-best');
  }

  if (row.key === 'bye' && player.bye && analysis.overlapByeWeeks.has(player.bye)) {
    classNames.push('is-warning');
  }

  return classNames.join(' ');
};

const buildComparisonAnalysis = (players = [], positionRanks = {}) => {
  const selectedRanks = players.map((player) => player.scoringRank).filter(Number.isFinite);
  const bestRank = selectedRanks.length ? Math.min(...selectedRanks) : 0;
  const worstRank = selectedRanks.length ? Math.max(...selectedRanks) : 0;
  const bestOverall = players.find((player) => player.scoringRank === bestRank) || players[0];
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

const getOverallRankNote = (player, analysis) => {
  const gap = player.scoringRank - analysis.bestRank;
  return gap === 0 ? 'Best selected' : `+${gap} overall`;
};

const formatPlayerRank = (player) => {
  if (!player) return '-';
  return `${player.name} #${player.scoringRank}`;
};

export default PlayerComparison;
