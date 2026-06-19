import React, { useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../AuthContext';
import { initialPlayerList, playerPoolMeta } from '../data/playerData';
import {
    buildPlayerBoard,
    filterPlayerBoard,
    getScoringLabel,
    getUnavailableFavoriteIds,
    PLAYER_LIMIT_OPTIONS,
    POSITION_FILTERS,
    SCORING_MODES,
    SORT_OPTIONS,
} from '../data/playerBoardUtils';
import '../App.css';
import '../PlayerBoard.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

const Profile = () => {
    const { user } = useAuth();
    const [userProfile, setUserProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [positionFilter, setPositionFilter] = useState('ALL');
    const [scoringMode, setScoringMode] = useState('PPR');
    const [sortBy, setSortBy] = useState('rank');
    const [playerLimit, setPlayerLimit] = useState(350);

    useEffect(() => {
        const getProfile = async () => {
            if (!user) return;
            try {
                const response = await axios.post(`${API_BASE_URL}/user-profile`, {
                    userId: user.userId,
                    displayName: user.userDetails
                });
                setUserProfile(response.data);
            } catch (error) {
                console.error('Error fetching user profile:', error);
                alert('Could not fetch your profile.');
            } finally {
                setLoading(false);
            }
        };
        getProfile();
    }, [user]);

    const playerBoard = useMemo(() => buildPlayerBoard(initialPlayerList, scoringMode), [scoringMode]);
    const filteredPlayerPool = useMemo(() => filterPlayerBoard(playerBoard, {
        searchTerm,
        positionFilter,
        sortBy,
    }), [playerBoard, searchTerm, positionFilter, sortBy]);
    const visiblePlayers = filteredPlayerPool.slice(0, playerLimit);
    const scoringLabel = getScoringLabel(scoringMode);
    const favoriteIds = userProfile?.favoritePlayerIds || [];
    const unavailableFavoriteIds = getUnavailableFavoriteIds(favoriteIds, playerBoard);

    const saveFavoriteIds = async (newFavoriteIds, previousProfile = userProfile) => {
        if (!userProfile) return;

        const updatedProfile = { ...userProfile, favoritePlayerIds: newFavoriteIds };
        setUserProfile(updatedProfile);

        try {
            await axios.post(`${API_BASE_URL}/user-profile/${user.userId}`, {
                favoritePlayerIds: newFavoriteIds
            });
        } catch (error) {
            console.error('Error updating profile:', error);
            alert('Failed to save your favorites. Reverting change.');
            setUserProfile(previousProfile);
        }
    };

    const handleToggleGlobalFavorite = async (playerIdToToggle) => {
        if (!userProfile) return;

        const isCurrentlyFavorite = favoriteIds.includes(playerIdToToggle);
        const newFavoriteIds = isCurrentlyFavorite
            ? favoriteIds.filter(id => id !== playerIdToToggle)
            : [...favoriteIds, playerIdToToggle];

        await saveFavoriteIds(newFavoriteIds);
    };

    const handleClearUnavailableFavorites = async () => {
        const activePlayerIds = new Set(playerBoard.map((player) => player.id));
        await saveFavoriteIds(favoriteIds.filter((playerId) => activePlayerIds.has(playerId)));
    };

    if (loading) return <div className="loading-panel">Loading your profile...</div>;
    if (!userProfile) return <div className="empty-state">Could not load your profile.</div>;

    const favoriteCount = favoriteIds.length;

    return (
        <div className="page-shell profile-page">
            <section className="page-hero">
                <p className="page-kicker">Personal draft board</p>
                <h1>My Profile</h1>
                <p>{userProfile.displayName}, tune the master favorites list that seeds your new leagues.</p>
                <div className="scoreboard-strip">
                    <span>{favoriteCount} favorites</span>
                    <span>{visiblePlayers.length} players in view</span>
                    <span>{scoringLabel}</span>
                    <span>Updated {formatDate(playerPoolMeta.fetchedAt)}</span>
                </div>
            </section>

            {unavailableFavoriteIds.length > 0 && (
                <section className="empty-state unavailable-favorites">
                    <div>
                        <p className="section-kicker">Favorites cleanup</p>
                        <h3>{unavailableFavoriteIds.length} saved favorite{unavailableFavoriteIds.length === 1 ? '' : 's'} not in this player pool</h3>
                        <p>These IDs may belong to retired, free-agent, or filtered-out players from an older pool.</p>
                    </div>
                    <button className="cancel-button" onClick={handleClearUnavailableFavorites}>Remove Unavailable</button>
                </section>
            )}

            <section className="player-pool-panel">
                <div className="player-board-heading">
                    <div>
                        <p className="section-kicker">Master player list</p>
                        <h2>Player Board</h2>
                    </div>
                    <div className="board-count">
                        Showing {visiblePlayers.length} of {filteredPlayerPool.length}
                    </div>
                </div>

                <div className="filter-bar player-board-controls">
                    <label className="filter-field">
                        <span>Position</span>
                        <select onChange={(e) => setPositionFilter(e.target.value)} value={positionFilter} aria-label="Filter by position">
                            {POSITION_FILTERS.map(position => <option key={position.value} value={position.value}>{position.label}</option>)}
                        </select>
                    </label>
                    <label className="filter-field">
                        <span>Scoring</span>
                        <select onChange={(e) => setScoringMode(e.target.value)} value={scoringMode} aria-label="Scoring format">
                            {SCORING_MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                        </select>
                    </label>
                    <label className="filter-field">
                        <span>Sort</span>
                        <select onChange={(e) => setSortBy(e.target.value)} value={sortBy} aria-label="Sort players">
                            {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                    </label>
                    <label className="filter-field">
                        <span>Show</span>
                        <select onChange={(e) => setPlayerLimit(Number(e.target.value))} value={playerLimit} aria-label="Players to show">
                            {PLAYER_LIMIT_OPTIONS.map(limit => <option key={limit} value={limit}>Top {limit}</option>)}
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
                    {visiblePlayers.map(player => {
                        const isFavorite = favoriteIds.includes(player.id);
                        return (
                            <li key={player.id} className={`player-list-item player-board-row ${isFavorite ? 'is-favorite' : ''}`}>
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
                                <div className="player-row-actions">
                                    <div className="player-data-strip">
                                        <span>Bye {player.bye || '-'}</span>
                                        <span>{scoringLabel}</span>
                                    </div>
                                    <button
                                        onClick={() => handleToggleGlobalFavorite(player.id)}
                                        className={isFavorite ? 'edit-roster-button' : 'join-button'}
                                        title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                                    >
                                        {isFavorite ? 'Favorited' : 'Favorite'}
                                    </button>
                                </div>
                            </li>
                        );
                    })}
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

export default Profile;
