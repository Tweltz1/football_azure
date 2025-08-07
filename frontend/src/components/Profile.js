import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../AuthContext';
import '../App.css';
import { initialPlayerList } from '../data/playerData';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

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
                // Call our new GetOrCreateUserProfile function
                const response = await axios.post(`${API_BASE_URL}/user-profile`, {
                    userId: user.userId,
                    displayName: user.userDetails
                });
                setUserProfile(response.data);
            } catch (error) {
                console.error("Error fetching user profile:", error);
                alert("Could not fetch your profile.");
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

        // Optimistic UI update
        const updatedProfile = { ...userProfile, favoritePlayerIds: newFavoriteIds };
        setUserProfile(updatedProfile);

        try {
            // Call our new UpdateUserProfile function
            await axios.post(`${API_BASE_URL}/user-profile/${user.userId}`, {
                favoritePlayerIds: newFavoriteIds
            });
        } catch (error) {
            console.error("Error updating profile:", error);
            alert("Failed to save your favorites. Reverting change.");
            // Revert optimistic update on failure
            setUserProfile(userProfile);
        }
    };

    if (loading) return <div>Loading your profile...</div>;
    if (!userProfile) return <div>Could not load your profile.</div>;

    const filteredPlayerPool = initialPlayerList
        .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .filter(p => sortPosition === 'All Positions' || p.position === sortPosition);

    return (
        <div style={{ padding: '20px' }}>
            <h2>My Profile</h2>
            <p>Welcome, {userProfile.displayName}. Manage your master list of favorite players here.</p>
            <p>This list will be used as the default for any new leagues you create.</p>

            <div className="card" style={{ marginTop: '20px' }}>
                <h3>Master Player List</h3>
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

                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {filteredPlayerPool.map(player => {
                        const isFavorite = userProfile.favoritePlayerIds.includes(player.id);
                        return (
                            <li key={player.id} className="player-list-item">
                                <span>{player.name} ({player.position})</span>
                                <span 
                                    onClick={() => handleToggleGlobalFavorite(player.id)} 
                                    style={{
                                        cursor: 'pointer',
                                        color: isFavorite ? 'gold' : '#ccc',
                                        fontSize: '24px'
                                    }}
                                    title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                                >
                                    {isFavorite ? '★' : '☆'}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
};

export default Profile;