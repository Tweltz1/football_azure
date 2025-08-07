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

    // --- ADDED (Step 1) ---
    // The local bid state is now managed in the top-level component
    const [myCurrentBid, setMyCurrentBid] = useState(0);

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

                connection.on('beerRequestReceived', (requestingTeamName) => {
                    setToast({ show: true, message: `${requestingTeamName} wants a beer!` });
                    setTimeout(() => setToast({ show: false, message: '' }), 5000);
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

    // --- ADDED (Step 3) ---
    // This hook handles the automatic submission of the final bid
    useEffect(() => {
        if (league && league.currentAuction && league.currentAuction.status === 'awaiting_final_bids') {
            if (myCurrentBid > 0) {
                console.log(`Bidding ended. Submitting my final bid of $${myCurrentBid}`);
                axios.post(`${API_BASE_URL}/leagues/${leagueId}/submit-bid`, { bidAmount: myCurrentBid })
                    .catch(error => {
                        console.error("Failed to submit bid:", error);
                        // Optionally show a toast notification for failed bids
                        const errorMessage = error.response?.data || "An unknown error occurred.";
                        setToast({ show: true, message: `Bid Failed: ${errorMessage}` });
                        setTimeout(() => setToast({ show: false, message: '' }), 5000);
                    });
            }
            // Reset the bid input for the next round
            setMyCurrentBid(0);
        }
    }, [league?.currentAuction?.status, leagueId, myCurrentBid]);


    if (loading) return <div>Loading Draft Room...</div>;
    if (!league) return <div>Could not load league.</div>;

    const isLobbyPhase = league.status.toLowerCase() === 'created' || league.status.toLowerCase() === 'lobby';
    
    return (
        <div style={{ padding: '20px' }}>
            <ToastNotification message={toast.message} show={toast.show} onClose={() => setToast({ show: false, message: '' })} />
            <h2>Drafting in {league.name}</h2>
            <p>League Status: <span style={{fontWeight: 'bold'}}>{league.status.toUpperCase()}</span></p>

            {isLobbyPhase ? (
                <LobbyView league={league} user={user} leagueId={leagueId} />
            ) : (
                // --- MODIFIED --- Pass down the bid state and setter function
                <DraftingView league={league} user={user} leagueId={leagueId} myCurrentBid={myCurrentBid} setMyCurrentBid={setMyCurrentBid} />
            )}
        </div>
    );
};

// ... LobbyView component remains unchanged ...
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


// --- MODIFIED --- This component now accepts the bid state from its parent
const DraftingView = ({ league, user, leagueId, myCurrentBid, setMyCurrentBid }) => {
    // This logic for checking intermission status has been improved slightly
    const isIntermission = league.currentAuction?.status === 'intermission';
    const beerBitchTeam = league.teams.find(t => t.id === league.beerBitchTeamId);

    // This polling mechanism is kept from your original code.
    // It is responsible for telling the server to check if the timers have expired.
    useEffect(() => {
        let pollInterval;
        if (!isIntermission) {
            pollInterval = setInterval(() => {
                axios.post(`${API_BASE_URL}/leagues/${leagueId}/endBidding`).catch(err => console.error("Polling endBidding failed", err));
            }, 3000);
        }
        return () => clearInterval(pollInterval);
    }, [isIntermission, leagueId]);

    // Polling for the next round during intermission
    useEffect(() => {
        let pollInterval;
        if (isIntermission) {
            // Note: Your original code had a /nextRound endpoint. Our new backend model doesn't have this.
            // The `ProcessAuctionResults` function automatically starts the next round.
            // This polling might need to be adjusted or removed depending on your final backend for starting the intermission.
            // For now, I will leave it but point it to a non-existent endpoint to match your old code.
            // A better approach would be to have the server handle the intermission timer end-to-end.
            pollInterval = setInterval(() => {
                // This endpoint does not exist in the new backend plan.
                // axios.post(`${API_BASE_URL}/leagues/${leagueId}/startNextAuctionRound`);
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
                // --- MODIFIED --- Pass down the bid state and setter function
                <AuctionView league={league} user={user} leagueId={leagueId} myCurrentBid={myCurrentBid} setMyCurrentBid={setMyCurrentBid} />
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

// ... AdminControls component remains unchanged ...
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

    const isPaused = league.currentAuction?.auctionTimer?.isPaused;
    const isIntermission = league.currentAuction?.status === 'intermission';

    const pauseButtonText = () => {
        if (isIntermission) {
            return isPaused ? 'Resume Intermission' : 'Pause Intermission';
        }
        return isPaused ? 'Resume Draft' : 'Pause Draft';
    };

    return (
        <>
            <div>
                <button onClick={handlePauseDraft}>{pauseButtonText()}</button>
                <button onClick={handleSkipPlayer} disabled={isPaused || isIntermission}>Skip Player</button>
                <button onClick={() => setShowNominateModal(true)} disabled={!isPaused}>Nominate Player</button>
                <button onClick={() => setShowManageMembersModal(true)} disabled={!isPaused}>Manage Members</button>
                <button onClick={() => setShowBeerBitchModal(true)} disabled={!isPaused}>Beer B!tch</button>
                <button disabled={!isPaused}>Complete Draft</button>
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
                                    {/* --- THIS IS THE CORRECTED LINE --- */}
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


// --- HEAVILY MODIFIED --- This component is now much simpler
const AuctionView = ({ league, user, leagueId, myCurrentBid, setMyCurrentBid }) => {
    const [timer, setTimer] = useState(0);

    // Use the new data structure
    const currentPlayer = league.draftPlayers.find(p => p.id === league.currentAuction?.playerId);
    const isPaused = league.currentAuction?.auctionTimer?.isPaused;
    
    // Timer logic remains, but now it points to the new nested timer object
    useEffect(() => {
        const auctionTimer = league.currentAuction?.auctionTimer;
        let intervalId = null;

        if (isPaused) {
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
            calculateTimeLeft(); // Run once immediately
            intervalId = setInterval(calculateTimeLeft, 1000);
        }

        return () => { if (intervalId) { clearInterval(intervalId); }};
    }, [league.currentAuction?.auctionTimer, isPaused]);
    
    // All old handler functions (handlePlaceBid, handleCancelBid) are removed.

    if (!currentPlayer) return <div className="card">Waiting for player nomination...</div>;

    const isAwaitingResults = league.currentAuction?.status === 'awaiting_final_bids';

    return (
        <div className="card" style={{marginTop: '20px'}}>
            <h3>Current Player Up for Bid:</h3>
            <h2>{currentPlayer.name} - {currentPlayer.position} - {currentPlayer.team}</h2>
            <p>Rank: {currentPlayer.rank}</p>
            
            {isAwaitingResults ? (
                 <p style={{fontSize: '24px', color: 'blue', fontWeight: 'bold'}}>Awaiting Results...</p>
            ) : (
                <p style={{fontSize: '24px', color: 'red', fontWeight: 'bold'}}>Bid Ends In: {timer}s</p>
            )}
            
            {myCurrentBid > 0 && !isAwaitingResults && (
                <p style={{fontSize: '18px', color: 'green'}}>Your bid will be: ${myCurrentBid}</p>
            )}

            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', marginTop: '10px'}}>
                Your Bid: 
                <button onClick={() => setMyCurrentBid(prev => prev - 1)} disabled={isPaused || isAwaitingResults}>-</button>
                <input 
                    type="number" 
                    value={myCurrentBid} 
                    onChange={e => {
                        const value = parseInt(e.target.value, 10);
                        setMyCurrentBid(isNaN(value) || value < 0 ? 0 : value);
                    }}
                    style={{width: '60px', textAlign: 'center'}} 
                    disabled={isPaused || isAwaitingResults} 
                />
                <button onClick={() => setMyCurrentBid(prev => prev + 1)} disabled={isPaused || isAwaitingResults}>+</button>
                
                {/* This is the new "Cancel Bid" - it just resets the local state */}
                <button onClick={() => setMyCurrentBid(0)} style={{marginLeft: '10px', backgroundColor: '#dc3545', color: 'white'}} disabled={isPaused || isAwaitingResults}>
                    Reset Bid
                </button>
            </div>
        </div>
    );
};


// --- MODIFIED --- This component is simplified to reflect the new draft log structure
const IntermissionView = ({ league }) => {
    const [timer, setTimer] = useState(0);
    const lastPick = league.draftLog && league.draftLog.length > 0 ? league.draftLog[league.draftLog.length - 1] : null;

    useEffect(() => {
        const auctionTimer = league.currentAuction?.auctionTimer;
        let intervalId = null;

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
        return () => { if (intervalId) { clearInterval(intervalId); } };
    }, [league.currentAuction?.auctionTimer]);

    if (!lastPick) return <div className="card">Getting ready for the next player...</div>;

    const winningTeam = league.teams.find(t => t.id === lastPick.winningTeamId);
    
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
            {/* The 'AllBids' display has been removed, as it's not populated by the new backend logic. */}
            {/* It could be added back later if the backend is modified to save the final bids to the draft log. */}
        </div>
    );
};


// ... TeamListViewer, NominatePlayerModal, ManageMembersModal remain unchanged ...
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
                    return (
                        <div key={team.id} className="user-team-details" style={{padding: '5px 0', borderBottom: '1px solid #eee'}}>
                            <h4>{team.name} (You)</h4>
                            <p style={{margin: '5px 0'}}>
                                Roster: {rosterSpotsFilled} / {totalRosterSpots} | 
                                Budget: ${team.budget} | 
                                Total Spent: ${200 - team.budget} | 
                                Max Bid: ${maxBid}
                            </p>
                            {league.beerBitchTeamId && league.beerBitchTeamId !== team.id && (
                                <button onClick={handleRequestBeer} disabled={beerRequestCooldown > 0}>
                                    {beerRequestCooldown > 0 ? `Request Beer (${beerRequestCooldown}s)` : 'Request a Beer'}
                                </button>
                            )}
                        </div>
      _Bitch(team.id)}>Assign</button>
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


export default DraftScreen;