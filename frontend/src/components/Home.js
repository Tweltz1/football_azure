import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { initialPlayerList } from '../data/playerData';

const POSITION_OPTIONS = ['WR', 'RB', 'TE', 'QB', 'K', 'DST'];

const Home = () => {
  const { user, loading } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortPosition, setSortPosition] = useState('All Positions');
  const navigate = useNavigate();

  if (loading) {
    return <div className="loading-panel">Loading user data...</div>;
  }

  const filteredPlayers = initialPlayerList
    .filter(player => player.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter(player => sortPosition === 'All Positions' || player.position === sortPosition);

  const topPlayers = filteredPlayers.slice(0, 80);

  return (
    <div className="page-shell home-page">
      <section className="page-hero">
        <p className="page-kicker">Live auction draft hub</p>
        <h1>Welcome back, {user.userDetails}</h1>
        <p>Build leagues, scan the player pool, and jump into the room when the bidding clock starts.</p>
        <div className="scoreboard-strip">
          <span>{initialPlayerList.length} players loaded</span>
          <span>{POSITION_OPTIONS.length} positions tracked</span>
          <span>Auction draft ready</span>
        </div>
      </section>

      <section className="dashboard-grid" aria-label="Draft actions">
        <div className="action-card">
          <div>
            <p className="section-kicker">Command</p>
            <h2>My Leagues</h2>
            <p>Open your draft rooms, review league settings, and get straight back into active auctions.</p>
          </div>
          <button onClick={() => navigate('/leagues')}>Open Leagues</button>
        </div>

        <div className="action-card">
          <div>
            <p className="section-kicker">Commissioner</p>
            <h2>Create League</h2>
            <p>Set the roster build, timer pace, and invite your crew into a new auction room.</p>
          </div>
          <button className="create-button" onClick={() => navigate('/create-league')}>Create League</button>
        </div>

        <div className="action-card">
          <div>
            <p className="section-kicker">Board</p>
            <h2>My Profile</h2>
            <p>Keep your master player list tuned before every league copies it into draft night.</p>
          </div>
          <button className="edit-roster-button" onClick={() => navigate('/profile')}>Tune Profile</button>
        </div>
      </section>

      <section className="player-pool-panel">
        <p className="section-kicker">Global board</p>
        <h2>Player Pool</h2>
        <div className="filter-bar">
          <select onChange={(e) => setSortPosition(e.target.value)} value={sortPosition} aria-label="Sort by position">
            <option>All Positions</option>
            {POSITION_OPTIONS.map(position => <option key={position}>{position}</option>)}
          </select>
          <input
            type="text"
            placeholder="Search for a player..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <ul className="player-list">
          {topPlayers.map((player) => (
            <li key={player.id} className="player-list-item">
              <span className="player-name">{player.name}</span>
              <span>
                <span className="position-badge">{player.position}</span>{' '}
                <span className="team-badge">{player.team}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default Home;
