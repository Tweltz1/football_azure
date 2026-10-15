import React, { useState, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../AuthContext';
import { createDraftConnection } from '../realtime';
import { API_BASE_URL } from '../api';
import { isOfflineLeague } from '../offline/storage';
import WhiteboardPad from '../whiteboard/WhiteboardPad';
import { BoardAwardPanel, BoardGrid, BoardSketch, pickLabel, reviewLabel } from '../whiteboard/BoardViews';
import { biddingStyleLabel, isAutoReadLeague, isWhiteboardLeague, maxBidFor } from '../whiteboard/biddingStyle';
import { formatClock, leagueStatusLabel } from '../data/leagueLabels';
import { ShowMoreButton, useShowMore } from './ShowMore';
import '../App.css';
import './ManualConsole.css';

const TIMER_POLL_MS = 1000;
const AVAILABLE_PAGE_SIZE = 40;
const POSITION_OPTIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
const POSITION_PLAN_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPERFLEX', 'K', 'DST', 'BENCH'];
const EMPTY_DRAFT_PROFILE = {
    loaded: false,
    favoritePlayerIds: [],
    playerNotes: {},
    playerTiers: {},
    budgetPlan: {},
};

const useTimerTransition = (enabled, auctionTimer, transitionUrl) => {
    const timerEndTime = auctionTimer?.endTime;
    const timerIsPaused = auctionTimer?.isPaused;

    useEffect(() => {
        if (!enabled || !timerEndTime || timerIsPaused) return;

        let hasRequestedTransition = false;
        const requestTransitionIfExpired = async () => {
            if (hasRequestedTransition || new Date(timerEndTime).getTime() > Date.now()) return;
            hasRequestedTransition = true;

            try {
                await axios.post(transitionUrl);
            } catch (error) {
                console.error('Error advancing draft timer:', error);
                hasRequestedTransition = false;
            }
        };

        requestTransitionIfExpired();
        const intervalId = setInterval(requestTransitionIfExpired, TIMER_POLL_MS);
        return () => clearInterval(intervalId);
    }, [enabled, timerEndTime, timerIsPaused, transitionUrl]);
};

const ToastNotification = ({ message, show, onClose }) => {
    if (!show) return null;
    return (
        <div className="toast draft-toast" role="status">
            {message}
            <button onClick={onClose} aria-label="Dismiss">&times;</button>
        </div>
    );
};

const DraftScreen = ({
    sharedLiveState = false,
    league: sharedLeague = null,
    leagueLoaded = false,
    beerRequest = null,
    chatMessages = [],
} = {}) => {
    const { leagueId } = useParams();
    const { user } = useAuth();
    const [localLeague, setLocalLeague] = useState(null);
    const [localLoading, setLocalLoading] = useState(true);
    const [draftProfile, setDraftProfile] = useState(EMPTY_DRAFT_PROFILE);
    const [toast, setToast] = useState({ show: false, message: '' });
    const league = sharedLiveState ? sharedLeague : localLeague;
    const loading = sharedLiveState ? !leagueLoaded : localLoading;

    useEffect(() => {
        if (sharedLiveState) return;

        const fetchLeagueState = async () => {
            if (!user?.userId) return;
            try {
                const response = await axios.get(`${API_BASE_URL}/leagues/${leagueId}/state`);
                setLocalLeague(response.data);
            } catch (error) {
                console.error('Error fetching league state:', error);
            } finally {
                setLocalLoading(false);
            }
        };
        fetchLeagueState();
    }, [leagueId, user, sharedLiveState]);

    useEffect(() => {
        const fetchDraftProfile = async () => {
            if (!user?.userId) return;
            try {
                const response = await axios.post(`${API_BASE_URL}/user-profile`, {
                    userId: user.userId,
                    displayName: user.userDetails,
                });
                setDraftProfile(normalizeDraftProfile(response.data));
            } catch (error) {
                console.error('Error fetching draft profile strategy data:', error);
                setDraftProfile(EMPTY_DRAFT_PROFILE);
            }
        };

        fetchDraftProfile();
    }, [user]);

    useEffect(() => {
        if (sharedLiveState || !user?.userId) return;

        let connection;
        const setupLiveUpdates = async () => {
            try {
                connection = createDraftConnection({ leagueIds: [leagueId], userId: user.userId });

                connection.on('draftStateUpdate', (updatedLeague) => {
                    if (updatedLeague.id === leagueId) {
                        setLocalLeague(updatedLeague);
                    }
                });

                connection.on('beerRequestReceived', (requestingTeamName) => {
                    setToast({ show: true, message: `${requestingTeamName} wants a beer!` });
                    setTimeout(() => setToast({ show: false, message: '' }), 5000);
                });
                
                await connection.start();
                await axios.post(`${API_BASE_URL}/leagues/${leagueId}/connect`, { userId: user.userId });

            } catch (e) {
                console.error('Live draft connection failed: ', e);
            }
        };

        setupLiveUpdates();

        const handleVisibilityChange = () => {
            if (!user?.userId) return;
            if (document.visibilityState === 'hidden') {
                axios.post(`${API_BASE_URL}/leagues/${leagueId}/disconnect`, { userId: user.userId });
            } else {
                axios.post(`${API_BASE_URL}/leagues/${leagueId}/connect`, { userId: user.userId });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (connection) {
                axios.post(`${API_BASE_URL}/leagues/${leagueId}/disconnect`, { userId: user.userId });
                connection.stop();
            }
        };
    }, [leagueId, user, sharedLiveState]);

    useEffect(() => {
        if (!sharedLiveState || !beerRequest?.message) return undefined;

        setToast({ show: true, message: beerRequest.message });
        const timer = window.setTimeout(() => setToast({ show: false, message: '' }), 5000);
        return () => window.clearTimeout(timer);
    }, [sharedLiveState, beerRequest]);

    const handleFavoriteIdsChange = (favoritePlayerIds) => {
        setDraftProfile((current) => ({
            ...current,
            loaded: true,
            favoritePlayerIds: normalizeIdList(favoritePlayerIds),
        }));
    };

    if (loading) return <div>Loading Draft Room...</div>;
    if (!league) return <div>Could not load league.</div>;

    const normalizedStatus = String(league.status || '').toLowerCase();
    const isLobbyPhase = normalizedStatus === 'created' || normalizedStatus === 'lobby';
    const isCompleted = normalizedStatus === 'completed';
    const isManualDraft = league.draftMode === 'manual';
    const isWhiteboard = !isManualDraft && isWhiteboardLeague(league);
    const statusLabel = leagueStatusLabel(league);

    return (
        <div className="draft-screen" style={{ padding: '20px' }}>
            <ToastNotification message={toast.message} show={toast.show} onClose={() => setToast({ show: false, message: '' })} />
            <h2 className="draft-screen-title">{league.name}</h2>
            <p className="draft-screen-status">
                <span className={`draft-status-bug status-${normalizedStatus || 'unknown'}`}>{statusLabel}</span>
                {isManualDraft && normalizedStatus !== 'manual' && <span className="draft-mode-tag">Manual Tracker</span>}
                {isWhiteboard && <span className="draft-mode-tag is-whiteboard">{biddingStyleLabel(league.biddingMode)}</span>}
            </p>
            <div className="button-group">
                {isOfflineLeague(leagueId) ? (
                    // A new tab would load the site from the network; with no internet, stay in this tab.
                    <Link to={`/draft/${leagueId}/tv`}>
                        <button type="button" className="edit-roster-button">TV Board</button>
                    </Link>
                ) : (
                    <a href={`/draft/${leagueId}/tv`} target="_blank" rel="noreferrer">
                        <button type="button" className="edit-roster-button">TV Board</button>
                    </a>
                )}
            </div>

            {isLobbyPhase ? (
                <LobbyView league={league} user={user} leagueId={leagueId} draftProfile={draftProfile} onFavoriteIdsChange={handleFavoriteIdsChange} />
            ) : isCompleted ? (
                <CompletedView league={league} leagueId={leagueId} draftProfile={draftProfile} />
            ) : (
                <DraftingView league={league} user={user} leagueId={leagueId} draftProfile={draftProfile} chatMessages={chatMessages} onFavoriteIdsChange={handleFavoriteIdsChange} />
            )}
        </div>
    );
};

const LobbyView = ({ league, user, leagueId, draftProfile, onFavoriteIdsChange }) => {
    const isCurrentUserAdmin = league.adminId === user.userId;
    const isManualDraft = league.draftMode === 'manual';
    const nonAdminMembers = (league.members || []).filter(id => id !== league.adminId);
    const readyMembers = league.readyMembers || [];
    const allNonAdminsReady = nonAdminMembers.every(memberId => readyMembers.includes(memberId));
    const canStartDraft = isCurrentUserAdmin && (isManualDraft || nonAdminMembers.length === 0 || allNonAdminsReady);

    const handleSetReadyStatus = async () => {
        const currentStatus = readyMembers.includes(user.userId);
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
    
    return (
        <>
            <div className="card">
                <h3>{isCurrentUserAdmin ? 'Start the Draft' : 'Before the Draft'}</h3>
                {isCurrentUserAdmin ? (
                    <button onClick={handleStartDraft} className={`start-draft-button ${canStartDraft ? 'ready' : ''}`} disabled={!canStartDraft}>
                        {isManualDraft ? 'Start Manual Tracker' : `Start Draft (${readyMembers.length}/${nonAdminMembers.length} Ready)`}
                    </button>
                ) : isManualDraft ? (
                    <p className="draft-muted">Waiting for the commissioner.</p>
                ) : (
                    <button onClick={handleSetReadyStatus} className={`ready-button ${readyMembers.includes(user.userId) ? 'ready' : ''}`}>
                        {readyMembers.includes(user.userId) ? 'You are Ready!' : "I'm Ready!"}
                    </button>
                )}
            </div>
            {isManualDraft && isCurrentUserAdmin ? (
                <ManualTeamSetupPanel league={league} user={user} leagueId={leagueId} />
            ) : (
                <div className="card" style={{marginTop: '20px'}}>
                    <h3>League Teams</h3>
                    <TeamListViewer league={league} user={user} leagueId={leagueId} draftProfile={draftProfile} />
                </div>
            )}
            <PlayerListViewer league={league} user={user} leagueId={leagueId} draftProfile={draftProfile} onFavoriteIdsChange={onFavoriteIdsChange} />
        </>
    );
};

const DraftingView = ({ league, user, leagueId, draftProfile, chatMessages = [], onFavoriteIdsChange }) => {
    const normalizedStatus = String(league.status || '').toLowerCase();
    const isIntermission = normalizedStatus === 'intermission';
    const isTieBreaker = normalizedStatus === 'tiebreaker';
    const isManual = normalizedStatus === 'manual';
    const isBoardReview = normalizedStatus === 'boardreview';
    const isAuctionPhase = normalizedStatus === 'drafting' || isTieBreaker;
    const beerBitchTeam = (league.teams || []).find(t => t.id === league.beerBitchTeamId);

    useTimerTransition(
        isAuctionPhase,
        league.auctionTimer,
        `${API_BASE_URL}/leagues/${leagueId}/endBidding`
    );
    useTimerTransition(
        isIntermission,
        league.auctionTimer,
        `${API_BASE_URL}/leagues/${leagueId}/nextRound`
    );

    return (
        <>
            {isManual ? (
                <ManualDraftView league={league} user={user} leagueId={leagueId} draftProfile={draftProfile} chatMessages={chatMessages} />
            ) : isIntermission ? (
                <IntermissionView league={league} draftProfile={draftProfile} />
            ) : isBoardReview ? (
                <BoardReviewView league={league} user={user} leagueId={leagueId} draftProfile={draftProfile} />
            ) : isTieBreaker ? (
                <TieBreakerView league={league} user={user} leagueId={leagueId} draftProfile={draftProfile} />
            ) : (
                <AuctionView league={league} user={user} leagueId={leagueId} draftProfile={draftProfile} />
            )}

            {league.adminId === user.userId && (
                <div className="card commissioner-controls-card" style={{marginTop: '20px'}}>
                    <h3>Commissioner Controls</h3>
                    <AdminControls league={league} user={user} leagueId={leagueId} draftProfile={draftProfile} />
                </div>
            )}

            <div className="card" style={{marginTop: '20px'}}>
                <h3>League Teams</h3>
                <TeamListViewer league={league} user={user} leagueId={leagueId} draftProfile={draftProfile} />
            </div>

            {beerBitchTeam && (
                <div className="card beer-duty-card" style={{marginTop: '20px'}}>
                    <h3>Beer Duty!</h3>
                    <p><strong>{beerBitchTeam.name}</strong> has been assigned to Beer Duty!</p>
                </div>
            )}
            
            <PlayerListViewer league={league} user={user} leagueId={leagueId} draftProfile={draftProfile} onFavoriteIdsChange={onFavoriteIdsChange} />
        </>
    );
};

const AdminControls = ({ league, user, leagueId, draftProfile }) => {
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
        if (window.confirm('Are you sure you want to skip this player?')) {
            try {
                await axios.post(`${API_BASE_URL}/leagues/${leagueId}/skip`, { adminId: user.userId });
            } catch (error) {
                alert(`Error skipping player: ${error.response?.data || error.message}`);
            }
        }
    };

    const handleSkipIntermission = async () => {
        if (window.confirm('Are you sure you want to skip the intermission and start the next auction immediately?')) {
            try {
                await axios.post(`${API_BASE_URL}/leagues/${leagueId}/skip-intermission`, { adminId: user.userId });
            } catch (error) {
                alert(`Error skipping intermission: ${error.response?.data || error.message}`);
            }
        }
    };

    const handleAssignBeerBitch = async (teamId) => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/beer-bitch`, { adminId: user.userId, teamId });
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
        const team = (league.teams || []).find(t => t.id === teamIdToKick);
        if (window.confirm(`Are you sure you want to kick ${team?.name || 'this team'}? This will return all their drafted players to the pool.`)) {
            try {
                await axios.post(`${API_BASE_URL}/leagues/${leagueId}/kick`, { adminId: user.userId, teamIdToKick });
            } catch (error) {
                alert(`Error kicking member: ${error.response?.data || error.message}`);
            }
        }
    };

    const handleAdjustBudget = async (teamId, newBudget) => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/adjust-budget`, { adminId: user.userId, teamId, newBudget: parseInt(newBudget, 10) || 0 });
        } catch (error) {
            alert(`Error adjusting budget: ${error.response?.data || error.message}`);
        }
    };

    const handleAddManualTeam = async (teamName, budget) => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/manual-teams`, {
                adminId: user.userId,
                teamName,
                budget: parseInt(budget, 10) || 200,
            });
        } catch (error) {
            alert(`Error adding manual team: ${error.response?.data || error.message}`);
        }
    };

    const handleAssignManualTeam = async (teamId, memberId) => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/manual-teams/assign`, {
                adminId: user.userId,
                teamId,
                userId: memberId,
            });
        } catch (error) {
            alert(`Error assigning manual team: ${error.response?.data || error.message}`);
        }
    };

    const handleCompleteDraft = async () => {
        if (window.confirm('Are you sure you want to end this draft? This cannot be undone.')) {
            try {
                await axios.post(`${API_BASE_URL}/leagues/${leagueId}/complete`, { adminId: user.userId });
            } catch (error) {
                alert(`Error completing draft: ${error.response?.data || error.message}`);
            }
        }
    };

    const handleUndoPick = async () => {
        if (window.confirm('Are you sure you want to undo the last pick? This will return the player to the pool and refund the winning team.')) {
            try {
                await axios.post(`${API_BASE_URL}/leagues/${leagueId}/undo-pick`, { adminId: user.userId });
            } catch (error) {
                alert(`Error undoing pick: ${error.response?.data || error.message}`);
            }
        }
    };

    const isPaused = league.auctionTimer?.isPaused;
    const normalizedStatus = String(league.status || '').toLowerCase();
    const isIntermission = normalizedStatus === 'intermission';
    const isTieBreaker = normalizedStatus === 'tiebreaker';
    const isManual = normalizedStatus === 'manual';
    const isBoardReview = normalizedStatus === 'boardreview';

    const pauseButtonText = () => {
        if (isTieBreaker) {
            return isPaused ? 'Resume Tie-Breaker' : 'Pause Tie-Breaker';
        }
        if (isIntermission) {
            return isPaused ? 'Resume Intermission' : 'Pause Intermission';
        }
        return isPaused ? 'Resume Draft' : 'Pause Draft';
    };

    return (
        <>
            <div className="admin-control-row">
                {!isManual && !isBoardReview && <button onClick={handlePauseDraft}>{pauseButtonText()}</button>}
                
                {!isManual && (
                    isIntermission ? (
                        <button onClick={handleSkipIntermission} disabled={isPaused}>Skip Intermission</button>
                    ) : (
                        <button onClick={handleSkipPlayer} disabled={!isBoardReview && (isPaused || isTieBreaker)}>Skip Player</button>
                    )
                )}

                {(isIntermission || isManual) && (
                    <button onClick={handleUndoPick} disabled={(!isManual && isPaused) || !(league.draftLog || []).length}>
                        Undo Last Pick
                    </button>
                )}

                {!isManual && <button onClick={() => setShowNominateModal(true)} disabled={!isPaused}>Nominate Player</button>}
                <button onClick={() => setShowManageMembersModal(true)} disabled={!isManual && !isPaused}>{isManual ? 'Manage Teams' : 'Manage Members'}</button>
                <button onClick={() => setShowBeerBitchModal(true)} disabled={!isManual && !isPaused}>Beer B!tch</button>
                <button onClick={handleCompleteDraft} disabled={!isManual && !isPaused}>Complete Draft</button>
            </div>

            {showBeerBitchModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Assign Beer B!tch</h3>
                        <p>Select a team to assign beer duty to.</p>
                        <ul style={{listStyle: 'none', padding: 0}}>
                            {(league.teams || []).map(team => (
                                <li key={team.id} className="player-list-item">
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
                    draftProfile={draftProfile}
                    onNominate={handleNominatePlayer}
                    onClose={() => setShowNominateModal(false)}
                />
            )}

            {showManageMembersModal && (
                <ManageMembersModal
                    league={league}
                    onKick={handleKickMember}
                    onAdjustBudget={handleAdjustBudget}
                    onAddManualTeam={handleAddManualTeam}
                    onAssignManualTeam={handleAssignManualTeam}
                    onClose={() => setShowManageMembersModal(false)}
                />
            )}
        </>
    );
};

const AuctionView = ({ league, user, leagueId, draftProfile }) => {
    const [bidAmount, setBidAmount] = useState(0);
    const [timer, setTimer] = useState(0);

    const currentPlayer = (league.initialPlayerPool || []).find(p => p.id === league.currentPlayerId);
    const userHasActiveBid = league.activeBids && league.activeBids[user.userId];
    const currentServerBid = userHasActiveBid ? league.activeBids[user.userId].amount : 0;
    const isWhiteboard = isWhiteboardLeague(league);
    const isAutoRead = isAutoReadLeague(league);
    const userHasTeam = (league.teams || []).some(t => t.ownerId === user.userId);

    useEffect(() => {
        // Whiteboard styles lock in drawings explicitly instead of sending the typed amount.
        if (isWhiteboard) return undefined;
        const debounceBid = setTimeout(() => {
            if (league.auctionTimer?.isPaused) { return; }

            if (bidAmount !== currentServerBid) {
                if (bidAmount > 0) {
                    axios.post(`${API_BASE_URL}/leagues/${leagueId}/bid`, { userId: user.userId, amount: parseInt(bidAmount, 10) || 0 });
                } else if (bidAmount === 0 && userHasActiveBid) {
                    axios.post(`${API_BASE_URL}/leagues/${leagueId}/cancel-bid`, { userId: user.userId });
                }
            }
        }, 250);

        return () => clearTimeout(debounceBid);
    }, [bidAmount, leagueId, user.userId, league.auctionTimer?.isPaused, userHasActiveBid, currentServerBid, isWhiteboard]);

    useEffect(() => {
        const { auctionTimer } = league;
        let intervalId = null;
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

    const handleCancelBid = () => {
        setBidAmount(0);
    };
    
    const incrementBid = () => setBidAmount(prev => prev + 1);
    const decrementBid = () => setBidAmount(prev => Math.max(0, prev - 1));

    const handleLockInBoard = async (amount, board) => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/bid`, { userId: user.userId, amount, board }, { suppressBidLimitAlert: true });
        } catch (error) {
            throw new Error(error.response?.data || error.message);
        }
    };

    const handleWithdrawBoard = async () => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/cancel-bid`, { userId: user.userId });
        } catch (error) {
            alert(`Error withdrawing your board: ${error.response?.data || error.message}`);
        }
    };

    if (!currentPlayer) return <div className="card">Waiting for player nomination...</div>;

    return (
        <div className="card auction-stage" style={{marginTop: '20px'}}>
            <h3>Current Player Up for Bid:</h3>
            <div className="auction-scoreboard-body">
                <div className="auction-player-block">
                    <h2 className="auction-player-name">{currentPlayer.name}</h2>
                    <div className="auction-player-tags">
                        <span className={`position-badge pos-${String(currentPlayer.position || '').toLowerCase()}`}>{currentPlayer.position}</span>
                        <span className="team-badge">{currentPlayer.team}</span>
                    </div>
                    <p className="auction-player-facts">Rank: {currentPlayer.rank} | Bye Week: {currentPlayer.bye}</p>
                    <PlayerStrategy draftProfile={draftProfile} playerId={currentPlayer.id} />
                </div>
                <div className="auction-clock-block">
                    <p
                        className={`auction-clock${timer > 0 && timer <= 5 ? ' is-urgent' : ''}${league.auctionTimer?.isPaused ? ' is-paused' : ''}`}
                        style={{ '--timer-progress': Math.min(1, Math.max(0, timer / (Number(league.draftTimers?.bidTimer) || 20))) }}
                    >
                        <span className="auction-clock-label">Bid Ends In</span>
                        <strong className={`auction-clock-value${timer >= 3600 ? ' is-hours' : timer >= 60 ? ' is-minutes' : ''}`}>{formatClock(timer)}{timer < 60 ? 's' : ''}</strong>
                    </p>
                    {userHasActiveBid && isWhiteboard && (
                        <div className="auction-your-bid is-board">
                            <span>Your board</span>
                            <BoardSketch board={league.activeBids[user.userId].board} className="wb-mine-thumb" strokeWidth={2.5} title="Your locked-in board" />
                            {isAutoRead && league.activeBids[user.userId].amount > 0 && <em>Reads ${league.activeBids[user.userId].amount}</em>}
                        </div>
                    )}
                    {userHasActiveBid && !isWhiteboard && (
                        <p className="auction-your-bid">
                            <span>Your current bid</span>
                            <strong key={league.activeBids[user.userId].amount} className="bid-flash">${league.activeBids[user.userId].amount}</strong>
                        </p>
                    )}
                </div>
            </div>

            {isWhiteboard ? (
                <WhiteboardPad
                    autoRead={isAutoRead}
                    activeBid={league.activeBids?.[user.userId] || null}
                    disabled={!userHasTeam || Boolean(league.auctionTimer?.isPaused)}
                    disabledReason={!userHasTeam ? 'You need a team in this league to bid.' : 'The draft is paused.'}
                    onLockIn={handleLockInBoard}
                    onWithdraw={handleWithdrawBoard}
                    showLocked={false}
                    userId={user.userId}
                    maxAmount={maxBidFor(league, (league.teams || []).find(t => t.ownerId === user.userId))}
                />
            ) : (
            <div className="bid-control-row auction-bid-controls">
                <span className="bid-control-label">Your Bid:</span>
                <button className="bid-step-button" onClick={decrementBid} aria-label="Lower bid">-</button>
                <input 
                    type="number" 
                    value={bidAmount} 
                    onChange={e => setBidAmount(parseInt(e.target.value, 10) || 0)}
                    aria-label="Your bid"
                />
                <button className="bid-step-button" onClick={incrementBid} aria-label="Raise bid">+</button>
                
                <button onClick={handleCancelBid} className="delete-button cancel-bid-button" disabled={!userHasActiveBid || league.auctionTimer?.isPaused}>
                    Cancel Bid
                </button>
            </div>
            )}
        </div>
    );
};

const ManualTeamSetupPanel = ({ league, user, leagueId, selectedTeamId = '', onSelectTeam, onDrawTeam, embedded = false }) => {
    const [manualTeamName, setManualTeamName] = useState('');
    const [manualTeamBudget, setManualTeamBudget] = useState(200);
    const [isAddingTeam, setIsAddingTeam] = useState(false);
    const teams = league.teams || [];
    const rosterTotal = getRosterTotal(league.rosterSettings);

    const handleAddManualTeam = async () => {
        setIsAddingTeam(true);
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/manual-teams`, {
                adminId: user.userId,
                teamName: manualTeamName,
                budget: parseInt(manualTeamBudget, 10) || 200,
            });
            setManualTeamName('');
            setManualTeamBudget(200);
        } catch (error) {
            alert(`Error adding manual team: ${error.response?.data || error.message}`);
        } finally {
            setIsAddingTeam(false);
        }
    };

    return (
        <div className={`${embedded ? '' : 'card '}manual-team-setup-card`} style={embedded ? undefined : { marginTop: '20px' }}>
            <div className="manual-section-heading">
                <div>
                    <p className="section-kicker">Manual teams</p>
                    <h3>Team Setup</h3>
                </div>
                <div className="board-count">{teams.length} team{teams.length === 1 ? '' : 's'}</div>
            </div>

            <div className="manual-add-team-row">
                <label>
                    Team Name
                    <input
                        type="text"
                        value={manualTeamName}
                        onChange={(e) => setManualTeamName(e.target.value)}
                        placeholder={`Team ${teams.length + 1}`}
                    />
                </label>
                <label>
                    Starting Budget
                    <input
                        type="number"
                        min="1"
                        value={manualTeamBudget}
                        onChange={(e) => setManualTeamBudget(parseInt(e.target.value, 10) || 0)}
                    />
                </label>
                <button type="button" onClick={handleAddManualTeam} disabled={isAddingTeam}>
                    {isAddingTeam ? 'Adding...' : 'Add Team'}
                </button>
                {onDrawTeam && (
                    <button type="button" className="edit-roster-button" onClick={onDrawTeam} disabled={teams.length === 0}>
                        Draw Team
                    </button>
                )}
            </div>

            <div className="manual-team-grid">
                {teams.map(team => {
                    const rosterCount = (team.roster || []).length;
                    const isSelected = team.id === selectedTeamId;
                    return (
                        <button
                            type="button"
                            key={team.id}
                            className={`manual-team-tile ${isSelected ? 'selected' : ''}`}
                            onClick={() => onSelectTeam && onSelectTeam(team.id)}
                        >
                            <strong>{team.name}</strong>
                            <span>${team.budget} left</span>
                            <span>{rosterCount}/{rosterTotal} roster</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

const ManualDraftView = ({ league, user, leagueId, draftProfile, chatMessages = [] }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPlayerId, setSelectedPlayerId] = useState('');
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [positionFilter, setPositionFilter] = useState('ALL');
    const [amount, setAmount] = useState(1);
    const [isSaving, setIsSaving] = useState(false);
    const isAdmin = league.adminId === user.userId;
    const teams = league.teams || [];
    const query = searchTerm.trim().toLowerCase();
    const availablePlayers = useMemo(() => (league.initialPlayerPool || [])
        .filter(player => !player.isDrafted)
        .sort((a, b) => (a.rank || 9999) - (b.rank || 9999)), [league.initialPlayerPool]);
    const matchingPlayers = useMemo(() => availablePlayers
        .filter(player => positionFilter === 'ALL' || player.position === positionFilter)
        .filter(player => {
            if (!query) return true;
            return [player.name, player.team, player.position, player.rank]
                .filter(Boolean)
                .some(value => String(value).toLowerCase().includes(query));
        }), [availablePlayers, positionFilter, query]);
    const visiblePlayers = matchingPlayers.slice(0, 24);
    const selectedTeam = teams.find(team => team.id === selectedTeamId);
    const selectedPlayer = availablePlayers.find(player => player.id === selectedPlayerId);
    const rosterTotal = getRosterTotal(league.rosterSettings);
    const selectedRosterCount = selectedTeam?.roster?.length || 0;
    const remainingRosterSpots = rosterTotal > 0 ? Math.max(0, rosterTotal - selectedRosterCount) : 1;
    const maxAwardAmount = selectedTeam
        ? Math.max(0, selectedTeam.budget - Math.max(0, remainingRosterSpots - 1))
        : 0;
    const lastPick = league.draftLog && league.draftLog.length > 0 ? league.draftLog[league.draftLog.length - 1] : null;
    const lastPickTeam = teams.find(team => team.id === lastPick?.winningTeamId);

    useEffect(() => {
        if (league.currentPlayerId && availablePlayers.some(player => player.id === league.currentPlayerId)) {
            setSelectedPlayerId(league.currentPlayerId);
            return;
        }

        if (selectedPlayerId && !availablePlayers.some(player => player.id === selectedPlayerId)) {
            setSelectedPlayerId('');
        }
    }, [availablePlayers, league.currentPlayerId, selectedPlayerId]);


    const handleSelectPlayer = async (playerId) => {
        if (!playerId) return;

        setSelectedPlayerId(playerId);
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/manual-current-player`, {
                adminId: user.userId,
                playerId,
            });
        } catch (error) {
            alert(`Error setting current player: ${error.response?.data || error.message}`);
            setSelectedPlayerId(league.currentPlayerId || '');
        }
    };

    const handleDrawPlayer = () => {
        const player = pickRandomItem(matchingPlayers.length > 0 ? matchingPlayers : availablePlayers);
        if (player) handleSelectPlayer(player.id);
    };

    const handleAwardPlayer = async () => {
        if (!selectedTeamId || !selectedPlayerId) {
            alert('Choose a team and player before awarding the pick.');
            return;
        }

        const parsedAmount = parseInt(amount, 10) || 0;
        if (parsedAmount < 1) {
            alert('Manual draft prices must be at least $1.');
            return;
        }

        if (selectedTeam && parsedAmount > maxAwardAmount) {
            alert(`${selectedTeam.name} can spend up to $${maxAwardAmount} and still keep $1 for each remaining roster spot.`);
            return;
        }

        setIsSaving(true);
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/manual-award`, {
                adminId: user.userId,
                teamId: selectedTeamId,
                playerId: selectedPlayerId,
                amount: parsedAmount,
            });
            setSelectedPlayerId('');
            setSelectedTeamId('');
            setSearchTerm('');
            setAmount(1);
        } catch (error) {
            alert(`Error awarding player: ${error.response?.data || error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="card manual-draft-console" style={{ marginTop: '20px' }}>
            <div className="player-board-heading">
                <div>
                    <p className="section-kicker">Manual draft</p>
                    <h2>Commissioner Console</h2>
                </div>
                <div className="board-count">{availablePlayers.length} available</div>
            </div>

            {isAdmin ? (
                <>
                    {/* The order of a pick: put a player up, then record who won them and for how much. */}
                    <div className="manual-console-grid manual-console-steps">
                        <section className="manual-picker-panel">
                            <div className="manual-section-heading">
                                <div>
                                    <p className="section-kicker">Step 1</p>
                                    <h3>Put a player up</h3>
                                </div>
                                <button type="button" className="create-button" onClick={handleDrawPlayer} disabled={availablePlayers.length === 0}>
                                    Draw Player
                                </button>
                            </div>

                            <div className="manual-up-now">
                                {selectedPlayer ? (
                                    <>
                                        <strong>{selectedPlayer.name}</strong>
                                        <small>#{selectedPlayer.rank || '-'} / {selectedPlayer.position} / {selectedPlayer.team} / Bye {selectedPlayer.bye || '-'}</small>
                                    </>
                                ) : (
                                    <span>Draw a player, or choose one below.</span>
                                )}
                            </div>

                            <p className="manual-choose-label">Or choose a player</p>
                            <div className="manual-player-filters">
                                <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)}>
                                    <option value="ALL">All Positions</option>
                                    {POSITION_OPTIONS.map(position => <option key={position} value={position}>{position}</option>)}
                                </select>
                                <input
                                    type="text"
                                    placeholder="Search player, team, rank"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <div className="manual-player-list">
                                {visiblePlayers.length > 0 ? visiblePlayers.map(player => (
                                    <button
                                        type="button"
                                        key={player.id}
                                        className={`manual-player-option ${player.id === selectedPlayerId ? 'selected' : ''}`}
                                        onClick={() => handleSelectPlayer(player.id)}
                                    >
                                        <span className="manual-player-rank">#{player.rank || '-'}</span>
                                        <span>
                                            <strong>{player.name}</strong>
                                            <small>{player.position} / {player.team} / Bye {player.bye || '-'}</small>
                                        </span>
                                    </button>
                                )) : (
                                    <div className="empty-state">No players match that search.</div>
                                )}
                            </div>
                        </section>

                        <section className="manual-award-panel">
                            <p className="section-kicker">Step 2</p>
                            <h3>{selectedPlayer ? `Award ${selectedPlayer.name}` : 'Award the pick'}</h3>
                            {selectedPlayer ? (
                                <>
                                    <p className="manual-award-help">Tap the team that won the bid, then enter their bid.</p>
                                    <div className="manual-team-grid manual-award-teams">
                                        {teams.map(team => {
                                            const rosterCount = (team.roster || []).length;
                                            const full = rosterTotal > 0 && rosterCount >= rosterTotal;
                                            return (
                                                <button
                                                    type="button"
                                                    key={team.id}
                                                    className={`manual-team-tile ${team.id === selectedTeamId ? 'selected' : ''}`}
                                                    onClick={() => setSelectedTeamId(team.id)}
                                                    disabled={full}
                                                >
                                                    <strong>{team.name}</strong>
                                                    <span>${team.budget} left</span>
                                                    <span>{full ? 'Roster full' : `${rosterCount}/${rosterTotal} roster`}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <label>
                                        Winning bid{selectedTeam ? ` (max $${maxAwardAmount})` : ''}
                                        <input
                                            type="number"
                                            min="1"
                                            max={maxAwardAmount || undefined}
                                            value={amount}
                                            onChange={(e) => setAmount(parseInt(e.target.value, 10) || 0)}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        className="create-button"
                                        onClick={handleAwardPlayer}
                                        disabled={isSaving || !selectedTeamId || maxAwardAmount < 1}
                                    >
                                        {isSaving
                                            ? 'Awarding...'
                                            : selectedTeam
                                                ? `Award to ${selectedTeam.name} for $${parseInt(amount, 10) || 0}`
                                                : 'Choose the winning team'}
                                    </button>
                                    <PlayerStrategy draftProfile={draftProfile} playerId={selectedPlayer.id} />
                                </>
                            ) : (
                                <p className="manual-award-help">Put a player up first.</p>
                            )}
                        </section>
                    </div>

                    <details className="manual-team-setup-details">
                        <summary>Teams and budgets</summary>
                        <ManualTeamSetupPanel league={league} user={user} leagueId={leagueId} embedded />
                    </details>
                </>
            ) : (
                <ManualParticipantView
                    league={league}
                    user={user}
                    leagueId={leagueId}
                    draftProfile={draftProfile}
                    chatMessages={chatMessages}
                />
            )}

            {lastPick && (
                <div style={{ marginTop: '24px' }}>
                    <h4>Latest Pick</h4>
                    <p>
                        <strong>{lastPick.player?.name || 'Unknown Player'}</strong> to <strong>{lastPickTeam?.name || 'Unknown Team'}</strong> for <strong>${lastPick.winningBid}</strong>
                    </p>
                    <PlayerStrategy draftProfile={draftProfile} playerId={lastPick.player?.id} />
                </div>
            )}
        </div>
    );
};

const ManualParticipantView = ({ league, user, leagueId, draftProfile, chatMessages = [] }) => {
    const [beerRequestCooldown, setBeerRequestCooldown] = useState(0);
    const [chatText, setChatText] = useState('');
    const teams = league.teams || [];
    const currentTeam = teams.find(team => team.ownerId === user.userId);
    const currentPlayer = (league.initialPlayerPool || []).find(player => player.id === league.currentPlayerId);
    const beerDutyTeam = teams.find(team => team.id === league.beerBitchTeamId);
    const rosterTotal = getRosterTotal(league.rosterSettings);
    const roster = currentTeam?.roster || [];
    const openRosterSpots = rosterTotal > 0 ? Math.max(0, rosterTotal - roster.length) : 0;
    const maxManualSpend = currentTeam ? Math.max(0, (Number(currentTeam.budget) || 0) - Math.max(0, openRosterSpots - 1)) : 0;
    const favoriteSet = new Set(getDraftFavoriteIds(draftProfile, currentTeam));
    const favoritePlayers = (league.initialPlayerPool || [])
        .filter(player => favoriteSet.has(player.id) && !player.isDrafted)
        .sort((a, b) => (a.rank || 9999) - (b.rank || 9999))
        .slice(0, 8);
    const recentRoster = roster.slice(-6).reverse();
    const canRequestBeer = Boolean(currentTeam && beerDutyTeam && beerDutyTeam.id !== currentTeam.id);

    useEffect(() => {
        if (beerRequestCooldown <= 0) return undefined;
        const timer = window.setTimeout(() => setBeerRequestCooldown(current => current - 1), 1000);
        return () => window.clearTimeout(timer);
    }, [beerRequestCooldown]);

    const handleRequestBeer = async () => {
        if (!currentTeam || !canRequestBeer || beerRequestCooldown > 0) return;

        setBeerRequestCooldown(300);
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/request-beer`, { requestingTeamId: currentTeam.id });
        } catch (error) {
            setBeerRequestCooldown(0);
            alert(`Error requesting beer: ${error.response?.data || error.message}`);
        }
    };

    const handleSendChat = async (event) => {
        event.preventDefault();
        const message = chatText.trim();
        if (!message || !user?.userId) return;

        setChatText('');
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/chat`, {
                userId: user.userId,
                displayName: user.userDetails,
                message,
            });
        } catch (error) {
            setChatText(message);
            alert(`Error sending chat: ${error.response?.data || error.message}`);
        }
    };

    const beerButtonLabel = beerRequestCooldown > 0
        ? `Request Beer (${beerRequestCooldown}s)`
        : !currentTeam
            ? 'Waiting for Team'
            : beerDutyTeam?.id === currentTeam.id
                ? 'You Are on Duty'
                : 'Request Beer';

    return (
        <div className="manual-participant-view">
            <section className="manual-participant-card manual-participant-feature">
                <p className="section-kicker">Up Now</p>
                {currentPlayer ? (
                    <>
                        <h3>{currentPlayer.name}</h3>
                        <div className="manual-participant-tags">
                            <span className={`pos-badge pos-${String(currentPlayer.position || '').toLowerCase()}`}>{currentPlayer.position}</span>
                            <span>{currentPlayer.team}</span>
                            <span>Bye {currentPlayer.bye || '-'}</span>
                            <span>Rank #{currentPlayer.rank || '-'}</span>
                        </div>
                        <PlayerStrategy draftProfile={draftProfile} playerId={currentPlayer.id} />
                    </>
                ) : (
                    <p className="draft-muted">Waiting for the next player.</p>
                )}
            </section>

            <section className="manual-participant-card">
                <p className="section-kicker">Your Team</p>
                {currentTeam ? (
                    <>
                        <h3>{currentTeam.name}</h3>
                        <div className="manual-participant-stats">
                            <span>${currentTeam.budget} budget</span>
                            <span>Max ${maxManualSpend}</span>
                            <span>{roster.length}/{rosterTotal} roster</span>
                        </div>
                        {recentRoster.length > 0 ? (
                            <ul className="manual-participant-list">
                                {recentRoster.map((spot, index) => (
                                    <li key={`${spot.player?.id || index}-${index}`}>
                                        <strong>{spot.player?.name || 'Unknown Player'}</strong>
                                        <span>{spot.player?.position || spot.position || '-'} / {spot.player?.team || '-'} / Bye {spot.player?.bye || '-'}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="draft-muted">No picks yet.</p>
                        )}
                    </>
                ) : (
                    <>
                        <h3>Unassigned</h3>
                        <p className="draft-muted">Waiting for commissioner assignment.</p>
                    </>
                )}
            </section>

            <section className="manual-participant-card">
                <p className="section-kicker">Beer</p>
                <h3>{beerDutyTeam ? beerDutyTeam.name : 'No duty set'}</h3>
                <button type="button" onClick={handleRequestBeer} disabled={!canRequestBeer || beerRequestCooldown > 0}>
                    {beerButtonLabel}
                </button>
            </section>

            <section className="manual-participant-card manual-participant-chat">
                <p className="section-kicker">Draft Chat</p>
                <div className="draft-chat-log" aria-live="polite">
                    {chatMessages.length === 0 ? (
                        <p className="draft-muted">No messages yet.</p>
                    ) : chatMessages.map((message, index) => (
                        <div className="draft-chat-message" key={`${message.sentAt || index}-${index}`}>
                            <div className="draft-chat-meta">
                                <strong>{message.teamName || message.displayName || 'Team'}</strong>
                                <span>{formatDraftChatTime(message.sentAt)}</span>
                            </div>
                            <p>{message.message}</p>
                        </div>
                    ))}
                </div>
                <form className="draft-chat-form" onSubmit={handleSendChat}>
                    <input
                        type="text"
                        maxLength="240"
                        placeholder="Talk smack..."
                        value={chatText}
                        onChange={(event) => setChatText(event.target.value)}
                    />
                    <button type="submit" disabled={!chatText.trim()}>Send</button>
                </form>
            </section>

            <section className="manual-participant-card manual-participant-favorites">
                <p className="section-kicker">Targets</p>
                {favoritePlayers.length > 0 ? (
                    <ul className="manual-participant-list">
                        {favoritePlayers.map(player => (
                            <li key={player.id}>
                                <strong>{player.name}</strong>
                                <span>{player.position} / {player.team} / Bye {player.bye || '-'}</span>
                                <PlayerStrategy draftProfile={draftProfile} playerId={player.id} compact />
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="draft-muted">No available favorites.</p>
                )}
            </section>
        </div>
    );
};

const IntermissionView = ({ league, draftProfile }) => {
    const [timer, setTimer] = useState(0);
    const lastPick = league.draftLog && league.draftLog.length > 0 ? league.draftLog[league.draftLog.length - 1] : null;

    useEffect(() => {
        const { auctionTimer } = league;
        let intervalId = null;
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

    const winningTeam = (league.teams || []).find(t => t.id === lastPick.winningTeamId);
    const allBids = Object.entries(lastPick.allBids || {}).sort(([,a],[,b]) => b.amount - a.amount);
    const showBoards = isWhiteboardLeague(league) || allBids.some(([, bid]) => bid?.board);

    return (
        <div className="card intermission-card" style={{marginTop: '20px'}}>
            <h2>Between Players</h2>
            <p className="intermission-clock">Next player in: <strong>{formatClock(timer)}{timer < 60 ? 's' : ''}</strong></p>
            <div style={{marginTop: '20px'}}>
                <h4>Last Player Drafted:</h4>
                <p>
                    <strong>{lastPick.player.name} ({lastPick.player.position} - {lastPick.player.team})</strong> was drafted by 
                    <strong> {winningTeam?.name || 'N/A'}</strong> for 
                    <strong> ${lastPick.winningBid}</strong>!
                </p>
                <PlayerStrategy draftProfile={draftProfile} playerId={lastPick.player?.id} />
            </div>
            {showBoards ? (
                <div style={{marginTop: '20px'}}>
                    <h4>Everyone's Boards:</h4>
                    <BoardGrid
                        league={league}
                        bids={lastPick.allBids || {}}
                        winnerId={winningTeam?.ownerId}
                        label={pickLabel(league, lastPick)}
                        revealKey={`${lastPick.player?.id}-${league.draftLog.length}`}
                    />
                </div>
            ) : (
            <div style={{marginTop: '20px'}}>
                <h4>All Bids for this Player:</h4>
                <ul className="bid-history-list">
                    {allBids.map(([userId, bid]) => {
                        const team = (league.teams || []).find(t => t.ownerId === userId);
                        return <li key={userId}>{team?.name || 'Unknown Team'}: ${bid.amount}</li>;
                    })}
                </ul>
            </div>
            )}
        </div>
    );
};

const BoardReviewView = ({ league, user, leagueId, draftProfile }) => {
    const [selectedId, setSelectedId] = useState(null);
    const review = league.boardReview;
    const currentPlayer = (league.initialPlayerPool || []).find(p => p.id === league.currentPlayerId);
    const isCurrentUserAdmin = league.adminId === user.userId;
    const boardCount = Object.keys(review?.bids || {}).length;

    if (!review) return <div className="card">Collecting the boards...</div>;

    return (
        <div className="card board-review-card" style={{marginTop: '20px'}}>
            <h2>Boards Up!</h2>
            <p className="board-review-player">
                {boardCount} board{boardCount === 1 ? '' : 's'} for <strong>{currentPlayer?.name || 'this player'}</strong>
                {currentPlayer ? ` (${currentPlayer.position} - ${currentPlayer.team})` : ''}
            </p>
            {currentPlayer && <PlayerStrategy draftProfile={draftProfile} playerId={currentPlayer.id} />}
            <BoardGrid
                league={league}
                bids={review.bids}
                label={reviewLabel(league)}
                selectedId={isCurrentUserAdmin ? selectedId : null}
                onSelect={isCurrentUserAdmin ? setSelectedId : undefined}
                revealKey={review.playerId || ''}
            />
            {isCurrentUserAdmin ? (
                <BoardAwardPanel league={league} leagueId={leagueId} selectedId={selectedId} onSelect={setSelectedId} />
            ) : (
                <p className="board-review-wait">Waiting for the commissioner to award {currentPlayer?.name || 'the player'}.</p>
            )}
        </div>
    );
};

const TieBreakerView = ({ league, user, leagueId, draftProfile }) => {
    const [bidAmount, setBidAmount] = useState(0);
    const [timer, setTimer] = useState(0);
    const [showResolveTieModal, setShowResolveTieModal] = useState(false);

    const currentPlayer = (league.initialPlayerPool || []).find(p => p.id === league.currentPlayerId);
    const tiedTeamIds = league.tieBreaker?.tiedTeamIds || [];
    const userIsTied = tiedTeamIds.includes(user.userId);
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
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/tiebreaker-bid`, { userId: user.userId, amount: parseInt(bidAmount, 10) || 0 });
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
        <div className="card tiebreaker-card" style={{marginTop: '20px'}}>
            <h2>Tie Breaker!</h2>
            <p>A tie was detected for <strong>{currentPlayer.name}</strong> at <strong>${league.tieBreaker.tieAmount}</strong>.</p>
            <PlayerStrategy draftProfile={draftProfile} playerId={currentPlayer.id} />
            <p
                className={`auction-clock tiebreaker-clock${timer > 0 && timer <= 5 ? ' is-urgent' : ''}${league.auctionTimer?.isPaused ? ' is-paused' : ''}`}
                style={{ '--timer-progress': Math.min(1, Math.max(0, timer / (Number(league.draftTimers?.rebidTimer) || 15))) }}
            >
                <span className="auction-clock-label">Re-bid Ends In</span>
                <strong className={`auction-clock-value${timer >= 3600 ? ' is-hours' : timer >= 60 ? ' is-minutes' : ''}`}>{formatClock(timer)}{timer < 60 ? 's' : ''}</strong>
            </p>

            {userIsTied ? (
                <div>
                    <h4>You are in the tie-breaker!</h4>
                    <p>You must bid at least ${league.tieBreaker.tieAmount + 1}.</p>
                    <div className="bid-control-row tiebreaker-bid-row">
                        <span className="bid-control-label">Your Bid:</span>
                        <input type="number" value={bidAmount} onChange={e => setBidAmount(parseInt(e.target.value, 10) || 0)} aria-label="Tie-breaker bid" disabled={league.auctionTimer?.isPaused} />
                        <button className="create-button" onClick={handlePlaceTieBid} disabled={league.auctionTimer?.isPaused}>Place Tie-Breaker Bid</button>
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
                            {tiedTeamIds.map(teamId => {
                                const team = (league.teams || []).find(t => t.ownerId === teamId);
                                return (
                                    <li key={teamId} className="player-list-item">
                                        <span>{team?.name || 'Unknown Team'}</span>
                                        {team && <button onClick={() => handleResolveTie(team.id)}>Award Player</button>}
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

const TeamListViewer = ({ league, user, leagueId, draftProfile }) => {
    const [beerRequestCooldown, setBeerRequestCooldown] = useState(0);
    const userTeam = (league.teams || []).find(t => t.ownerId === user.userId);

    useEffect(() => {
        if (beerRequestCooldown > 0) {
            const timer = setTimeout(() => setBeerRequestCooldown(prev => prev - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [beerRequestCooldown]);

    const { rosterSettings } = league;
    if (!rosterSettings) return null;
    const totalRosterSpots = getRosterTotal(rosterSettings);

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
            {(league.teams || []).map(team => {
                const isUserTeam = team.ownerId === user.userId;
                const roster = team.roster || [];
                const rosterSpotsFilled = roster.length;
                
                if (isUserTeam) {
                    const remainingRosterSpots = totalRosterSpots - rosterSpotsFilled;
                    const maxBid = team.budget - (remainingRosterSpots > 0 ? remainingRosterSpots - 1 : 0);
                    const positionCounts = getPositionCounts(rosterSettings, roster);

                    return (
                        <div key={team.id} className="user-team-details" style={{padding: '5px 0', borderBottom: '1px solid #eee'}}>
                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                                <h4>
                                    <span style={{ height: '10px', width: '10px', backgroundColor: (league.onlineUserIds || []).includes(team.ownerId) ? '#28a745' : '#6c757d', borderRadius: '50%', display: 'inline-block', marginRight: '8px' }}></span>
                                    {team.name} (You)
                                </h4>
                                <span>Roster: {rosterSpotsFilled} / {totalRosterSpots}</span>
                            </div>
                            <p style={{margin: '5px 0'}}>
                                Budget: ${team.budget} | 
                                Total Spent: ${200 - team.budget} | 
                                Max Bid: ${Math.max(0, maxBid)}
                            </p>
                            <div style={{display: 'flex', flexWrap: 'wrap', gap: '15px'}}>
                                <div>
                                    <h5>Your Position Needs:</h5>
                                    <ul className="need-chip-list">
                                        {Object.entries(rosterSettings).filter(([, count]) => Number(count) > 0).map(([pos, count]) => {
                                            const displayPosition = pos.toUpperCase();
                                            const filled = positionCounts[displayPosition] || 0;
                                            const remaining = Math.max(0, (count || 0) - filled);
                                            return (
                                                <li key={pos} className={remaining > 0 ? 'need-chip' : 'need-chip is-filled'}>
                                                    <strong>{displayPosition === 'SUPERFLEX' ? 'SFLEX' : displayPosition}</strong> {filled}/{count}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                                <BudgetPlanPanel draftProfile={draftProfile} />
                                <div>
                                    <h5>Your Roster:</h5>
                                    {roster.length === 0 && <p className="draft-muted">No players yet.</p>}
                                    <ul style={{listStyle: 'none', paddingLeft: '10px', margin: 0}}>
                                        {roster.map((spot, index) => (
                                            <li key={index}>{spot.player?.name || 'Unknown Player'} ({spot.player?.position || spot.position} - Bye: {spot.player?.bye || '-'}) - ${spot.player?.price || 0}</li>
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
                }

                return (
                    <div key={team.id} className="team-row" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <div>
                            <span style={{
                                height: '10px',
                                width: '10px',
                                backgroundColor: (league.onlineUserIds || []).includes(team.ownerId) ? '#28a745' : '#6c757d',
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
            })}
        </div>
    );
};

const PlayerListViewer = ({ league, user, leagueId, draftProfile, onFavoriteIdsChange }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortPosition, setSortPosition] = useState('All Positions');
    const userTeam = (league.teams || []).find(team => team.ownerId === user.userId);
    const userFavorites = getDraftFavoriteIds(draftProfile, userTeam);
    const favoriteSet = new Set(userFavorites);
    const allPlayers = league.initialPlayerPool || [];
    const query = searchTerm.toLowerCase();
    const favoritePlayers = allPlayers.filter(p => favoriteSet.has(p.id) && p.name.toLowerCase().includes(query) && (sortPosition === 'All Positions' || p.position === sortPosition));
    const availablePlayers = allPlayers.filter(p => !favoriteSet.has(p.id) && !p.isDrafted && p.name.toLowerCase().includes(query) && (sortPosition === 'All Positions' || p.position === sortPosition));
    const availablePage = useShowMore(availablePlayers, AVAILABLE_PAGE_SIZE, `${searchTerm}|${sortPosition}`);

    const handleToggleFavorite = async (playerIdToToggle) => {
        const isCurrentlyFavorite = favoriteSet.has(playerIdToToggle);
        const newFavoriteIds = isCurrentlyFavorite ? userFavorites.filter(id => id !== playerIdToToggle) : [...userFavorites, playerIdToToggle];
        onFavoriteIdsChange(newFavoriteIds);
        try {
            const response = await axios.post(`${API_BASE_URL}/leagues/${leagueId}/favorites`, { userId: user.userId, playerIds: newFavoriteIds });
            if (Array.isArray(response.data?.favoritePlayerIds)) {
                onFavoriteIdsChange(response.data.favoritePlayerIds);
            }
        } catch (error) {
            onFavoriteIdsChange(userFavorites);
            console.error('Error updating favorite players:', error);
            alert('Failed to update your favorite players.');
        }
    };

    return (
        <div className="card" style={{ marginTop: '20px' }}>
            <h3>Player Lists</h3>
            <p className="draft-muted" style={{ marginTop: 0 }}>
                Favorites, tiers, notes, and budget plan come from your Profile and stay synced here.
            </p>
            <div className="draft-player-filters">
                <select onChange={(e) => setSortPosition(e.target.value)} value={sortPosition} aria-label="Filter by position">
                    <option>All Positions</option>
                    {POSITION_OPTIONS.map(position => <option key={position}>{position}</option>)}
                </select>
                <input type="text" placeholder="Search for a player..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} aria-label="Search players" />
            </div>
            <h4>Your Favorited Players ({favoritePlayers.length})</h4>
            {favoritePlayers.length === 0 && <p className="draft-muted">Tap the ☆ next to a player to keep them up here.</p>}
            <ul className="draft-player-list">
                {favoritePlayers.map(player => (
                    <li key={player.id} className="player-list-item draft-player-row">
                        <PlayerSummary player={player} draftProfile={draftProfile} />
                        <button type="button" onClick={() => handleToggleFavorite(player.id)} className="favorite-toggle is-on" title="Remove from Favorites" aria-label={`Remove ${player.name} from favorites`}>★</button>
                    </li>
                ))}
            </ul>
            <h4 style={{marginTop: '20px'}}>Available Players ({availablePlayers.length})</h4>
            <ul className="draft-player-list">
                {availablePage.shown.map(player => (
                    <li key={player.id} className="player-list-item draft-player-row">
                        <PlayerSummary player={player} draftProfile={draftProfile} />
                        <button type="button" onClick={() => handleToggleFavorite(player.id)} className="favorite-toggle" title="Add to Favorites" aria-label={`Add ${player.name} to favorites`}>☆</button>
                    </li>
                ))}
            </ul>
            <ShowMoreButton hidden={availablePage.hidden} step={AVAILABLE_PAGE_SIZE} onClick={availablePage.showMore} />
        </div>
    );
};

const NominatePlayerModal = ({ league, draftProfile, onNominate, onClose }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const undraftedPlayers = (league.initialPlayerPool || []).filter(p => !p.isDrafted)
        .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>Nominate a Player</h3>
                <input type="text" placeholder="Search for a player..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{width: '95%', marginBottom: '10px'}}/>
                <ul style={{listStyle: 'none', padding: 0, maxHeight: '300px', overflowY: 'auto'}}>
                    {undraftedPlayers.map(player => (
                        <li key={player.id} className="player-list-item">
                            <PlayerSummary player={player} draftProfile={draftProfile} />
                            <button onClick={() => onNominate(player.id)}>Nominate</button>
                        </li>
                    ))}
                </ul>
                <button onClick={onClose} className="cancel-button">Cancel</button>
            </div>
        </div>
    );
};

const ManageMembersModal = ({ league, onKick, onAdjustBudget, onAddManualTeam, onAssignManualTeam, onClose }) => {
    const [budgets, setBudgets] = useState((league.teams || []).reduce((acc, team) => ({...acc, [team.id]: team.budget }), {}));
    const [manualTeamName, setManualTeamName] = useState('');
    const [manualTeamBudget, setManualTeamBudget] = useState(200);
    const [manualAssignments, setManualAssignments] = useState({});
    const isManualDraft = league.draftMode === 'manual';
    const memberIds = league.members || [];
    const assignedMemberIds = new Set((league.teams || [])
        .map(team => team.ownerId)
        .filter(ownerId => memberIds.includes(ownerId)));
    const unassignedMemberIds = memberIds.filter(memberId => !assignedMemberIds.has(memberId));

    const handleBudgetChange = (teamId, value) => {
        setBudgets(prev => ({ ...prev, [teamId]: parseInt(value, 10) || 0 }));
    };

    const handleAddManualTeam = async () => {
        await onAddManualTeam(manualTeamName, manualTeamBudget);
        setManualTeamName('');
        setManualTeamBudget(200);
    };

    const handleAssignManualTeam = async (teamId) => {
        const memberId = manualAssignments[teamId];
        if (!memberId) return;

        await onAssignManualTeam(teamId, memberId);
        setManualAssignments(prev => ({ ...prev, [teamId]: '' }));
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>{isManualDraft ? 'Manage Teams' : 'Manage Members'}</h3>
                {isManualDraft && (
                    <>
                        <div className="form-grid">
                            <label>
                                Team Name
                                <input
                                    type="text"
                                    value={manualTeamName}
                                    onChange={(e) => setManualTeamName(e.target.value)}
                                    placeholder={`Team ${(league.teams || []).length + 1}`}
                                />
                            </label>
                            <label>
                                Starting Budget
                                <input
                                    type="number"
                                    min="1"
                                    value={manualTeamBudget}
                                    onChange={(e) => setManualTeamBudget(parseInt(e.target.value, 10) || 0)}
                                />
                            </label>
                        </div>
                        <div className="form-actions">
                            <button type="button" onClick={handleAddManualTeam}>Add Team</button>
                        </div>
                        <div className="manual-assignment-panel">
                            <p className="section-kicker">Unassigned joiners</p>
                            <div className="manual-assignment-list">
                                {unassignedMemberIds.length > 0 ? unassignedMemberIds.map(memberId => (
                                    <span key={memberId}>{formatMemberLabel(memberId)}</span>
                                )) : <span>Everyone is assigned</span>}
                            </div>
                        </div>
                        <div className="divider" />
                    </>
                )}
                <ul style={{listStyle: 'none', padding: 0, maxHeight: '300px', overflowY: 'auto'}}>
                    {(league.teams || []).map(team => (
                        <li key={team.id} className="player-list-item">
                            <span>
                                <strong>{team.name}</strong>
                                {isManualDraft && <small className="draft-muted" style={{ display: 'block' }}>Owner: {formatTeamOwnerLabel(team.ownerId, memberIds)}</small>}
                            </span>
                            <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                                Budget: $
                                <input 
                                    type="number" 
                                    value={budgets[team.id]} 
                                    onChange={e => handleBudgetChange(team.id, e.target.value)} 
                                    style={{width: '60px'}}
                                />
                                <button onClick={() => onAdjustBudget(team.id, budgets[team.id])}>Set</button>
                                {isManualDraft && (
                                    <>
                                        <select
                                            value={manualAssignments[team.id] || ''}
                                            onChange={(event) => setManualAssignments(prev => ({ ...prev, [team.id]: event.target.value }))}
                                        >
                                            <option value="">Assign member</option>
                                            {memberIds.map(memberId => (
                                                <option key={memberId} value={memberId}>{formatMemberLabel(memberId)}</option>
                                            ))}
                                        </select>
                                        <button onClick={() => handleAssignManualTeam(team.id)} disabled={!manualAssignments[team.id]}>Assign</button>
                                    </>
                                )}
                                {team.ownerId !== league.adminId && (
                                    <button onClick={() => onKick(team.id)} className="delete-button">Kick</button>
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

const CompletedView = ({ league, leagueId, draftProfile }) => {
    return (
        <div className="card completed-draft-card">
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
            <div className="final-rosters">
                <h3>Final Rosters</h3>
                {(league.teams || []).map(team => (
                    <details key={team.id} className="final-roster">
                        <summary>
                            <strong>{team.name}</strong>
                            <span>{(team.roster || []).length} players &middot; ${team.budget} left</span>
                        </summary>
                        <ul>
                            {(team.roster || []).map((spot, index) => (
                                <li key={index}>
                                    <span className={`position-badge pos-${String(spot.player?.position || spot.position || '').toLowerCase()}`}>{spot.player?.position || spot.position}</span>
                                    <span className="final-roster-name">
                                        {spot.player?.name || 'Unknown Player'}
                                        <PlayerStrategy draftProfile={draftProfile} playerId={spot.player?.id} compact />
                                    </span>
                                    <strong>${spot.player?.price || 0}</strong>
                                </li>
                            ))}
                        </ul>
                    </details>
                ))}
            </div>
        </div>
    );
};

const PlayerSummary = ({ player, draftProfile }) => (
    <div className="player-summary">
        <span className="player-summary-line"><span className={`pos-dot pos-${String(player.position || '').toLowerCase()}`} aria-hidden="true" />{player.name}</span>
        <span className="player-summary-meta">{player.position} &middot; {player.team} &middot; Rank {player.rank} &middot; Bye {player.bye || '-'}</span>
        <PlayerStrategy draftProfile={draftProfile} playerId={player.id} compact />
    </div>
);

const PlayerStrategy = ({ draftProfile, playerId, compact = false }) => {
    const tier = getPlayerTier(draftProfile, playerId);
    const note = getPlayerNote(draftProfile, playerId);
    if (!tier && !note) return null;

    return (
        <div className={compact ? 'player-strategy compact' : 'player-strategy'}>
            {tier && <span className="player-strategy-tier">T{tier}</span>}
            {note && <span><strong>Your note:</strong> {note}</span>}
        </div>
    );
};

const BudgetPlanPanel = ({ draftProfile }) => {
    const rows = getBudgetPlanRows(draftProfile);
    if (rows.length === 0) return null;

    return (
        <div>
            <h5>Budget Plan:</h5>
            <ul style={{listStyle: 'none', paddingLeft: '10px', margin: 0}}>
                {rows.map(([position, amount]) => (
                    <li key={position}>{position}: ${amount}</li>
                ))}
            </ul>
        </div>
    );
};

const normalizeDraftProfile = (profile) => ({
    loaded: true,
    favoritePlayerIds: normalizeIdList(profile?.favoritePlayerIds),
    playerNotes: profile?.playerNotes || {},
    playerTiers: profile?.playerTiers || {},
    budgetPlan: profile?.budgetPlan || {},
});

const normalizeIdList = (ids = []) => [...new Set((ids || []).filter(Boolean))];

const pickRandomItem = (items = []) => {
    if (!items.length) return null;
    return items[Math.floor(Math.random() * items.length)];
};

const formatMemberLabel = (memberId = '') => {
    if (!memberId) return 'Unknown member';
    const value = String(memberId);
    const emailName = value.includes('@') ? value.split('@')[0] : value;
    return emailName.replace(/[._-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
};

const formatTeamOwnerLabel = (ownerId, memberIds = []) => {
    if (!ownerId || String(ownerId).startsWith('manual-')) return 'Unassigned';
    return memberIds.includes(ownerId) ? formatMemberLabel(ownerId) : 'Manual team';
};

const formatDraftChatTime = (value) => {
    if (!value) return '';
    return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const getDraftFavoriteIds = (draftProfile, userTeam) => {
    if (draftProfile?.loaded) {
        return normalizeIdList(draftProfile.favoritePlayerIds);
    }

    return normalizeIdList(userTeam?.favoritePlayerIds);
};

const getPlayerNote = (draftProfile = EMPTY_DRAFT_PROFILE, playerId) => {
    const note = playerId ? draftProfile.playerNotes?.[playerId] : '';
    return typeof note === 'string' ? note.trim() : '';
};

const getPlayerTier = (draftProfile = EMPTY_DRAFT_PROFILE, playerId) => {
    const tier = playerId ? Number(draftProfile.playerTiers?.[playerId]) : 0;
    return Number.isFinite(tier) && tier > 0 ? tier : 0;
};

const getBudgetPlanRows = (draftProfile = EMPTY_DRAFT_PROFILE) => {
    const plan = draftProfile.budgetPlan || {};
    return POSITION_PLAN_ORDER
        .map((position) => [position, Number(plan[position]) || 0])
        .filter(([, amount]) => amount > 0);
};

const getRosterTotal = (settings = {}) => Object.values(settings || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);

const getPositionCounts = (rosterSettings, roster) => {
    const counts = {};
    for (const pos in rosterSettings) {
        const displayPosition = pos.toUpperCase();
        const playerPosition = displayPosition === 'DEF' ? 'DST' : displayPosition;
        counts[displayPosition] = (roster || []).filter(spot =>
            spot.position === displayPosition ||
            spot.position === playerPosition ||
            spot.player?.position === playerPosition
        ).length;
    }
    return counts;
};

export default DraftScreen;
