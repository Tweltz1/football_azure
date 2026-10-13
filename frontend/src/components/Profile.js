import React, { useCallback, useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../api';
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
import {
    buildBudgetPlannerSummary,
    BUDGET_ROSTER_FIELDS,
    DEFAULT_BUDGET_PLAN,
    DEFAULT_BUDGET_ROSTER_SETTINGS,
    getPlayerAvailability,
    normalizeBudgetPlan,
    normalizeBudgetRosterSettings,
    POSITION_PLAN_ORDER,
    TIER_DEFINITIONS,
} from '../data/strategyUtils';
import TierBoard from './TierBoard';
import { notifyProfileUpdated } from '../profileSync';
import '../App.css';
import '../PlayerBoard.css';


const Profile = () => {
    const { user } = useAuth();
    const [userProfile, setUserProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [displayName, setDisplayName] = useState('');
    const [defaultTeamName, setDefaultTeamName] = useState('');
    const [profileMessage, setProfileMessage] = useState('');
    const [noteDrafts, setNoteDrafts] = useState({});
    const [tierAssignments, setTierAssignments] = useState({});
    const [budgetPlan, setBudgetPlan] = useState(DEFAULT_BUDGET_PLAN);
    const [budgetRosterSettings, setBudgetRosterSettings] = useState(DEFAULT_BUDGET_ROSTER_SETTINGS);
    const [boardView, setBoardView] = useState('list');
    const [searchTerm, setSearchTerm] = useState('');
    const [positionFilter, setPositionFilter] = useState('ALL');
    const [scoringMode, setScoringMode] = useState('PPR');
    const [sortBy, setSortBy] = useState('rank');
    const [playerLimit, setPlayerLimit] = useState(350);

    const syncProfileFields = useCallback((profile, syncNotes = true, syncStrategy = true) => {
        setDisplayName(profile?.displayName || '');
        setDefaultTeamName(profile?.defaultTeamName || '');
        if (syncNotes) {
            setNoteDrafts(profile?.playerNotes || {});
        }
        if (syncStrategy) {
            setTierAssignments(profile?.playerTiers || {});
            setBudgetPlan(normalizeBudgetPlan(profile?.budgetPlan || DEFAULT_BUDGET_PLAN));
            setBudgetRosterSettings(normalizeBudgetRosterSettings(profile?.budgetRosterSettings || DEFAULT_BUDGET_ROSTER_SETTINGS));
        }
    }, []);

    useEffect(() => {
        const getProfile = async () => {
            if (!user) return;
            try {
                const response = await axios.post(`${API_BASE_URL}/user-profile`, {
                    userId: user.userId,
                    displayName: user.userDetails
                });
                setUserProfile(response.data);
                syncProfileFields(response.data);
            } catch (error) {
                console.error('Error fetching user profile:', error);
                alert('Could not fetch your profile.');
            } finally {
                setLoading(false);
            }
        };
        getProfile();
    }, [user, syncProfileFields]);

    const playerBoard = useMemo(() => buildPlayerBoard(initialPlayerList, scoringMode), [scoringMode]);
    const filteredPlayerPool = useMemo(() => filterPlayerBoard(playerBoard, {
        searchTerm,
        positionFilter,
        sortBy,
    }), [playerBoard, searchTerm, positionFilter, sortBy]);
    const visiblePlayers = filteredPlayerPool.slice(0, playerLimit);
    const scoringLabel = getScoringLabel(scoringMode);
    const favoriteIds = userProfile?.favoritePlayerIds || [];
    const favoritePlayers = playerBoard.filter(player => favoriteIds.includes(player.id));
    const unavailableFavoriteIds = getUnavailableFavoriteIds(favoriteIds, playerBoard);
    const unavailableTierIds = useMemo(() => {
        const activePlayerIds = new Set(playerBoard.map((player) => player.id));
        return Object.keys(tierAssignments).filter((playerId) => !activePlayerIds.has(playerId));
    }, [playerBoard, tierAssignments]);
    const budgetSummary = useMemo(() => buildBudgetPlannerSummary(budgetPlan, budgetRosterSettings), [budgetPlan, budgetRosterSettings]);
    const rosterSlotCount = budgetSummary.rows.reduce((sum, row) => sum + row.slots, 0);

    const saveProfilePatch = async (patch, { previousProfile = userProfile, syncNotes = false, syncStrategy = true, successMessage = 'Saved' } = {}) => {
        if (!userProfile) return null;

        try {
            const response = await axios.post(`${API_BASE_URL}/user-profile/${user.userId}`, patch);
            setUserProfile(response.data);
            syncProfileFields(response.data, syncNotes, syncStrategy);
            notifyProfileUpdated();
            setProfileMessage(successMessage);
            setTimeout(() => setProfileMessage(''), 2500);
            return response.data;
        } catch (error) {
            console.error('Error updating profile:', error);
            alert(`Failed to save profile: ${error.response?.data || error.message}`);
            setUserProfile(previousProfile);
            syncProfileFields(previousProfile, syncNotes, syncStrategy);
            return null;
        }
    };

    const handleSaveProfileSettings = async (event) => {
        event.preventDefault();

        const trimmedDisplayName = displayName.trim();
        const trimmedTeamName = defaultTeamName.trim();
        if (!trimmedDisplayName || !trimmedTeamName) {
            alert('Display name and team name are required.');
            return;
        }

        await saveProfilePatch({
            displayName: trimmedDisplayName,
            defaultTeamName: trimmedTeamName,
        }, { successMessage: 'Profile saved' });
    };

    const saveFavoriteIds = async (newFavoriteIds, previousProfile = userProfile) => {
        const optimisticProfile = { ...userProfile, favoritePlayerIds: newFavoriteIds };
        setUserProfile(optimisticProfile);
        await saveProfilePatch({ favoritePlayerIds: newFavoriteIds }, {
            previousProfile,
            syncNotes: false,
            successMessage: 'Favorites saved',
        });
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

    const handleClearUnavailableTiers = async () => {
        const activePlayerIds = new Set(playerBoard.map((player) => player.id));
        const nextTiers = Object.fromEntries(Object.entries(tierAssignments).filter(([playerId]) => activePlayerIds.has(playerId)));
        setTierAssignments(nextTiers);
        await saveProfilePatch({ playerTiers: nextTiers }, { successMessage: 'Tiers cleaned up' });
    };

    const handleNoteChange = (playerId, value) => {
        setNoteDrafts(prev => ({ ...prev, [playerId]: value }));
    };

    const handleSavePlayerNote = async (playerId) => {
        const nextNotes = { ...(userProfile?.playerNotes || {}) };
        const trimmedNote = (noteDrafts[playerId] || '').trim();

        if (trimmedNote) {
            nextNotes[playerId] = trimmedNote;
        } else {
            delete nextNotes[playerId];
        }

        await saveProfilePatch({ playerNotes: nextNotes }, {
            syncNotes: true,
            successMessage: 'Note saved',
        });
    };

    const handleTierChange = async (playerId, tierValue) => {
        const previousProfile = userProfile;
        const nextTiers = { ...(tierAssignments || {}) };
        if (tierValue) {
            nextTiers[playerId] = Number(tierValue);
        } else {
            delete nextTiers[playerId];
        }

        setTierAssignments(nextTiers);
        setUserProfile({ ...userProfile, playerTiers: nextTiers });
        await saveProfilePatch({ playerTiers: nextTiers }, {
            previousProfile,
            syncNotes: false,
            successMessage: 'Tiers saved',
        });
    };

    const handleBudgetChange = (position, value) => {
        setBudgetPlan((current) => ({ ...current, [position]: Math.max(0, Number(value) || 0) }));
    };

    const handleRosterSettingChange = (key, value) => {
        setBudgetRosterSettings((current) => ({ ...current, [key]: Math.max(0, Number(value) || 0) }));
    };

    const handleSaveBudgetPlan = async () => {
        const normalizedPlan = normalizeBudgetPlan(budgetPlan);
        const normalizedRosterSettings = normalizeBudgetRosterSettings(budgetRosterSettings);
        setBudgetPlan(normalizedPlan);
        setBudgetRosterSettings(normalizedRosterSettings);
        await saveProfilePatch({
            budgetPlan: normalizedPlan,
            budgetRosterSettings: normalizedRosterSettings,
        }, {
            syncNotes: false,
            successMessage: 'Budget plan saved',
        });
    };

    if (loading) return <div className="loading-panel">Loading your profile...</div>;
    if (!userProfile) return <div className="empty-state">Could not load your profile.</div>;

    const favoriteCount = favoriteIds.length;
    const tieredCount = Object.keys(tierAssignments).length;

    return (
        <div className="page-shell profile-page">
            <section className="page-hero">
                <p className="page-kicker">Personal draft board</p>
                <h1>My Profile</h1>
                <p>{userProfile.displayName}, tune the master favorites, notes, tiers, and budget plan that guide draft night.</p>
                <div className="scoreboard-strip">
                    <span>{favoriteCount} favorites</span>
                    <span>{tieredCount} tiered players</span>
                    <span>{visiblePlayers.length} players in view</span>
                    <span>{scoringLabel}</span>
                    <span>Updated {formatDate(playerPoolMeta.fetchedAt)}</span>
                </div>
            </section>

            <section className="card profile-settings-panel">
                <div className="player-board-heading">
                    <div>
                        <p className="section-kicker">Profile identity</p>
                        <h2>Name & Team</h2>
                    </div>
                    {profileMessage && <div className="board-count">{profileMessage}</div>}
                </div>
                <form onSubmit={handleSaveProfileSettings} className="profile-settings-form">
                    <div className="form-grid">
                        <label>
                            Display Name
                            <input
                                type="text"
                                value={displayName}
                                onChange={(event) => setDisplayName(event.target.value)}
                                required
                            />
                        </label>
                        <label>
                            Default Team Name
                            <input
                                type="text"
                                value={defaultTeamName}
                                onChange={(event) => setDefaultTeamName(event.target.value)}
                                required
                            />
                        </label>
                    </div>
                    <div className="form-actions" style={{ marginTop: '18px' }}>
                        <button type="submit" className="create-button">Save Profile</button>
                    </div>
                </form>
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

            {unavailableTierIds.length > 0 && (
                <section className="empty-state unavailable-favorites">
                    <div>
                        <p className="section-kicker">Tier cleanup</p>
                        <h3>{unavailableTierIds.length} tier assignment{unavailableTierIds.length === 1 ? '' : 's'} not in this player pool</h3>
                        <p>Weekly pool updates can remove old player IDs. Clean them up when you are ready.</p>
                    </div>
                    <button className="cancel-button" onClick={handleClearUnavailableTiers}>Remove Old Tiers</button>
                </section>
            )}

            <section className="player-pool-panel">
                <div className="player-board-heading">
                    <div>
                        <p className="section-kicker">Private board</p>
                        <h2>Favorites & Notes</h2>
                    </div>
                    <div className="board-count">{favoritePlayers.length} active</div>
                </div>

                {favoritePlayers.length > 0 ? (
                    <ul className="player-list favorite-note-list">
                        {favoritePlayers.map(player => (
                            <li key={player.id} className="player-list-item favorite-note-row">
                                <div className="player-main">
                                    <span className="rank-chip">#{player.scoringRank}</span>
                                    <span>
                                        <span className="player-name">{player.name}</span>
                                        <span className="player-subline">
                                            <span className={`position-badge pos-${String(player.position || '').toLowerCase()}`}>{player.position}</span>
                                            <span className="team-badge">{player.team}</span>
                                            <span className="note-badge">Bye {player.bye || '-'}</span>
                                            {tierAssignments[player.id] && <span className="note-badge">T{tierAssignments[player.id]}</span>}
                                        </span>
                                    </span>
                                </div>
                                <div className="favorite-note-editor">
                                    <textarea
                                        value={noteDrafts[player.id] || ''}
                                        onChange={(event) => handleNoteChange(player.id, event.target.value)}
                                        placeholder="Private player note"
                                        maxLength={1000}
                                    />
                                    <div className="player-row-actions">
                                        <button className="edit-roster-button" onClick={() => handleSavePlayerNote(player.id)}>Save Note</button>
                                        <button className="cancel-button" onClick={() => handleToggleGlobalFavorite(player.id)}>Remove</button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="empty-state">No favorite players yet.</div>
                )}
            </section>

            <section className="player-pool-panel">
                <div className="player-board-heading">
                    <div>
                        <p className="section-kicker">Auction plan</p>
                        <h2>Budget Allocation</h2>
                    </div>
                    <div className="board-count">${budgetSummary.total} planned</div>
                </div>

                <div className="budget-summary-grid">
                    <div className="budget-summary-card"><span>Total</span><strong>${budgetSummary.total}</strong></div>
                    <div className="budget-summary-card"><span>Remaining</span><strong>${budgetSummary.remaining}</strong></div>
                    <div className="budget-summary-card"><span>Roster Slots</span><strong>{rosterSlotCount}</strong></div>
                    <div className="budget-summary-card"><span>Status</span><strong>{budgetSummary.remaining >= 0 ? 'Balanced' : 'Over budget'}</strong></div>
                </div>

                <div className="player-board-heading" style={{ marginTop: '22px' }}>
                    <div>
                        <p className="section-kicker">Roster layout</p>
                        <h3>Slot Counts</h3>
                    </div>
                </div>
                <div className="budget-planner-grid roster-layout-grid">
                    {BUDGET_ROSTER_FIELDS.map((field) => (
                        <label key={field.key} className="filter-field">
                            <span>{field.label}</span>
                            <input
                                type="number"
                                min="0"
                                max="30"
                                value={budgetRosterSettings[field.key] || 0}
                                onChange={(event) => handleRosterSettingChange(field.key, event.target.value)}
                            />
                        </label>
                    ))}
                </div>

                <div className="player-board-heading" style={{ marginTop: '22px' }}>
                    <div>
                        <p className="section-kicker">Budget buckets</p>
                        <h3>Dollars by Position</h3>
                    </div>
                </div>
                <div className="budget-planner-grid">
                    {POSITION_PLAN_ORDER.map((position) => (
                        <label key={position} className="filter-field">
                            <span>{position}</span>
                            <input type="number" min="0" max="200" value={budgetPlan[position] || 0} onChange={(event) => handleBudgetChange(position, event.target.value)} />
                        </label>
                    ))}
                </div>
                <div className="budget-row-list">
                    {budgetSummary.rows.filter((row) => row.planned > 0 || row.slots > 0).map((row) => (
                        <div key={row.position} className="budget-row">
                            <strong>{row.position}</strong>
                            <div className="budget-meter"><span style={{ width: `${Math.min(100, (row.planned / 200) * 100)}%` }} /></div>
                            <span>${row.planned}{row.slots ? ` / ${row.slots} slots` : ''}{row.slots ? ` (${row.perSlot} each)` : ''}</span>
                        </div>
                    ))}
                </div>
                <div className="form-actions" style={{ marginTop: '18px' }}>
                    <button type="button" className="create-button" onClick={handleSaveBudgetPlan}>Save Budget Plan</button>
                </div>
            </section>

            <section className="player-pool-panel">
                <div className="player-board-heading">
                    <div>
                        <p className="section-kicker">Master player list</p>
                        <h2>Player Board</h2>
                    </div>
                    <div className="profile-board-actions">
                        <button type="button" className={boardView === 'list' ? 'edit-roster-button' : ''} onClick={() => setBoardView('list')}>List View</button>
                        <button type="button" className={boardView === 'tiers' ? 'edit-roster-button' : ''} onClick={() => setBoardView('tiers')}>Tier View</button>
                        <div className="board-count">Showing {visiblePlayers.length} of {filteredPlayerPool.length}</div>
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

                {boardView === 'tiers' ? (
                    <TierBoard
                        players={visiblePlayers}
                        tierAssignments={tierAssignments}
                        playerNotes={noteDrafts}
                        scoringLabel={scoringLabel}
                        onTierChange={handleTierChange}
                    />
                ) : (
                    <ul className="player-list player-board-list">
                        {visiblePlayers.map(player => {
                            const isFavorite = favoriteIds.includes(player.id);
                            const hasNote = Boolean(userProfile.playerNotes?.[player.id]);
                            const availability = getPlayerAvailability(player);
                            return (
                                <li key={player.id} className={`player-list-item player-board-row ${isFavorite ? 'is-favorite' : ''}`}>
                                    <div className="player-main">
                                        <span className="rank-chip">#{player.scoringRank}</span>
                                        <span>
                                            <span className="player-name">{player.name}</span>
                                            <span className="player-subline">
                                                <span className={`position-badge pos-${String(player.position || '').toLowerCase()}`}>{player.position}</span>
                                                <span className="team-badge">{player.team}</span>
                                                <span className={`status-badge ${availability.tone}`} title={availability.text}>{availability.label}</span>
                                                {hasNote && <span className="note-badge">Note</span>}
                                                {tierAssignments[player.id] && <span className="note-badge">T{tierAssignments[player.id]}</span>}
                                            </span>
                                        </span>
                                    </div>
                                    <div className="player-row-actions">
                                        <div className="player-data-strip">
                                            <span>Bye {player.bye || '-'}</span>
                                            <span>{scoringLabel}</span>
                                        </div>
                                        <select
                                            className="tier-select"
                                            value={tierAssignments[player.id] || ''}
                                            onChange={(event) => handleTierChange(player.id, event.target.value ? Number(event.target.value) : null)}
                                            aria-label={`Tier for ${player.name}`}
                                        >
                                            <option value="">Tier</option>
                                            {TIER_DEFINITIONS.map((tier) => <option key={tier.value} value={tier.value}>T{tier.value}</option>)}
                                        </select>
                                        <input
                                            className="quick-note-field"
                                            type="text"
                                            value={noteDrafts[player.id] || ''}
                                            onChange={(event) => handleNoteChange(player.id, event.target.value)}
                                            placeholder="Private note"
                                            maxLength={160}
                                        />
                                        <button className="edit-roster-button" onClick={() => handleSavePlayerNote(player.id)}>Save Note</button>
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
                )}
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
