import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../AuthContext';
import { HubConnectionBuilder } from '@microsoft/signalr';
import { getSignalRInfo } from '../api';
import '../App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

const ToastNotification = ({ message, show, onClose }) => {
    if (!show) return null;
    return (
        <div style={{ position: 'fixed', top: '20px', right: '20px', backgroundColor: '#28a745', color: 'white', padding: '15px', borderRadius: '5px', zIndex: 1000, boxShadow: '0 4px 8px rgba(0,0,0,0.2)', transition: 'opacity 0.5s ease-in-out', opacity: show ? 1 : 0 }}>
            {message}
            <button onClick={onClose} style={{ marginLeft: '15px', border: 'none', background: 'none', color: 'white', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px' }}>&times;</button>
        </div>
    );
};

const DraftScreen = () => {
    const { leagueId } = useParams();
    const { user } = useAuth();
    const [league, setLeague] = useState(null);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState({ show: false, message: '' });

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
        if (!user?.userId) return;

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

                connection.on('beerRequestReceived', (requestingTeamName) => {
                    setToast({ show: true, message: `${requestingTeamName} wants a beer!` });
                    setTimeout(() => setToast({ show: false, message: '' }), 5000);
                });
                
                await connection.start();
                await axios.post(`${API_BASE_URL}/leagues/${leagueId}/connect`, { userId: user.userId });

            } catch (e) {
                console.error("SignalR Connection Failed: ", e);
            }
        };

        setupSignalR();

        return () => {
            if (connection) {
                axios.post(`${API_BASE_URL}/leagues/${leagueId}/disconnect`, { userId: user.userId });
                connection.stop();
            }
        };
    }, [leagueId, user]);

    if (loading) return <div>Loading Draft Room...</div>;
    if (!league) return <div>Could not load league.</div>;

    const isLobbyPhase = league.status.toLowerCase() === 'created' || league.status.toLowerCase() === 'lobby';
    const isCompleted = league.status.toLowerCase() === 'completed';
    
    return (
        <div style={{ padding: '20px' }}>
            <ToastNotification message={toast.message} show={toast.show} onClose={() => setToast({ show: false, message: '' })} />
            <h2>Drafting in {league.name}</h2>
            <p>League Status: <span style={{fontWeight: 'bold'}}>{league.status.toUpperCase()}</span></p>

            {isLobbyPhase ? (
                <LobbyView league={league} user={user} leagueId={leagueId} />
            ) : isCompleted ? (
                <CompletedView league={league} leagueId={leagueId} />
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
                 <TeamListViewer league={league} user={user} leagueId={leagueId} />
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
                            <span>{player.name} ({player.position}) - {player.team} - Rank: {player.rank}</span>
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
                            <span>{player.name} ({player.position}) - {player.team} - Rank: {player.rank}</span>
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
    const isTieBreaker = league.status.toLowerCase() === 'tiebreaker';
    const beerBitchTeam = league.teams.find(t => t.id === league.beerBitchTeamId);

    useEffect(() => {
        let pollInterval;
        if (league.status.toLowerCase() === 'drafting' || isTieBreaker) {
            pollInterval = setInterval(() => {
                axios.post(`${API_BASE_URL}/leagues/${leagueId}/endBidding`);
            }, 3000);
        }
        return () => clearInterval(pollInterval);
    }, [league.status, isTieBreaker, leagueId]);

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
            ) : isTieBreaker ? (
                <TieBreakerView league={league} user={user} leagueId={leagueId} />
            ) : (
                <AuctionView league={league} user={user} leagueId={leagueId} />
            )}

            <div className="card" style={{marginTop: '20px'}}>
                <h3>League Teams:</h3>
                <TeamListViewer league={league} user={user} leagueId={leagueId} />
            </div>

            {beerBitchTeam && (
                <div className="card" style={{marginTop: '20px', backgroundColor: 'lightgoldenrodyellow'}}>
                    <h3>Beer Duty!</h3>
                    <p><strong>{beerBitchTeam.name}</strong> has been assigned to Beer Duty!</p>
                </div>
            )}
        </>
    );
};

const AdminControls = ({ league, user, leagueId }) => {
    const [showBeerBitchModal, setShowBeerBitchModal] = useState(false);
    const [showNominateModal, setShowNominateModal] = useState(false);
    const [showManageMembersModal, setShowManageMembersModal] = useState(false);

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

    const handleSkipIntermission = async () => {
        if (window.confirm("Are you sure you want to skip the intermission and start the next auction immediately?")) {
            try {
                await axios.post(`${API_BASE_URL}/leagues/${leagueId}/skip-intermission`, { adminId: user.userId });
            } catch (error) {
                alert(`Error skipping intermission: ${error.response?.data || error.message}`);
            }
        }
    };

    const handleAssignBeerBitch = async (teamId) => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/beer-bitch`, { adminId: user.userId, teamId: teamId });
            setShowBeerBitchModal(false);
        } catch (error) {
            alert(`Error assigning beer duty: ${error.response?.data || error.message}`);
        }
    };

    const handleNominatePlayer = async (playerId) => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/nominate`, { adminId: user.userId, playerId });
            setShowNominateModal(false);
        } catch (error) {
            alert(`Error nominating player: ${error.response?.data || error.message}`);
        }
    };

    const handleKickMember = async (teamIdToKick) => {
        const team = league.teams.find(t => t.id === teamIdToKick);
        if (window.confirm(`Are you sure you want to kick ${team.name}? This will return all their drafted players to the pool.`)) {
            try {
                await axios.post(`${API_BASE_URL}/leagues/${leagueId}/kick`, { adminId: user.userId, teamIdToKick });
            } catch (error) {
                alert(`Error kicking member: ${error.response?.data || error.message}`);
            }
        }
    };

    const handleAdjustBudget = async (teamId, newBudget) => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/adjust-budget`, { adminId: user.userId, teamId, newBudget: parseInt(newBudget) });
        } catch (error) {
            alert(`Error adjusting budget: ${error.response?.data || error.message}`);
        }
    };

    const handleCompleteDraft = async () => {
        if (window.confirm("Are you sure you want to end this draft? This cannot be undone.")) {
            try {
                await axios.post(`${API_BASE_URL}/leagues/${leagueId}/complete`, { adminId: user.userId });
            } catch (error) {
                alert(`Error completing draft: ${error.response?.data || error.message}`);
            }
        }
    };

    const isPaused = league.auctionTimer?.isPaused;
    const isIntermission = league.status.toLowerCase() === 'intermission';
    const isTieBreaker = league.status.toLowerCase() === 'tiebreaker';

    const pauseButtonText = () => {
        if (isIntermission || isTieBreaker) {
            return isPaused ? 'Resume Tie-Breaker' : 'Pause Tie-Breaker';
        }
        return isPaused ? 'Resume Draft' : 'Pause Draft';
    };

    return (
        <>
            <div>
                <button onClick={handlePauseDraft}>{pauseButtonText()}</button>
                
                {isIntermission ? (
                    <button onClick={handleSkipIntermission} disabled={isPaused}>Skip Intermission</button>
                ) : (
                    <button onClick={handleSkipPlayer} disabled={isPaused || isTieBreaker}>Skip Player</button>
                )}

                <button onClick={() => setShowNominateModal(true)} disabled={!isPaused}>Nominate Player</button>
                <button onClick={() => setShowManageMembersModal(true)} disabled={!isPaused}>Manage Members</button>
                <button onClick={() => setShowBeerBitchModal(true)} disabled={!isPaused}>Beer B!tch</button>
                <button onClick={handleCompleteDraft} disabled={!isPaused}>Complete Draft</button>
            </div>

            {showBeerBitchModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Assign Beer B!tch</h3>
                        <p>Select a team to assign beer duty to.</p>
                        <ul style={{listStyle: 'none', padding: 0}}>
                            {league.teams.map(team => (
                                <li key={team.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid #eee'}}>
                                    <span>{team.name}</span>
                                    <button onClick={() => handleAssignBeerBitch(team.id)}>Assign</button>
                                </li>
                            ))}
                        </ul>
                        <button onClick={() => setShowBeerBitchModal(false)} className="cancel-button">Cancel</button>
                    </div>
                </div>
            )}
            
            {showNominateModal && (
                <NominatePlayerModal
                    league={league}
                    onNominate={handleNominatePlayer}
                    onClose={() => setShowNominateModal(false)}
                />
            )}

            {showManageMembersModal && (
                <ManageMembersModal
                    league={league}
                    onKick={handleKickMember}
                    onAdjustBudget={handleAdjustBudget}
                    onClose={() => setShowManageMembersModal(false)}
                />
            )}
        </>
    );
};

const AuctionView = ({ league, user, leagueId }) => {
    const [bidAmount, setBidAmount] = useState(0);
    const [timer, setTimer] = useState(0);

    const currentPlayer = league.initialPlayerPool.find(p => p.id === league.currentPlayerId);
    
    useEffect(() => {
        let highBid = 0;
        if (league.activeBids && Object.keys(league.activeBids).length > 0) {
            highBid = Math.max(...Object.values(league.activeBids).map(b => b.amount));
        }
        setBidAmount(highBid + 1);
    }, [league.currentPlayerId, league.activeBids]);

    useEffect(() => {
        const { auctionTimer } = league;
        let intervalId = null;
        if (intervalId) { clearInterval(intervalId); }
        if (auctionTimer?.isPaused) {
            setTimer(auctionTimer.timeRemainingOnPause);
        } else {
            const calculateTimeLeft = () => {
                if (auctionTimer?.endTime) {
                    const endTime = new Date(auctionTimer.endTime).getTime();
                    const now = new Date().getTime();
                    setTimer(Math.max(0, Math.floor((endTime - now) / 1000)));
                } else { setTimer(0); }
            };
            calculateTimeLeft();
            intervalId = setInterval(calculateTimeLeft, 1000);
        }
        return () => { if (intervalId) { clearInterval(intervalId); }};
    }, [league]);

    const handlePlaceBid = async () => {
        if (bidAmount <= 0) {
            alert("Bid must be at least $1.");
            return;
        }
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/bid`, { userId: user.userId, amount: parseInt(bidAmount) });
        } catch (error) {
            alert(`Error placing bid: ${error.response?.data || error.message}`);
        }
    };

    const handleCancelBid = async () => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/cancel-bid`, { userId: user.userId });
        } catch (error) {
            alert(`Error cancelling bid: ${error.response?.data || error.message}`);
        }
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            handlePlaceBid();
        }
    };
    
    const incrementBid = () => setBidAmount(prev => prev + 1);
    const decrementBid = () => setBidAmount(prev => Math.max(0, prev - 1));

    if (!currentPlayer) return <div className="card">Waiting for player nomination...</div>;

    const userHasActiveBid = league.activeBids && league.activeBids[user.userId];

    return (
        <div className="card" style={{marginTop: '20px'}}>
            <h3>Current Player Up for Bid:</h3>
            <h2>{currentPlayer.name} - {currentPlayer.position} - {currentPlayer.team}</h2>
            <p>Rank: {currentPlayer.rank}</p>
            <p style={{fontSize: '24px', color: 'red', fontWeight: 'bold'}}>Bid Ends In: {timer}s</p>
            
            {userHasActiveBid && (
                <p style={{fontSize: '18px', color: 'green'}}>Your current bid is: ${league.activeBids[user.userId].amount}</p>
            )}

            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'}}>
                Your Bid: 
                <button onClick={decrementBid} disabled={league.auctionTimer?.isPaused}>-</button>
                <input 
                    type="number" 
                    value={bidAmount} 
                    onChange={e => setBidAmount(parseInt(e.target.value) || 0)}
                    onKeyDown={handleKeyDown}
                    style={{width: '60px', textAlign: 'center'}} 
                    disabled={league.auctionTimer?.isPaused} 
                />
                <button onClick={incrementBid} disabled={league.auctionTimer?.isPaused}>+</button>
                
                <button onClick={handlePlaceBid} style={{marginLeft: '10px'}} disabled={league.auctionTimer?.isPaused}>
                    Place Bid
                </button>
                
                {userHasActiveBid && (
                    <button onClick={handleCancelBid} style={{backgroundColor: '#dc3545', color: 'white'}} disabled={league.auctionTimer?.isPaused}>
                        Cancel Bid
                    </button>
                )}
            </div>
        </div>
    );
};

const IntermissionView = ({ league }) => {
    const [timer, setTimer] = useState(0);
    const lastPick = league.draftLog && league.draftLog.length > 0 ? league.draftLog[league.draftLog.length - 1] : null;

    useEffect(() => {
        const { auctionTimer } = league;
        let intervalId = null;
        if (intervalId) { clearInterval(intervalId); }
        if (auctionTimer?.isPaused) {
            setTimer(auctionTimer.timeRemainingOnPause);
        } else {
            const calculateTimeLeft = () => {
                if (auctionTimer?.endTime) {
                    const endTime = new Date(auctionTimer.endTime).getTime();
                    const now = new Date().getTime();
                    setTimer(Math.max(0, Math.floor((endTime - now) / 1000)));
                } else { setTimer(0); }
            };
            calculateTimeLeft();
            intervalId = setInterval(calculateTimeLeft, 1000);
        }
        return () => { if (intervalId) { clearInterval(intervalId); }};
    }, [league]);

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
                    <strong>{lastPick.player.name} ({lastPick.player.position} - {lastPick.player.team})</strong> was drafted by 
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

const TieBreakerView = ({ league, user, leagueId }) => {
    const [bidAmount, setBidAmount] = useState(0);
    const [timer, setTimer] = useState(0);
    const [showResolveTieModal, setShowResolveTieModal] = useState(false);

    const currentPlayer = league.initialPlayerPool.find(p => p.id === league.currentPlayerId);
    const userIsTied = league.tieBreaker?.tiedTeamIds.includes(user.userId);
    const isSecondRoundTie = league.tieBreaker?.round === 2;
    const isCurrentUserAdmin = league.adminId === user.userId;

    useEffect(() => {
        if (league.tieBreaker) {
            setBidAmount(league.tieBreaker.tieAmount + 1);
        }
    }, [league.tieBreaker]);

    useEffect(() => {
        const { auctionTimer } = league;
        let intervalId = null;
        if (intervalId) { clearInterval(intervalId); }
        if (auctionTimer?.isPaused) {
            setTimer(auctionTimer.timeRemainingOnPause);
        } else {
            const calculateTimeLeft = () => {
                if (auctionTimer?.endTime) {
                    const endTime = new Date(auctionTimer.endTime).getTime();
                    const now = new Date().getTime();
                    setTimer(Math.max(0, Math.floor((endTime - now) / 1000)));
                } else { setTimer(0); }
            };
            calculateTimeLeft();
            intervalId = setInterval(calculateTimeLeft, 1000);
        }
        return () => { if (intervalId) { clearInterval(intervalId); }};
    }, [league]);

    const handlePlaceTieBid = async () => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/tiebreaker-bid`, { userId: user.userId, amount: parseInt(bidAmount) });
        } catch (error) {
            alert(`Error placing tie-breaker bid: ${error.response?.data || error.message}`);
        }
    };
    
    const handleResolveTie = async (winningTeamId) => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/resolve-tie`, { adminId: user.userId, winningTeamId });
            setShowResolveTieModal(false);
        } catch (error) {
            alert(`Error resolving tie: ${error.response?.data || error.message}`);
        }
    };

    if (!currentPlayer || !league.tieBreaker) return <div className="card">Loading tie-breaker...</div>;

    return (
        <div className="card" style={{marginTop: '20px', backgroundColor: '#fff3cd'}}>
            <h2>Tie Breaker!</h2>
            <p>A tie was detected for <strong>{currentPlayer.name}</strong> at <strong>${league.tieBreaker.tieAmount}</strong>.</p>
            <p style={{fontSize: '24px', color: 'red', fontWeight: 'bold'}}>Re-bid Ends In: {timer}s</p>

            {userIsTied ? (
                <div>
                    <h4>You are in the tie-breaker!</h4>
                    <p>You must bid at least ${league.tieBreaker.tieAmount + 1}.</p>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'}}>
                        Your Bid:
                        <input type="number" value={bidAmount} onChange={e => setBidAmount(parseInt(e.target.value) || 0)} style={{width: '60px'}} disabled={league.auctionTimer?.isPaused} />
                        <button onClick={handlePlaceTieBid} disabled={league.auctionTimer?.isPaused}>Place Tie-Breaker Bid</button>
                    </div>
                </div>
            ) : (
                <p>Waiting for the tied teams to resolve the bid...</p>
            )}

            {isSecondRoundTie && isCurrentUserAdmin && (
                <div style={{marginTop: '20px'}}>
                    <p><strong>This is the second tie!</strong> As the admin, you must resolve it.</p>
                    <button onClick={() => setShowResolveTieModal(true)}>Resolve Tie</button>
                </div>
            )}

            {showResolveTieModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Resolve Final Tie</h3>
                        <p>Please select the winner for {currentPlayer.name} at ${league.tieBreaker.tieAmount}.</p>
                        <ul style={{listStyle: 'none', padding: 0}}>
                            {league.tieBreaker.tiedTeamIds.map(teamId => {
                                const team = league.teams.find(t => t.ownerId === teamId);
                                return (
                                    <li key={teamId} className="player-list-item">
                                        <span>{team.name}</span>
                                        <button onClick={() => handleResolveTie(team.id)}>Award Player</button>
                                    </li>
                                );
                            })}
                        </ul>
                        <button onClick={() => setShowResolveTieModal(false)} className="cancel-button">Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
};

const TeamListViewer = ({ league, user, leagueId }) => {
    const [beerRequestCooldown, setBeerRequestCooldown] = useState(0);
    const userTeam = league.teams.find(t => t.ownerId === user.userId);

    useEffect(() => {
        if (beerRequestCooldown > 0) {
            const timer = setTimeout(() => setBeerRequestCooldown(prev => prev - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [beerRequestCooldown]);

    const { rosterSettings } = league;
    if (!rosterSettings) return null;
    const totalRosterSpots = Object.values(rosterSettings).reduce((sum, val) => sum + (val || 0), 0);

    const handleRequestBeer = async () => {
        if (!userTeam) return;
        setBeerRequestCooldown(300);
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/request-beer`, { requestingTeamId: userTeam.id });
        } catch (error) {
            alert(`Error requesting beer: ${error.response?.data || error.message}`);
            setBeerRequestCooldown(0);
        }
    };

    return (
        <div>
            {league.teams.map(team => {
                const isUserTeam = team.ownerId === user.userId;
                const rosterSpotsFilled = team.roster?.length || 0;
                
                if (isUserTeam) {
                    const remainingRosterSpots = totalRosterSpots - rosterSpotsFilled;
                    const maxBid = team.budget - (remainingRosterSpots > 0 ? remainingRosterSpots - 1 : 0);
                    
                    const positionCounts = {};
                    for (const pos in rosterSettings) {
                        positionCounts[pos.toUpperCase()] = team.roster.filter(s => s.position === pos.toUpperCase()).length;
                    }

                    return (
                        <div key={team.id} className="user-team-details" style={{padding: '5px 0', borderBottom: '1px solid #eee'}}>
                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                                <h4>
                                    <span style={{ height: '10px', width: '10px', backgroundColor: league.onlineUserIds.includes(team.ownerId) ? '#28a745' : '#6c757d', borderRadius: '50%', display: 'inline-block', marginRight: '8px' }}></span>
                                    {team.name} (You)
                                </h4>
                                <span>Roster: {rosterSpotsFilled} / {totalRosterSpots}</span>
                            </div>
                            <p style={{margin: '5px 0'}}>
                                Budget: ${team.budget} | 
                                Total Spent: ${200 - team.budget} | 
                                Max Bid: ${maxBid}
                            </p>
                            <div style={{display: 'flex', flexWrap: 'wrap', gap: '15px'}}>
                                <div>
                                    <h5>Roster Spots:</h5>
                                    <ul style={{listStyle: 'none', paddingLeft: '10px', margin: 0}}>
                                        {Object.entries(rosterSettings).map(([pos, count]) => (
                                            <li key={pos}>{pos.toUpperCase()}: {positionCounts[pos.toUpperCase()] || 0} / {count}</li>
                                        ))}
                                    </ul>
                                </div>
                                <div>
                                    <h5>Your Roster:</h5>
                                    <ul style={{listStyle: 'none', paddingLeft: '10px', margin: 0}}>
                                        {team.roster.map((spot, index) => (
                                            <li key={index}>{spot.player.name} ({spot.player.position}) - ${spot.player.price}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                            {league.beerBitchTeamId && league.beerBitchTeamId !== team.id && (
                                <button onClick={handleRequestBeer} disabled={beerRequestCooldown > 0} style={{marginTop: '10px'}}>
                                    {beerRequestCooldown > 0 ? `Request Beer (${beerRequestCooldown}s)` : 'Request a Beer'}
                                </button>
                            )}
                        </div>
                    );
                } else {
                     return (
                        <div key={team.id} style={{padding: '5px 0', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                            <div>
                                <span style={{
                                    height: '10px',
                                    width: '10px',
                                    backgroundColor: league.onlineUserIds.includes(team.ownerId) ? '#28a745' : '#6c757d',
                                    borderRadius: '50%',
                                    display: 'inline-block',
                                    marginRight: '8px'
                                }}></span>
                                <strong>{team.name}</strong>
                            </div>
                            <span>
                                Roster: {rosterSpotsFilled}/{totalRosterSpots}
                            </span>
                        </div>
                    );
                }
            })}
        </div>
    );
};

const NominatePlayerModal = ({ league, onNominate, onClose }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const undraftedPlayers = league.initialPlayerPool.filter(p => !p.isDrafted)
        .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>Nominate a Player</h3>
                <input type="text" placeholder="Search for a player..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{width: '95%', marginBottom: '10px'}}/>
                <ul style={{listStyle: 'none', padding: 0, maxHeight: '300px', overflowY: 'auto'}}>
                    {undraftedPlayers.map(player => (
                        <li key={player.id} className="player-list-item">
                            <span>{player.name} ({player.position}) - {player.team} - Rank: {player.rank}</span>
                            <button onClick={() => onNominate(player.id)}>Nominate</button>
                        </li>
                    ))}
                </ul>
                <button onClick={onClose} className="cancel-button">Cancel</button>
            </div>
        </div>
    );
};

const ManageMembersModal = ({ league, onKick, onAdjustBudget, onClose }) => {
    const [budgets, setBudgets] = useState(league.teams.reduce((acc, team) => ({...acc, [team.id]: team.budget }), {}));

    const handleBudgetChange = (teamId, value) => {
        setBudgets(prev => ({ ...prev, [teamId]: parseInt(value) || 0 }));
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>Manage Members</h3>
                <ul style={{listStyle: 'none', padding: 0, maxHeight: '300px', overflowY: 'auto'}}>
                    {league.teams.map(team => (
                        <li key={team.id} className="player-list-item">
                            <span>{team.name}</span>
                            <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                                Budget: $
                                <input 
                                    type="number" 
                                    value={budgets[team.id]} 
                                    onChange={e => handleBudgetChange(team.id, e.target.value)} 
                                    style={{width: '60px'}}
                                />
                                <button onClick={() => onAdjustBudget(team.id, budgets[team.id])}>Set</button>
                                {team.ownerId !== league.adminId && (
                                    <button onClick={() => onKick(team.id)} style={{backgroundColor: '#dc3545', color: 'white'}}>Kick</button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
                <button onClick={onClose} className="cancel-button">Cancel</button>
            </div>
        </div>
    );
};

const CompletedView = ({ league, leagueId }) => {
    return (
        <div className="card" style={{textAlign: 'center'}}>
            <h2>The Draft is Complete!</h2>
            <p>Thank you for playing. You can now view the final results and rosters.</p>
            <div style={{marginTop: '20px'}}>
                <a 
                    href={`${API_BASE_URL}/leagues/${leagueId}/results.csv`} 
                    download
                >
                    <button className="create-button">Download Draft Results (CSV)</button>
                </a>
            </div>
            <div style={{marginTop: '40px'}}>
                <h3>Final Rosters</h3>
                {league.teams.map(team => (
                    <div key={team.id} style={{padding: '10px', borderBottom: '1px solid #eee'}}>
                        <h4>{team.name} (Budget Remaining: ${team.budget})</h4>
                        <ul style={{listStyle: 'none', padding: 0}}>
                            {team.roster.map((spot, index) => (
                                <li key={index}>
                                    {spot.player.name} ({spot.player.position}) - ${spot.player.price}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DraftScreen;
