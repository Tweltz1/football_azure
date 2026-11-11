import React, { useMemo, useState } from 'react';
import { TIER_DEFINITIONS } from '../data/strategyUtils';
import './TierBoard.css';

const TierBoard = ({ players, tierAssignments, playerNotes, scoringLabel, onTierChange }) => {
  const [collapsedTiers, setCollapsedTiers] = useState({});
  const groupedPlayers = useMemo(() => groupPlayersByTier(players, tierAssignments), [players, tierAssignments]);

  const handleDrop = (event, tierValue) => {
    event.preventDefault();
    const playerId = event.dataTransfer.getData('text/plain');
    if (playerId) {
      onTierChange(playerId, tierValue);
    }
  };

  const sections = [
    ...TIER_DEFINITIONS.map((tier) => ({ ...tier, players: groupedPlayers[tier.value] || [] })),
    { value: null, label: 'Untiered', name: 'Needs review', accent: 'none', players: groupedPlayers.untiered || [] },
  ];

  return (
    <div className="tier-board">
      {sections.map((section) => {
        const collapsed = collapsedTiers[String(section.value)];
        return (
          <section
            key={section.value || 'untiered'}
            className={`tier-section accent-${section.accent}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleDrop(event, section.value)}
          >
            <button
              type="button"
              className="tier-heading"
              onClick={() => setCollapsedTiers((current) => ({ ...current, [String(section.value)]: !collapsed }))}
            >
              <span>{collapsed ? '>' : 'v'} {section.label} - {section.name}</span>
              <strong>{section.players.length}</strong>
            </button>

            {!collapsed && (
              <div className="tier-player-list">
                {section.players.length > 0 ? section.players.map((player) => (
                  <div
                    key={player.id}
                    className="tier-player-row"
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData('text/plain', player.id)}
                  >
                    <div className="player-main">
                      <span className="rank-chip">#{player.scoringRank}</span>
                      <span>
                        <span className="player-name">{player.name}</span>
                        <span className="player-subline">
                          <span className={`position-badge pos-${String(player.position || '').toLowerCase()}`}>{player.position}</span>
                          <span className="team-badge">{player.team}</span>
                          <span className="note-badge">Bye {player.bye || '-'}</span>
                          <span className="note-badge">{scoringLabel}</span>
                        </span>
                      </span>
                    </div>
                    <div className="tier-row-tools">
                      {playerNotes?.[player.id] && <span className="tier-note">{playerNotes[player.id]}</span>}
                      <select
                        value={tierAssignments[player.id] || ''}
                        onChange={(event) => onTierChange(player.id, event.target.value ? Number(event.target.value) : null)}
                        aria-label={`Tier for ${player.name}`}
                      >
                        <option value="">No tier</option>
                        {TIER_DEFINITIONS.map((tier) => <option key={tier.value} value={tier.value}>{tier.label}</option>)}
                      </select>
                    </div>
                  </div>
                )) : (
                  <div className="tier-empty">Drop players here or use the tier selector.</div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

const groupPlayersByTier = (players = [], tierAssignments = {}) => {
  return players.reduce((groups, player) => {
    const tier = tierAssignments[player.id];
    const key = tier ? Number(tier) : 'untiered';
    groups[key] = [...(groups[key] || []), player];
    return groups;
  }, {});
};

export default TierBoard;
