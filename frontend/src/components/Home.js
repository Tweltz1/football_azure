import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { initialPlayerList, playerPoolMeta } from '../data/playerData';
import {
  buildPlayerBoard,
  filterPlayerBoard,
  getScoringLabel,
  PLAYER_LIMIT_OPTIONS,
  POSITION_FILTERS,
  SCORING_MODES,
  SORT_OPTIONS,
} from '../data/playerBoardUtils';
import '../PlayerBoard.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

const Home = () => {
  const { user, loading } = useAuth();
  const [userProfile, setUserProfile] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilter, setPositionFilter] = useState('ALL');
  const [scoringMode, setScoringMode] = useState('PPR');
  const [sortBy, setSortBy] = useState('rank');
  const [playerLimit, setPlayerLimit] = useState(300);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.userId) return;

      try {
        const response = await axios.post(`${API_BASE_URL}/user-profile`, {
          userId: user.userId,
          displayName: user.userDetails,
        });
        setUserProfile(response.data);
      } catch (error) {
        console.error('Error fetching profile for home page:', error);
      }
    };

    fetchProfile();
  }, [user]);

  const playerBoard = useMemo(() => buildPlayerBoard(initialPlayerList, scoringMode), [scoringMode]);
  const matchingPlayers = useMemo(() => filterPlayerBoard(playerBoard, {
    searchTerm,
    positionFilter,
    sortBy,
  }), [playerBoard, searchTerm, positionFilter, sortBy]);
  const visiblePlayers = matchingPlayers.slice(0, playerLimit);
  const scoringLabel = getScoringLabel(scoringMode);
  const greetingName = userProfile?.displayName || user?.userDetails || 'Commissioner';

  if (loading) {
    return <div className="loading-panel">Loading user data...</div>;
  }

  return (
    <div className="page-shell home-page">
      <section className="page-hero">
        <p className="page-kicker">Live auction draft hub</p>
        <h1>Welcome back, {greetingName}</h1>
        <p>Build leagues, scan the player pool, and jump into the room when the bidding clock starts.</p>
        <div className="scoreboard-strip">
          <span>{initialPlayerList.length} players loaded</span>
          <span>{POSITION_FILTERS.length - 1} board filters</span>
          <span>{scoringLabel}</span>
          <span>{userProfile?.defaultTeamName || 'Team profile ready'}</span>
          <span>Updated {formatDate(playerPoolMeta.fetchedAt)}</span>
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
        <div className="player-board-heading">
          <div>
            <p className="section-kicker">Global board</p>
            <h2>Player Pool</h2>
          </div>
          <div className="board-count">
            Showing {visiblePlayers.length} of {matchingPlayers.length}
          </div>
        </div>

        <div className="filter-bar player-board-controls">
          <label className="filter-field">
            <span>Position</span>
            <select onChange={(e) => setPositionFilter(e.target.value)} value={positionFilter} aria-label="Filter by position">
              {POSITION_FILTERS.map((position) => <option key={position.value} value={position.value}>{position.label}</option>)}
            </select>
          </label>
          <label className="filter-field">
            <span>Scoring</span>
            <select onChange={(e) => setScoringMode(e.target.value)} value={scoringMode} aria-label="Scoring format">
              {SCORING_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
            </select>
          </label>
          <label className="filter-field">
            <span>Sort</span>
            <select onChange={(e) => setSortBy(e.target.value)} value={sortBy} aria-label="Sort players">
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="filter-field">
            <span>Show</span>
            <select onChange={(e) => setPlayerLimit(Number(e.target.value))} value={playerLimit} aria-label="Players to show">
              {PLAYER_LIMIT_OPTIONS.map((limit) => <option key={limit} value={limit}>Top {limit}</option>)}
            </select>
          </label>
          <label className="filter-field search-field">
            <span>Search</span>
            <input
              type="text"
              placeholder="Search players or teams"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </label>
        </div>

        <ul className="player-list player-board-list">
          {visiblePlayers.map((player) => (
            <li key={player.id} className="player-list-item player-board-row">
              <div className="player-main">
                <span className="rank-chip">#{player.scoringRank}</span>
                <span>
                  <span className="player-name">{player.name}</span>
                  <span className="player-subline">
                    <span className="position-badge">{player.position}</span>
                    <span className="team-badge">{player.team}</span>
                  </span>
                </span>
              </div>
              <div className="player-data-strip">
                <span>Bye {player.bye || '-'}</span>
                <span>{scoringLabel}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

const formatDate = (value) => {
  if (!value) return 'recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'recently';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default Home;
