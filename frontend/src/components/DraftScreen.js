import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../AuthContext';
import { HubConnectionBuilder } from '@microsoft/signalr';
import { getSignalRInfo } from '../api';
import '../App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

const DraftScreen = () => {
    const { leagueId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [league, setLeague] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLeagueState = async () => {
            if (!user?.userId) return;
            try {
                const response = await axios.get(`${API_BASE_URL}/leagues/${leagueId}/state`);
                setLeague(response.data);
            } catch (error) {
                console.error("Error fetching league state:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchLeagueState();
    }, [leagueId, user]);

    useEffect(() => {
        let connection;
        const setupSignalR = async () => {
            try {
                const info = await getSignalRInfo();
                connection = new HubConnectionBuilder()
                    .withUrl(info.data.url, { accessTokenFactory: () => info.data.accessToken })
                    .withAutomaticReconnect()
                    .build();

                connection.on('draftStateUpdate', (updatedLeague) => {
                    if (updatedLeague.id === leagueId) {
                        setLeague(updatedLeague);
                    }
                });
                
                connection.on('draftStarted', (startedLeagueId) => {
                     if (startedLeagueId === leagueId) {
                        window.location.reload(); 
                    }
                });

                await connection.start();
            } catch (e) {
                console.error("SignalR Connection Failed: ", e);
            }
        };

        setupSignalR();
        return () => {
            if (connection) connection.stop();
        };
    }, [leagueId, navigate]);

    if (loading) return <div>Loading Draft Room...</div>;
    if (!league) return <div>Could not load league.</div>;

    const isLobbyPhase = league.status.toLowerCase() === 'created' || league.status.toLowerCase() === 'lobby';
    
    return (
        <div style={{ padding: '20px' }}>
            <h2>Drafting in {league.name}</h2>
            <p>League Status: <span style={{fontWeight: 'bold'}}>{league.status.toUpperCase()}</span></p>

            {isLobbyPhase ? (
                <LobbyView league={league} user={user} leagueId={leagueId} />
            ) : (
                <DraftingView league={league} user={user} leagueId={leagueId} />
            )}
        </div>
    );
};

const LobbyView = ({ league, user, leagueId }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortPosition, setSortPosition] = useState('All Positions');

    const userTeam = league.teams.find(team => team.ownerId === user.userId);
    const userFavorites = userTeam?.favoritePlayerIds || [];
    const allPlayers = league.initialPlayerPool || [];

    const favoritePlayers = allPlayers.filter(p => userFavorites.includes(p.id) && p.name.toLowerCase().includes(searchTerm.toLowerCase()) && (sortPosition === 'All Positions' || p.position === sortPosition));
    const availablePlayers = allPlayers.filter(p => !userFavorites.includes(p.id) && !p.isDrafted && p.name.toLowerCase().includes(searchTerm.toLowerCase()) && (sortPosition === 'All Positions' || p.position === sortPosition));
    
    const isCurrentUserAdmin = league.adminId === user.userId;
    
    const nonAdminMembers = league.members.filter(id => id !== league.adminId);
    const allNonAdminsReady = nonAdminMembers.every(memberId => league.readyMembers.includes(memberId));
    const canStartDraft = isCurrentUserAdmin && (nonAdminMembers.length === 0 || allNonAdminsReady);

    const handleSetReadyStatus = async () => {
        const currentStatus = league.readyMembers.includes(user.userId);
        try {
            // Note: The backend will broadcast a 'draftStateUpdate' on success
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/ready`, { userId: user.userId, isReady: !currentStatus });
        } catch (error) {
            alert(`Failed to update ready status: ${error.response?.data || error.message}`);
        }
    };
    
    const handleStartDraft = async () => {
        try {
            // Note: The backend will broadcast a 'draftStarted' on success
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/startDraft`, { adminId: user.userId });
        } catch (error) {
            alert(`Failed to start draft: ${error.response?.data || error.message}`);
        }
    };
    
    const handleToggleFavorite = async (playerIdToToggle) => {
        const isCurrentlyFavorite = userFavorites.includes(playerIdToToggle);
        const newFavoriteIds = isCurrentlyFavorite ? userFavorites.filter(id => id !== playerIdToToggle) : [...userFavorites, playerIdToToggle];
        try {
            // Note: The backend will broadcast a 'draftStateUpdate' on success
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/favorites`, { userId: user.userId, playerIds: newFavoriteIds });
        } catch (error) {
            console.error("Error updating favorite players:", error);
            alert("Failed to update your favorite players.");
        }
    };
    
    return (
        <>
            <div className="card">
                <h3>Draft Controls & Overview</h3>
                {isCurrentUserAdmin ? (
                    <button onClick={handleStartDraft} className={`start-draft-button ${canStartDraft ? 'ready' : ''}`} disabled={!canStartDraft}>
                        Start Draft ({league.readyMembers.length}/{nonAdminMembers.length} Ready)
                    </button>
                ) : (
                    <button onClick={handleSetReadyStatus} className={`ready-button ${league.readyMembers.includes(user.userId) ? 'ready' : ''}`}>
                        {league.readyMembers.includes(user.userId) ? "You are Ready!" : "I'm Ready!"}
                    </button>
                )}
            </div>

            <div className="card" style={{marginTop: '20px'}}>
                <h3>League Teams</h3>
                {/* Team list UI can be added here */}
            </div>

            <div className="card" style={{ marginTop: '20px' }}>
                <h3>Player Lists</h3>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
                    <select onChange={(e) => setSortPosition(e.target.value)} value={sortPosition}>
                        <option>All Positions</option>
                        <option>QB</option><option>RB</option><option>WR</option><option>TE</option><option>K</option><option>DEF</option>
                    </select>
                    <input type="text" placeholder="Search for a player..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '8px' }} />
                </div>
                <h4>Your Favorited Players ({favoritePlayers.length})</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {favoritePlayers.map(player => (
                        <li key={player.id} className="player-list-item">
                            <span>{player.name} ({player.position})</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <span style={{ color: 'gold', fontSize: '24px' }}>★</span>
                                <span onClick={() => handleToggleFavorite(player.id)} style={{ color: 'red', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }}>X</span>
                            </div>
                        </li>
                    ))}
                </ul>
                <h4 style={{marginTop: '20px'}}>Available Players ({availablePlayers.length})</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {availablePlayers.map(player => (
                        <li key={player.id} className="player-list-item">
                            <span>{player.name} ({player.position})</span>
                            <span onClick={() => handleToggleFavorite(player.id)} style={{ color: '#ccc', cursor: 'pointer', fontSize: '24px' }} title="Add to Favorites">☆</span>
                        </li>
                    ))}
                </ul>
            </div>
        </>
    );
};

const DraftingView = ({ league, user, leagueId }) => {
    const [bidAmount, setBidAmount] = useState(1);
    const [timer, setTimer] = useState(0);

    const currentPlayer = league.initialPlayerPool.find(p => p.id === league.currentPlayerId);

    let highBid = { amount: 0, teamName: "No bids yet" };
    if (league.activeBids && Object.keys(league.activeBids).length > 0) {
        const bids = Object.entries(league.activeBids);
        const [topBidderId, topBid] = bids.sort(([,a],[,b]) => b.amount - a.amount)[0];
        const topBidderTeam = league.teams.find(t => t.ownerId === topBidderId);
        highBid = { amount: topBid.amount, teamName: topBidderTeam.name };
    }

    useEffect(() => {
        const calculateTimeLeft = () => {
            if (league.auctionTimer?.endTime) {
                const endTime = new Date(league.auctionTimer.endTime).getTime();
                const now = new Date().getTime();
                const difference = endTime - now;
                return Math.max(0, Math.floor(difference / 1000));
            }
            return 0;
        };

        const interval = setInterval(() => {
            setTimer(calculateTimeLeft());
        }, 1000);

        return () => clearInterval(interval);
    }, [league.auctionTimer]);

    const handlePlaceBid = async () => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/bid`, { 
                userId: user.userId, 
                amount: parseInt(bidAmount) 
            });
        } catch (error) {
            alert(`Error placing bid: ${error.response?.data || error.message}`);
        }
    };

    if (!currentPlayer) {
        return <div className="card">Waiting for next player... or the draft is over!</div>;
    }

    return (
        <>
            <div className="card">
                <h3>Draft Controls & Overview</h3>
                {league.adminId === user.userId && (
                    <div>
                        <button>Resume Draft</button> <button>Skip Player</button> <button>Nominate Player</button>
                    </div>
                )}
            </div>
            
            <div className="card" style={{marginTop: '20px'}}>
                <h3>Current Player Up for Bid:</h3>
                <h2>{currentPlayer.name} - {currentPlayer.position}</h2>
                <p>High Bid: ${highBid.amount} ({highBid.teamName})</p>
                <p style={{fontSize: '24px', color: 'red', fontWeight: 'bold'}}>
                    Bid Ends In: {timer}s
                </p>
                
                <div>
                    Your Bid: <input type="number" value={bidAmount} onChange={e => setBidAmount(e.target.value)} style={{width: '60px', margin: '0 10px'}} />
                    <button onClick={handlePlaceBid}>Place Bid</button>
                </div>
            </div>

            <div className="card" style={{marginTop: '20px'}}>
                <h3>League Teams:</h3>
                {league.teams.map(team => (
                    <div key={team.id} style={{padding: '5px 0', borderBottom: '1px solid #eee'}}>
                        <p style={{margin: '5px 0'}}>
                            <strong>{team.name}</strong> ({team.ownerId === user.userId ? 'You' : ''}) - 
                            Budget: <strong>${team.budget}</strong>
                        </p>
                    </div>
                ))}
            </div>
        </>
    );
};

export default DraftScreen;