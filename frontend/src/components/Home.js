import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { initialPlayerList, playerPoolMeta } from '../data/playerData';
import { playerInsightsMeta, playerRankMovements, sleeperTrending } from '../data/playerInsights';
import {
  buildPlayerBoard,
  filterPlayerBoard,
  getScoringLabel,
  PLAYER_LIMIT_OPTIONS,
  POSITION_FILTERS,
  SCORING_MODES,
  SORT_OPTIONS,
} from '../data/playerBoardUtils';
import { getPlayerAvailability } from '../data/strategyUtils';
import { subscribeProfileUpdates } from '../profileSync';
import MockDraftLab from './MockDraftLab';
import PlayerComparison from './PlayerComparison';
import UpdatedAt from './UpdatedAt';
import '../PlayerBoard.css';

const MAX_COMPARE = 3;
const SLEEPER_TRENDING_BASE_URL = 'https://api.sleeper.app/v1/players/nfl/trending';
const LIVE_TREND_LIMIT = 8;

const Home = () => {
  const { user, loading } = useAuth();
  const [userProfile, setUserProfile] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilter, setPositionFilter] = useState('ALL');
  const [scoringMode, setScoringMode] = useState('PPR');
  const [sortBy, setSortBy] = useState('rank');
  const [playerLimit, setPlayerLimit] = useState(300);
  const [compareIds, setCompareIds] = useState([]);
  const [trendData, setTrendData] = useState({ add: [], drop: [], loading: false, error: null, fetchedAt: null });
  const navigate = useNavigate();

  const fetchProfile = useCallback(async () => {
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
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    return subscribeProfileUpdates(fetchProfile, { includeFocus: true });
  }, [fetchProfile]);

  const playerBoard = useMemo(() => buildPlayerBoard(initialPlayerList, scoringMode), [scoringMode]);
  const rankMovementItems = useMemo(() => ({
    risers: hydrateMovementItems(playerRankMovements.risers, playerBoard),
    fallers: hydrateMovementItems(playerRankMovements.fallers, playerBoard),
  }), [playerBoard]);
  const comparePlayers = useMemo(() => compareIds
    .map((playerId) => playerBoard.find((player) => player.id === playerId))
    .filter(Boolean), [compareIds, playerBoard]);
  const matchingPlayers = useMemo(() => filterPlayerBoard(playerBoard, {
    searchTerm,
    positionFilter,
    sortBy,
  }), [playerBoard, searchTerm, positionFilter, sortBy]);
  const visiblePlayers = matchingPlayers.slice(0, playerLimit);
  const scoringLabel = getScoringLabel(scoringMode);
  const greetingName = userProfile?.displayName || user?.userDetails || 'Commissioner';
  const favoriteSet = useMemo(() => new Set(userProfile?.favoritePlayerIds || []), [userProfile]);
  const playerNotes = userProfile?.playerNotes || {};
  const playerTiers = userProfile?.playerTiers || {};

  useEffect(() => {
    let isActive = true;
    const fallbackTrends = {
      add: hydrateTrendItems(sleeperTrending.add, playerBoard, LIVE_TREND_LIMIT),
      drop: hydrateTrendItems(sleeperTrending.drop, playerBoard, LIVE_TREND_LIMIT),
      fetchedAt: playerInsightsMeta.generatedAt || null,
    };

    const fetchLiveTrends = async () => {
      setTrendData({ ...fallbackTrends, loading: true, error: null });

      try {
        const [addItems, dropItems] = await Promise.all([
          fetchSleeperTrend('add'),
          fetchSleeperTrend('drop'),
        ]);

        if (!isActive) return;
        setTrendData({
          add: hydrateTrendItems(addItems, playerBoard, LIVE_TREND_LIMIT),
          drop: hydrateTrendItems(dropItems, playerBoard, LIVE_TREND_LIMIT),
          loading: false,
          error: null,
          fetchedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (!isActive) return;
        console.warn('Sleeper trend fetch failed:', error);
        setTrendData({
          ...fallbackTrends,
          loading: false,
          error: 'Live Sleeper trends unavailable',
        });
      }
    };

    fetchLiveTrends();
    return () => {
      isActive = false;
    };
  }, [playerBoard]);

  const toggleCompare = (player) => {
    setCompareIds((previousIds) => {
      if (previousIds.includes(player.id)) {
        return previousIds.filter((playerId) => playerId !== player.id);
      }

      if (previousIds.length >= MAX_COMPARE) {
        return previousIds;
      }

      return [...previousIds, player.id];
    });
  };

  const removeFromCompare = (playerId) => {
    setCompareIds((previousIds) => previousIds.filter((id) => id !== playerId));
  };

  const clearCompare = () => setCompareIds([]);
  const isInCompare = (playerId) => compareIds.includes(playerId);

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
          <UpdatedAt at={playerPoolMeta.fetchedAt} label="Player pool updated" staleAfterHours={POOL_STALE_HOURS} />
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

      <PlayerUpdatesPanel
        trends={trendData}
        rankMovements={rankMovementItems}
        lookbackHours={getTrendLookbackHours()}
      />

      <MockDraftLab players={playerBoard} scoringLabel={scoringLabel} />

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

        {comparePlayers.length > 0 && (
          <div className="compare-bar">
            <span>Comparing {comparePlayers.length} of {MAX_COMPARE} players - {comparePlayers.map((player) => player.name).join(', ')}</span>
            <button type="button" onClick={clearCompare}>Clear</button>
          </div>
        )}

        <PlayerComparison
          players={comparePlayers}
          allPlayers={playerBoard}
          scoringLabel={scoringLabel}
          maxPlayers={MAX_COMPARE}
          onRemove={removeFromCompare}
          onClear={clearCompare}
        />

        <ul className="player-list player-board-list">
          {visiblePlayers.map((player) => {
            const availability = getPlayerAvailability(player);
            const isFavorite = favoriteSet.has(player.id);
            const playerNote = typeof playerNotes[player.id] === 'string' ? playerNotes[player.id].trim() : '';
            const tier = Number(playerTiers[player.id]) || 0;
            return (
              <li key={player.id} className={`player-list-item player-board-row has-compare-action ${isFavorite ? 'is-favorite' : ''}`}>
                <div className="player-main">
                  <span className="rank-chip">#{player.scoringRank}</span>
                  <span>
                    <span className="player-name">{player.name}</span>
                    <span className="player-subline">
                      <span className={`position-badge pos-${String(player.position || '').toLowerCase()}`}>{player.position}</span>
                      <span className="team-badge">{player.team}</span>
                      <span className={`status-badge ${availability.tone}`} title={availability.text}>{availability.label}</span>
                      {isFavorite && <span className="note-badge">Favorite</span>}
                      {tier > 0 && <span className="note-badge">T{tier}</span>}
                      {playerNote && <span className="note-badge" title={playerNote}>Note</span>}
                    </span>
                  </span>
                </div>
                <div className="player-data-strip">
                  <span>Bye {player.bye || '-'}</span>
                  <span>{scoringLabel}</span>
                  {Number.isFinite(player.rankMovement) && player.rankMovement !== 0 && (
                    <span>{player.rankMovement > 0 ? `Up ${player.rankMovement}` : `Down ${Math.abs(player.rankMovement)}`}</span>
                  )}
                </div>
                <button
                  type="button"
                  className={`compare-toggle${isInCompare(player.id) ? ' active' : ''}`}
                  onClick={() => toggleCompare(player)}
                  disabled={!isInCompare(player.id) && compareIds.length >= MAX_COMPARE}
                  aria-pressed={isInCompare(player.id)}
                >
                  {isInCompare(player.id) ? 'Remove' : 'Compare'}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};

const PlayerUpdatesPanel = ({ trends, rankMovements, lookbackHours }) => (
  <section className="player-updates-panel">
    <div className="player-board-heading">
      <div>
        <p className="section-kicker">Player updates</p>
        <h2>Market Watch</h2>
      </div>
      <div className="board-count">Sleeper {lookbackHours}h</div>
    </div>
    <div className="updated-row">
      {!trends.loading && (
        <UpdatedAt
          at={trends.fetchedAt}
          label={trends.error ? 'Trends snapshot taken' : 'Trends updated'}
          staleAfterHours={trends.error ? lookbackHours : null}
        />
      )}
      <UpdatedAt at={playerInsightsMeta.generatedAt} label="Rank movement updated" staleAfterHours={POOL_STALE_HOURS} />
    </div>

    <div className="player-update-grid">
      <PlayerUpdateColumn
        title="Trending Adds"
        eyebrow="Waiver heat"
        items={trends.add}
        tone="up"
        emptyText={trends.loading ? 'Loading live trends...' : 'No add trends yet'}
        getMetric={(item) => `${formatCompactCount(item.count)} adds`}
      />
      <PlayerUpdateColumn
        title="Trending Drops"
        eyebrow="Cooling off"
        items={trends.drop}
        tone="down"
        emptyText={trends.loading ? 'Loading live trends...' : 'No drop trends yet'}
        getMetric={(item) => `${formatCompactCount(item.count)} drops`}
      />
      <PlayerUpdateColumn
        title="Rank Risers"
        eyebrow="Pool movement"
        items={rankMovements.risers}
        tone="up"
        emptyText="Rank movement appears after the next pool refresh."
        getMetric={(item) => formatMovementMetric(item)}
      />
      <PlayerUpdateColumn
        title="Rank Fallers"
        eyebrow="Pool movement"
        items={rankMovements.fallers}
        tone="down"
        emptyText="Rank movement appears after the next pool refresh."
        getMetric={(item) => formatMovementMetric(item)}
      />
    </div>

    {trends.error && <p className="player-update-footnote">{trends.error}. Showing the last generated snapshot when available.</p>}
  </section>
);

const PlayerUpdateColumn = ({ title, eyebrow, items, tone, emptyText, getMetric }) => (
  <div className="player-update-card">
    <div className="player-update-card-header">
      <span>{eyebrow}</span>
      <strong>{title}</strong>
    </div>
    {(items || []).length > 0 ? (
      <ul className="player-update-list">
        {(items || []).slice(0, 5).map((item) => (
          <li key={`${title}-${item.playerId || item.name}`}>
            <span>
              <strong>{item.name}</strong>
              <small>{formatPlayerMeta(item)}</small>
            </span>
            <em className={`player-update-metric ${tone}`}>{getMetric(item)}</em>
          </li>
        ))}
      </ul>
    ) : (
      <p className="player-update-empty">{emptyText}</p>
    )}
  </div>
);

const fetchSleeperTrend = async (type) => {
  const params = new URLSearchParams({
    lookback_hours: String(getTrendLookbackHours()),
    limit: String(LIVE_TREND_LIMIT),
  });
  const response = await fetch(`${SLEEPER_TRENDING_BASE_URL}/${type}?${params.toString()}`);
  if (!response.ok) throw new Error(`${type} trends returned ${response.status}`);
  return response.json();
};

const hydrateTrendItems = (items, playerBoard, limit = LIVE_TREND_LIMIT) => {
  const playerMap = buildPlayerMap(playerBoard);

  return (items || [])
    .map((item) => {
      const sleeperId = item.sleeperId || item.player_id || item.id || String(item.playerId || '').replace(/^sleeper-/, '');
      const playerId = item.playerId || (sleeperId ? `sleeper-${sleeperId}` : null);
      const player = playerId ? playerMap.get(playerId) : null;
      if (!player && !item.name) return null;

      return {
        playerId,
        sleeperId,
        name: player?.name || item.name || sleeperId,
        position: player?.position || item.position || '-',
        team: player?.team || item.team || '-',
        rank: player?.scoringRank || item.rank || null,
        count: toNumber(item.count, 0),
      };
    })
    .filter(Boolean)
    .slice(0, limit);
};

const hydrateMovementItems = (items, playerBoard) => {
  const playerMap = buildPlayerMap(playerBoard);

  return (items || []).map((item) => {
    const player = playerMap.get(item.playerId);
    return {
      ...item,
      name: player?.name || item.name,
      position: player?.position || item.position || '-',
      team: player?.team || item.team || '-',
      rank: player?.scoringRank || item.rank || null,
      rankMovement: toNumber(item.rankMovement, 0),
    };
  }).filter((item) => item.name);
};

const buildPlayerMap = (playerBoard) => new Map((playerBoard || []).map((player) => [player.id, player]));

const formatPlayerMeta = (item) => {
  const pieces = [item.position, item.team, item.rank ? `#${item.rank}` : null].filter(Boolean);
  return pieces.join(' / ') || 'Player pool';
};

const formatMovementMetric = (item) => {
  const movement = toNumber(item.rankMovement, 0);
  if (!movement) return 'new';
  return movement > 0 ? `+${movement}` : `${movement}`;
};

const formatCompactCount = (value) => {
  const count = toNumber(value, 0);
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
};

// The player pool is rebuilt weekly, so a pool more than about a week old has missed an update.
const POOL_STALE_HOURS = 8 * 24;

const getTrendLookbackHours = () => toNumber(playerInsightsMeta.trendsLookbackHours, 24) || 24;

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default Home;
