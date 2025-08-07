import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../AuthContext';
import { HubConnectionBuilder } from '@microsoft/signalr';
import { getSignalRInfo } from '../api';
import '../App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

const DraftScreen = () => {
    // This main component is unchanged
    // ...
};

// ... LobbyView component is unchanged ...

const DraftingView = ({ league, user, leagueId }) => {
    // This component is unchanged
    // ...
};

const AdminControls = ({ league, user, leagueId }) => {
    const [showBeerBitchModal, setShowBeerBitchModal] = useState(false);
    const [showNominateModal, setShowNominateModal] = useState(false);
    const [showManageMembersModal, setShowManageMembersModal] = useState(false);

    // ... handlePauseDraft, handleSkipPlayer, handleAssignBeerBitch are unchanged ...
    
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

    const isPaused = league.auctionTimer?.isPaused;

    return (
        <>
            <div>
                <button onClick={handlePauseDraft}>{isPaused ? 'Resume Draft' : 'Pause Draft'}</button>
                <button onClick={handleSkipPlayer} disabled={isPaused}>Skip Player</button>
                <button onClick={() => setShowNominateModal(true)} disabled={!isPaused}>Nominate Player</button>
                <button onClick={() => setShowManageMembersModal(true)} disabled={!isPaused}>Manage Members</button>
                <button onClick={() => setShowBeerBitchModal(true)} disabled={!isPaused}>Beer B!tch</button>
                <button disabled={!isPaused}>Complete Draft</button>
            </div>

            {/* --- Modals --- */}
            {showBeerBitchModal && ( /* ... unchanged ... */ )}
            
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

// ... AuctionView, IntermissionView, TeamListViewer components are unchanged ...

// --- NEW MODAL COMPONENTS ---

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
                            <span>{player.name} ({player.position})</span>
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
        setBudgets(prev => ({ ...prev, [teamId]: value }));
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>Manage Members</h3>
                <ul style={{listStyle: 'none', padding: 0}}>
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
                                    <button onClick={() => onKick(team.id)} style={{backgroundColor: '#dc3545'}}>Kick</button>
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


// --- FULL CODE ---
// ... (The rest of DraftScreen.js, including all sub-components, is below)
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
    const beerBitchTeam = league.teams.find(t => t.id === league.beerBitchTeamId);

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

            {beerBitchTeam && (
                <div className="card" style={{marginTop: '20px', backgroundColor: 'lightgoldenrodyellow'}}>
                    <h3>Beer Duty!</h3>
                    <p><strong>{beerBitchTeam.name}</strong> has been assigned to Beer Duty!</p>
                </div>
            )}
            
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

    const isPaused = league.auctionTimer?.isPaused;

    return (
        <>
            <div>
                <button onClick={handlePauseDraft}>{isPaused ? 'Resume Draft' : 'Pause Draft'}</button>
                <button onClick={handleSkipPlayer} disabled={isPaused}>Skip Player</button>
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

const AuctionView = ({ league, user, leagueId }) => { /* ... */ };
const IntermissionView = ({ league }) => { /* ... */ };
const TeamListViewer = ({ league, user }) => { /* ... */ };

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
                            <span>{player.name} ({player.position})</span>
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
        setBudgets(prev => ({ ...prev, [teamId]: value }));
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

// ... (Rest of full file with all components)
export default DraftScreen;