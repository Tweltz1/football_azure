import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../AuthContext';
import '../App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

const LeagueDetails = () => {
    const { leagueId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [league, setLeague] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortPosition, setSortPosition] = useState('All Positions');

    const fetchLeagueDetails = useCallback(async () => {
        try {
            // The endpoint remains the same, it now returns the extra 'favoritePlayerIds' field
            const response = await axios.get(`${API_BASE_URL}/leagues/${leagueId}/details`);
            setLeague(response.data);
        } catch (error) {
            console.error("Error fetching league details:", error);
            alert("Failed to fetch league details.");
            navigate('/leagues');
        } finally {
            setLoading(false);
        }
    }, [leagueId, navigate]);

    useEffect(() => {
        if (user?.userId) {
            fetchLeagueDetails();
        }
    }, [fetchLeagueDetails, user]);

    const handleToggleFavorite = async (playerIdToToggle) => {
        if (!league || !user) return;

        const userTeam = league.teams.find(team => team.ownerId === user.userId);
        if (!userTeam) {
            alert("Your team could not be found in this league.");
            return;
        }

        // Determine the new list of favorite IDs
        const currentFavorites = userTeam.favoritePlayerIds || [];
        const isCurrentlyFavorite = currentFavorites.includes(playerIdToToggle);
        const newFavoriteIds = isCurrentlyFavorite
            ? currentFavorites.filter(id => id !== playerIdToToggle)
            : [...currentFavorites, playerIdToToggle];

        // --- Optimistic UI Update ---
        // To make the UI feel instant, we update the local state first.
        const updatedTeams = league.teams.map(team =>
            team.ownerId === user.userId
                ? { ...team, favoritePlayerIds: newFavoriteIds }
                : team
        );
        setLeague({ ...league, teams: updatedTeams });
        // --- End Optimistic UI Update ---

        try {
            // Call the new backend function
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/favorites`, {
                userId: user.userId,
                playerIds: newFavoriteIds
            });
            // If the API call is successful, our optimistic update is now confirmed.
            // No need to re-fetch, as the local state is already correct.

        } catch (error) {
            console.error("Error updating favorite players:", error);
            alert("Failed to update your favorite players. Reverting change.");
            // If the API call fails, revert the change in the UI
            setLeague({ ...league, teams: userTeam });
        }
    };


    if (loading) return <div>Loading league details...</div>;
    if (!league) return <div>League not found.</div>;

    const userTeam = league.teams.find(team => team.ownerId === user.userId);
    const userFavorites = userTeam?.favoritePlayerIds || [];

    // Derive player lists from the single source of truth: `league.initialPlayerPool`
    const allPlayers = league.initialPlayerPool || [];

    const favoritePlayers = allPlayers
        .filter(p => userFavorites.includes(p.id))
        .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .filter(p => sortPosition === 'All Positions' || p.position === sortPosition);

    const availablePlayers = allPlayers
        .filter(p => !userFavorites.includes(p.id))
        .filter(p => !p.isDrafted)
        .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .filter(p => sortPosition === 'All Positions' || p.position === sortPosition);

    const isCurrentUserAdmin = league.adminId === user.userId;
    const allMembersReady = league.members.length > 0 && league.readyMembers.length === league.members.length;
    const canStartDraft = isCurrentUserAdmin && allMembersReady;

    return (
        <div style={{ padding: '20px' }}>
            <h2>Drafting in {league.name}</h2>
            <p>League Status: {league.status.toUpperCase()}</p>

            <div className="card">
                <h3>Draft Controls & Overview</h3>
                {isCurrentUserAdmin ? (
                    <button
                        onClick={() => alert("Start Draft logic to be implemented.")}
                        className={`start-draft-button ${canStartDraft ? 'ready' : ''}`}
                        disabled={!canStartDraft}
                    >
                        Start Draft ({league.readyMembers.length}/{league.members.length} Ready)
                    </button>
                ) : (
                    <button
                        onClick={() => alert("Set Ready Status logic to be implemented.")}
                        className={`ready-button ${league.readyMembers.includes(user.userId) ? 'ready' : ''}`}
                    >
                        {league.readyMembers.includes(user.userId) ? "You are Ready!" : "Click to Ready Up"}
                    </button>
                )}
            </div>

            {/* --- Player Lists Section --- */}
            <div className="card" style={{ marginTop: '20px' }}>
                <h3>Player Lists</h3>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
                    <select onChange={(e) => setSortPosition(e.target.value)} value={sortPosition}>
                        <option>All Positions</option>
                        <option>QB</option><option>RB</option><option>WR</option><option>TE</option><option>K</option><option>DEF</option>
                    </select>
                    <input
                        type="text"
                        placeholder="Search for a player..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ padding: '8px' }}
                    />
                </div>

                {/* FAVORITED PLAYERS */}
                <h4>Your Favorited Players ({favoritePlayers.length})</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {favoritePlayers.length > 0 ? (
                        favoritePlayers.map(player => (
                            <li key={player.id} className="player-list-item">
                                <span>{player.name} ({player.position})</span>
                                <span onClick={() => handleToggleFavorite(player.id)} style={{ color: 'red', cursor: 'pointer' }}>X</span>
                            </li>
                        ))
                    ) : (
                        <p>No favorited players found.</p>
                    )}
                </ul>

                {/* AVAILABLE PLAYERS */}
                <h4 style={{marginTop: '20px'}}>Available Players ({availablePlayers.length})</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {availablePlayers.length > 0 ? (
                        availablePlayers.map(player => (
                            <li key={player.id} className="player-list-item">
                                <span>{player.name} ({player.position})</span>
                                <span onClick={() => handleToggleFavorite(player.id)} style={{ color: 'gold', cursor: 'pointer' }}>★</span>
                            </li>
                        ))
                    ) : (
                        <p>No available players found.</p>
                    )}
                </ul>
            </div>
             {/* --- End Player Lists Section --- */}

            <div style={{ marginTop: '20px', textAlign: 'center' }}>
                <button onClick={() => navigate('/leagues')} className="exit-draft-button">Back to Leagues</button>
            </div>
        </div>
    );
};

export default LeagueDetails;