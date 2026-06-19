import React from 'react';
import './PlayerComparison.css';

const COMPARE_STATS = [
  { key: 'position', label: 'Position' },
  { key: 'team', label: 'Team' },
  { key: 'bye', label: 'Bye Week' },
  { key: 'scoringRank', label: 'Rank' },
];

const PlayerComparison = ({ players, scoringLabel, onRemove, onClear }) => {
  if (!players || players.length < 2) return null;

  return (
    <div className="compare-panel">
      <div className="compare-header">
        <div>
          <p className="section-kicker">Side by side</p>
          <h3>Player Comparison</h3>
        </div>
        <button type="button" className="compare-clear-btn" onClick={onClear}>
          Clear All
        </button>
      </div>

      <div className="compare-table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th className="compare-label-col">Stat</th>
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
            {COMPARE_STATS.map((stat) => (
              <tr key={stat.key}>
                <td className="compare-label-cell">{stat.label}</td>
                {players.map((player) => (
                  <td key={player.id} className="compare-value-cell">
                    <CompareValue player={player} statKey={stat.key} />
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="compare-label-cell">Scoring</td>
              {players.map((player) => (
                <td key={player.id} className="compare-value-cell">
                  {scoringLabel}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

const CompareValue = ({ player, statKey }) => {
  if (statKey === 'position') {
    return <span className="position-badge">{player.position}</span>;
  }

  if (statKey === 'team') {
    return <span className="team-badge">{player.team}</span>;
  }

  if (statKey === 'bye') {
    return player.bye || '-';
  }

  if (statKey === 'scoringRank') {
    return <span className="rank-chip">#{player.scoringRank}</span>;
  }

  return player[statKey] ?? '-';
};

export default PlayerComparison;
