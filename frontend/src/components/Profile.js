import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../AuthContext';
import { initialPlayerList } from '../data/playerData';
import '../App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';
const POSITION_OPTIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];

const Profile = () => {
    const { user } = useAuth();
    const [userProfile, setUserProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortPosition, setSortPosition] = useState('All Positions');

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

    const handleToggleGlobalFavorite = async (playerIdToToggle) => {
        if (!userProfile) return;

        const currentFavorites = userProfile.favoritePlayerIds || [];
        const isCurrentlyFavorite = currentFavorites.includes(playerIdToToggle);
        const newFavoriteIds = isCurrentlyFavorite
            ? currentFavorites.filter(id => id !== playerIdToToggle)
            : [...currentFavorites, playerIdToToggle];

        const updatedProfile = { ...userProfile, favoritePlayerIds: newFavoriteIds };
        setUserProfile(updatedProfile);

        try {
            await axios.post(`${API_BASE_URL}/user-profile/${user.userId}`, {
                favoritePlayerIds: newFavoriteIds
            });
        } catch (error) {
            console.error('Error updating profile:', error);
            alert('Failed to save your favorites. Reverting change.');
            setUserProfile(userProfile);
        }
    };

    if (loading) return <div className="loading-panel">Loading your profile...</div>;
    if (!userProfile) return <div className="empty-state">Could not load your profile.</div>;

    const favoriteCount = userProfile.favoritePlayerIds?.length || 0;
    const filteredPlayerPool = initialPlayerList
        .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .filter(p => sortPosition === 'All Positions' || p.position === sortPosition);

    return (
        <div className="page-shell profile-page">
            <section className="page-hero">
                <p className="page-kicker">Personal draft board</p>
                <h1>My Profile</h1>
                <p>{userProfile.displayName}, tune the master favorites list that seeds your new leagues.</p>
                <div className="scoreboard-strip">
                    <span>{favoriteCount} favorites</span>
                    <span>{filteredPlayerPool.length} players in view</span>
                </div>
            </section>

            <section className="player-pool-panel">
                <p className="section-kicker">Master player list</p>
                <h2>Player Board</h2>
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
                    {filteredPlayerPool.map(player => {
                        const isFavorite = userProfile.favoritePlayerIds.includes(player.id);
                        return (
                            <li key={player.id} className="player-list-item">
                                <span>
                                    <span className="player-name">{player.name}</span>{' '}
                                    <span className="position-badge">{player.position}</span>{' '}
                                    <span className="team-badge">{player.team}</span>{' '}
                                    <span>Rank: {player.rank} | Bye: {player.bye}</span>
                                </span>
                                <button
                                    onClick={() => handleToggleGlobalFavorite(player.id)}
                                    className={isFavorite ? 'edit-roster-button' : 'join-button'}
                                    title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                                >
                                    {isFavorite ? 'Favorited' : 'Favorite'}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </section>
        </div>
    );
};

export default Profile;
