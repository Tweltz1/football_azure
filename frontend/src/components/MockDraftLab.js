import React, { useMemo, useState } from 'react';
import { getEstimatedAuctionValue, getPlayerAvailability, runMockAuction } from '../data/strategyUtils';
import './MockDraftLab.css';

const MockDraftLab = ({ players, scoringLabel }) => {
  const topPlayers = useMemo(() => (players || []).slice(0, 80), [players]);
  const [selectedPlayerId, setSelectedPlayerId] = useState(topPlayers[0]?.id || '');
  const [bidCap, setBidCap] = useState(35);
  const [result, setResult] = useState(null);

  const selectedPlayer = topPlayers.find((player) => player.id === selectedPlayerId) || topPlayers[0];
  const availability = getPlayerAvailability(selectedPlayer);
  const estimatedValue = getEstimatedAuctionValue(selectedPlayer);

  const handleRunMock = () => {
    setResult(runMockAuction(selectedPlayer, bidCap));
  };

  if (!selectedPlayer) return null;

  return (
    <section className="mock-draft-panel">
      <div className="mock-draft-copy">
        <p className="section-kicker">Mock draft mode</p>
        <h2>Auction Lab</h2>
        <p>Pick a target, set your walk-away number, and run a quick bot auction before draft night.</p>
      </div>

      <div className="mock-draft-controls">
        <label className="filter-field">
          <span>Target</span>
          <select value={selectedPlayer.id} onChange={(event) => setSelectedPlayerId(event.target.value)}>
            {topPlayers.map((player) => (
              <option key={player.id} value={player.id}>#{player.scoringRank} {player.name} ({player.position})</option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Max Bid</span>
          <input type="number" min="1" max="200" value={bidCap} onChange={(event) => setBidCap(Number(event.target.value) || 1)} />
        </label>
        <button type="button" className="create-button" onClick={handleRunMock}>Run Mock</button>
      </div>

      <div className={`mock-draft-card pos-${String(selectedPlayer.position || '').toLowerCase()}`}>
        <div className="mock-player-line">
          <span className="rank-chip">#{selectedPlayer.scoringRank}</span>
          <div>
            <strong>{selectedPlayer.name}</strong>
            <span>
              {selectedPlayer.position} - {selectedPlayer.team} - Bye {selectedPlayer.bye || '-'} - {scoringLabel}
            </span>
          </div>
        </div>
        <div className="mock-metrics">
          <span>Est. value ${estimatedValue}</span>
          <span className={`status-badge ${availability.tone}`}>{availability.label}</span>
        </div>
      </div>

      {result && (
        <div className={`mock-result ${result.userWins ? 'win' : 'loss'}`}>
          <div>
            <p className="section-kicker">Result</p>
            <h3>{result.userWins ? 'You win the room' : `${result.winner} wins`}</h3>
            <p>Winning bid ${result.winningBid}. Suggested ceiling ${result.suggestedBid}. Market estimate ${result.marketValue}.</p>
          </div>
          <ol>
            {result.bidTrail.map((bid) => (
              <li key={`${bid.team}-${bid.amount}`}>
                <span>{bid.team}</span>
                <strong>${bid.amount}</strong>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
};

export default MockDraftLab;
