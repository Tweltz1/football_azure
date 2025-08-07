import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../AuthContext';
import { HubConnectionBuilder } from '@microsoft/signalr';
import { getSignalRInfo } from '../api';
import '../App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

const DraftScreen = () => {
    const { leagueId } = useParams();
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
                
                await connection.start();
            } catch (e) {
                console.error("SignalR Connection Failed: ", e);
            }
        };

        setupSignalR();
        return () => {
            if (connection) connection.stop();
        };
    }, [leagueId]);

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
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/ready`, { userId: user.userId, isReady: !currentStatus });
        } catch (error) {
            alert(`Failed to update ready status: ${error.response?.data || error.message}`);
        }
    };
    
    const handleStartDraft = async () => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/startDraft`, { adminId: user.userId });
        } catch (error) {
            alert(`Failed to start draft: ${error.response?.data || error.message}`);
        }
    };
    
    const handleToggleFavorite = async (playerIdToToggle) => {
        const isCurrentlyFavorite = userFavorites.includes(playerIdToToggle);
        const newFavoriteIds = isCurrentlyFavorite ? userFavorites.filter(id => id !== playerIdToToggle) : [...userFavorites, playerIdToToggle];
        try {
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
                 <TeamListViewer league={league} user={user} />
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
    const isIntermission = league.status.toLowerCase() === 'intermission';

    useEffect(() => {
        let pollInterval;
        if (!isIntermission) {
            pollInterval = setInterval(() => {
                axios.post(`${API_BASE_URL}/leagues/${leagueId}/endBidding`);
            }, 3000);
        }
        return () => clearInterval(pollInterval);
    }, [isIntermission, leagueId]);

    useEffect(() => {
        let pollInterval;
        if (isIntermission) {
            pollInterval = setInterval(() => {
                axios.post(`${API_BASE_URL}/leagues/${leagueId}/nextRound`);
            }, 3000);
        }
        return () => clearInterval(pollInterval);
    }, [isIntermission, leagueId]);


    return (
        <>
            <div className="card">
                <h3>Draft Controls & Overview</h3>
                {league.adminId === user.userId && <AdminControls league={league} user={user} leagueId={leagueId} />}
            </div>
            
            {isIntermission ? (
                <IntermissionView league={league} />
            ) : (
                <AuctionView league={league} user={user} leagueId={leagueId} />
            )}

            <div className="card" style={{marginTop: '20px'}}>
                <h3>League Teams:</h3>
                <TeamListViewer league={league} user={user} />
            </div>
        </>
    );
};

const AdminControls = ({ league, user, leagueId }) => {
    const handlePauseDraft = async () => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/pause`, { adminId: user.userId });
        } catch (error) {
            alert(`Error: ${error.response?.data || error.message}`);
        }
    };
    
    const handleSkipPlayer = async () => {
        if (window.confirm("Are you sure you want to skip this player?")) {
            try {
                await axios.post(`${API_BASE_URL}/leagues/${leagueId}/skip`, { adminId: user.userId });
            } catch (error) {
                alert(`Error skipping player: ${error.response?.data || error.message}`);
            }
        }
    };

    const isPaused = league.auctionTimer?.isPaused;

    return (
        <div>
            <button onClick={handlePauseDraft}>
                {isPaused ? 'Resume Draft' : 'Pause Draft'}
            </button>
            <button onClick={handleSkipPlayer} disabled={isPaused}>Skip Player</button>
            <button disabled={!isPaused}>Nominate Player</button>
            <button disabled={!isPaused}>Manage Members</button>
            <button disabled={!isPaused}>Beer B!tch</button>
            <button disabled={!isPaused}>Complete Draft</button>
        </div>
    );
};

const AuctionView = ({ league, user, leagueId }) => {
    const [bidAmount, setBidAmount] = useState(1);
    const [timer, setTimer] = useState(0);

    const currentPlayer = league.initialPlayerPool.find(p => p.id === league.currentPlayerId);

    useEffect(() => {
        const { auctionTimer } = league;
        let intervalId = null;

        if (intervalId) {
            clearInterval(intervalId);
        }

        if (auctionTimer?.isPaused) {
            setTimer(auctionTimer.timeRemainingOnPause);
        } else {
            const calculateTimeLeft = () => {
                if (auctionTimer?.endTime) {
                    const endTime = new Date(auctionTimer.endTime).getTime();
                    const now = new Date().getTime();
                    setTimer(Math.max(0, Math.floor((endTime - now) / 1000)));
                } else {
                    setTimer(0);
                }
            };
            
            calculateTimeLeft();
            intervalId = setInterval(calculateTimeLeft, 1000);
        }
        
        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [league]); // <-- THIS IS THE FIX: DEPEND ON THE WHOLE LEAGUE OBJECT

    const handlePlaceBid = async () => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/bid`, { userId: user.userId, amount: parseInt(bidAmount) });
        } catch (error) {
            alert(`Error placing bid: ${error.response?.data || error.message}`);
        }
    };
    
    const incrementBid = () => setBidAmount(prev => prev + 1);
    const decrementBid = () => setBidAmount(prev => Math.max(1, prev - 1));

    if (!currentPlayer) return <div className="card">Waiting for player nomination...</div>;

    return (
        <div className="card" style={{marginTop: '20px'}}>
            <h3>Current Player Up for Bid:</h3>
            <h2>{currentPlayer.name} - {currentPlayer.position}</h2>
            
            <p style={{fontSize: '24px', color: 'red', fontWeight: 'bold'}}>
                Bid Ends In: {timer}s
            </p>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'}}>
                Your Bid: 
                <button onClick={decrementBid} disabled={league.auctionTimer?.isPaused}>-</button>
                <input type="number" value={bidAmount} onChange={e => setBidAmount(parseInt(e.target.value) || 1)} style={{width: '60px', textAlign: 'center'}} disabled={league.auctionTimer?.isPaused} />
                <button onClick={incrementBid} disabled={league.auctionTimer?.isPaused}>+</button>
                <button onClick={handlePlaceBid} style={{marginLeft: '10px'}} disabled={league.auctionTimer?.isPaused}>Place Bid</button>
            </div>
        </div>
    );
};

const IntermissionView = ({ league }) => {
    const [timer, setTimer] = useState(0);
    const lastPick = league.draftLog && league.draftLog.length > 0 ? league.draftLog[league.draftLog.length - 1] : null;

    useEffect(() => {
        const calculateTimeLeft = () => {
            if (league.auctionTimer?.endTime) {
                const endTime = new Date(league.auctionTimer.endTime).getTime();
                const now = new Date().getTime();
                return Math.max(0, Math.floor((endTime - now) / 1000));
            }
            return 0;
        };
        const interval = setInterval(() => setTimer(calculateTimeLeft()), 1000);
        return () => clearInterval(interval);
    }, [league]); // <-- THIS IS THE FIX: DEPEND ON THE WHOLE LEAGUE OBJECT

    if (!lastPick) return <div className="card">Getting ready for the next player...</div>;

    const winningTeam = league.teams.find(t => t.id === lastPick.winningTeamId);
    const allBids = Object.entries(lastPick.allBids).sort(([,a],[,b]) => b.amount - a.amount);

    return (
        <div className="card" style={{marginTop: '20px', backgroundColor: '#e6ffed'}}>
            <h2>Intermission!</h2>
            <p style={{fontSize: '20px'}}>Next player in: <strong>{timer}s</strong></p>
            <div style={{marginTop: '20px'}}>
                <h4>Last Player Drafted:</h4>
                <p>
                    <strong>{lastPick.player.name}</strong> was drafted by 
                    <strong> {winningTeam?.name || 'N/A'}</strong> for 
                    <strong> ${lastPick.winningBid}</strong>!
                </p>
            </div>
            <div style={{marginTop: '20px'}}>
                <h4>All Bids for this Player:</h4>
                <ul style={{listStyle: 'none', padding: 0}}>
                    {allBids.map(([userId, bid]) => {
                        const team = league.teams.find(t => t.ownerId === userId);
                        return <li key={userId}>{team?.name || 'Unknown Team'}: ${bid.amount}</li>;
                    })}
                </ul>
            </div>
        </div>
    );
};

const TeamListViewer = ({ league, user }) => {
    const { rosterSettings } = league;
    if (!rosterSettings) return null;
    const totalRosterSpots = Object.values(rosterSettings).reduce((sum, val) => sum + (val || 0), 0);

    return (
        <div>
            {league.teams.map(team => {
                const isUserTeam = team.ownerId === user.userId;
                const rosterSpotsFilled = team.roster?.length || 0;
                
                if (isUserTeam) {
                    const remainingRosterSpots = totalRosterSpots - rosterSpotsFilled;
                    const maxBid = team.budget - (remainingRosterSpots > 0 ? remainingRosterSpots - 1 : 0);
                    return (
                        <div key={team.id} className="user-team-details" style={{padding: '5px 0', borderBottom: '1px solid #eee'}}>
                            <h4>{team.name} (You)</h4>
                            <p style={{margin: '5px 0'}}>
                                Roster: {rosterSpotsFilled} / {totalRosterSpots} | 
                                Budget: ${team.budget} | 
                                Total Spent: ${200 - team.budget} | 
                                Max Bid: ${maxBid}
                            </p>
                        </div>
                    );
                } else {
                     return (
                        <div key={team.id} style={{padding: '5px 0', borderBottom: '1px solid #eee'}}>
                            <p style={{margin: '5px 0'}}>
                                <strong>{team.name}</strong> - 
                                Budget: <strong>${team.budget}</strong>
                            </p>
                        </div>
                    );
                }
            })}
        </div>
    );
};

export default DraftScreen;