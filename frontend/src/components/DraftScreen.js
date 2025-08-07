// src/components/DraftScreen.js

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
    <div style={{
      position: 'fixed', top: '20px', right: '20px',
      backgroundColor: '#28a745', color: 'white',
      padding: '15px', borderRadius: '5px', zIndex: 1000,
      boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
      transition: 'opacity 0.5s ease-in-out', opacity: show ? 1 : 0
    }}>
      {message}
      <button onClick={onClose} style={{
        marginLeft: '15px', border: 'none', background: 'none',
        color: 'white', fontWeight: 'bold', cursor: 'pointer',
        fontSize: '16px'
      }}>&times;</button>
    </div>
  );
};

const DraftScreen = () => {
  const { leagueId } = useParams();
  const { user } = useAuth();
  const [league, setLeague] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ show: false, message: '' });

  // Local bid state
  const [myCurrentBid, setMyCurrentBid] = useState(0);
  const [hasSubmittedFinalBid, setHasSubmittedFinalBid] = useState(false);

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

        connection.on('draftStateUpdate', updatedLeague => {
          if (updatedLeague.id === leagueId) {
            setLeague(updatedLeague);
          }
        });
        connection.on('beerRequestReceived', requestingTeamName => {
          setToast({ show: true, message: `${requestingTeamName} wants a beer!` });
          setTimeout(() => setToast({ show: false, message: '' }), 5000);
        });

        await connection.start();
      } catch (e) {
        console.error("SignalR Connection Failed: ", e);
      }
    };
    setupSignalR();
    return () => connection && connection.stop();
  }, [leagueId]);

  if (loading) return <div>Loading Draft Room...</div>;
  if (!league) return <div>Could not load league.</div>;

  const isLobbyPhase = ['created', 'lobby'].includes(league.status.toLowerCase());

  return (
    <div style={{ padding: '20px' }}>
      <ToastNotification
        message={toast.message}
        show={toast.show}
        onClose={() => setToast({ show: false, message: '' })}
      />
      <h2>Drafting in {league.name}</h2>
      <p>League Status: <strong>{league.status.toUpperCase()}</strong></p>

      {isLobbyPhase
        ? <LobbyView league={league} user={user} leagueId={leagueId} />
        : <DraftingView
            league={league}
            user={user}
            leagueId={leagueId}
            myCurrentBid={myCurrentBid}
            setMyCurrentBid={setMyCurrentBid}
            hasSubmittedFinalBid={hasSubmittedFinalBid}
            setHasSubmittedFinalBid={setHasSubmittedFinalBid}
          />
      }
    </div>
  );
};

// ----------------- LOBBY VIEW -----------------
const LobbyView = ({ league, user, leagueId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortPosition, setSortPosition] = useState('All Positions');
  const userTeam = league.teams.find(t => t.ownerId === user.userId);
  const userFavorites = userTeam?.favoritePlayerIds || [];
  const allPlayers = league.initialPlayerPool || [];

  const favoritePlayers = allPlayers.filter(p =>
    userFavorites.includes(p.id) &&
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (sortPosition === 'All Positions' || p.position === sortPosition)
  );
  const availablePlayers = allPlayers.filter(p =>
    !userFavorites.includes(p.id) &&
    !p.isDrafted &&
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (sortPosition === 'All Positions' || p.position === sortPosition)
  );

  const isAdmin = league.adminId === user.userId;
  const nonAdmins = league.members.filter(id => id !== league.adminId);
  const allNonAdminsReady = nonAdmins.every(id => league.readyMembers.includes(id));

  const handleReady = async () => {
    const isReady = league.readyMembers.includes(user.userId);
    try {
      await axios.post(`${API_BASE_URL}/leagues/${leagueId}/ready`, {
        userId: user.userId, isReady: !isReady
      });
    } catch (e) {
      alert(`Ready toggle failed: ${e.response?.data || e.message}`);
    }
  };
  const handleStart = async () => {
    try {
      await axios.post(`${API_BASE_URL}/leagues/${leagueId}/startDraft`, { adminId: user.userId });
    } catch (e) {
      alert(`Start draft failed: ${e.response?.data || e.message}`);
    }
  };
  const handleToggleFav = async pid => {
    const isFav = userFavorites.includes(pid);
    const newFavs = isFav
      ? userFavorites.filter(id => id !== pid)
      : [...userFavorites, pid];
    try {
      await axios.post(`${API_BASE_URL}/leagues/${leagueId}/favorites`, {
        userId: user.userId, playerIds: newFavs
      });
    } catch {
      alert('Failed to update favorites.');
    }
  };

  return (
    <>
      <div className="card">
        {isAdmin
          ? <button
              onClick={handleStart}
              disabled={!nonAdmins.length || !allNonAdminsReady}
            >
              Start Draft ({league.readyMembers.length}/{nonAdmins.length} Ready)
            </button>
          : <button onClick={handleReady}>
              {league.readyMembers.includes(user.userId) ? "Ready!" : "I'm Ready"}
            </button>
        }
      </div>
      <div className="card" style={{ marginTop: '20px' }}>
        <h3>Your Favorited Players ({favoritePlayers.length})</h3>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <input
            placeholder="Search..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <select
            value={sortPosition}
            onChange={e => setSortPosition(e.target.value)}
          >
            <option>All Positions</option>
            <option>QB</option><option>RB</option><option>WR</option>
            <option>TE</option><option>K</option><option>DEF</option>
          </select>
        </div>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {favoritePlayers.map(p => (
            <li key={p.id} className="player-list-item">
              <span>{p.name} ({p.position}) - {p.team}</span>
              <button onClick={() => handleToggleFav(p.id)}>X</button>
            </li>
          ))}
        </ul>
        <h3 style={{ marginTop: '20px' }}>
          Available Players ({availablePlayers.length})
        </h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {availablePlayers.map(p => (
            <li key={p.id} className="player-list-item">
              <span>{p.name} ({p.position}) - {p.team}</span>
              <button onClick={() => handleToggleFav(p.id)}>☆</button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
};

// ----------------- DRAFTING VIEW -----------------
const DraftingView = ({
  league, user, leagueId,
  myCurrentBid, setMyCurrentBid,
  hasSubmittedFinalBid, setHasSubmittedFinalBid
}) => {
  const isIntermission = league.currentAuction?.status === 'intermission';

  useEffect(() => {
    let poll;
    if (!isIntermission) {
      poll = setInterval(() => {
        axios.post(`${API_BASE_URL}/leagues/${leagueId}/endBidding`)
          .catch(err => console.error(err));
      }, 3000);
    }
    return () => clearInterval(poll);
  }, [isIntermission, leagueId]);

  return (
    <>
      <div className="card">
        <AdminControls league={league} user={user} leagueId={leagueId} />
      </div>
      {isIntermission
        ? <IntermissionView league={league} />
        : <AuctionView
            league={league} user={user}
            leagueId={leagueId}
            myCurrentBid={myCurrentBid}
            setMyCurrentBid={setMyCurrentBid}
            hasSubmittedFinalBid={hasSubmittedFinalBid}
            setHasSubmittedFinalBid={setHasSubmittedFinalBid}
          />
      }
      <div className="card" style={{ marginTop: '20px' }}>
        <h3>League Teams:</h3>
        <TeamListViewer league={league} user={user} leagueId={leagueId} />
      </div>
    </>
  );
};

// ----------------- ADMIN CONTROLS -----------------
const AdminControls = ({ league, user, leagueId }) => {
  const [showBeerBitchModal, setShowBeerBitchModal] = useState(false);
  const [showNominateModal, setShowNominateModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);

  const handlePause = async () => {
    await axios.post(`${API_BASE_URL}/leagues/${leagueId}/pause`, { adminId: user.userId });
  };
  const handleSkip = async () => {
    await axios.post(`${API_BASE_URL}/leagues/${leagueId}/skip`, { adminId: user.userId });
  };

  return (
    <>
      <button onClick={handlePause}>Pause/Resume</button>
      <button onClick={handleSkip}>Skip Player</button>
      <button onClick={() => setShowNominateModal(true)} disabled={!league.currentAuction.auctionTimer.isPaused}>
        Nominate Player
      </button>
      <button onClick={() => setShowManageModal(true)} disabled={!league.currentAuction.auctionTimer.isPaused}>
        Manage Members
      </button>
      <button onClick={() => setShowBeerBitchModal(true)} disabled={!league.currentAuction.auctionTimer.isPaused}>
        Beer Duty
      </button>

      {showBeerBitchModal && <BeerBitchModal league={league} onClose={() => setShowBeerBitchModal(false)} />}
      {showNominateModal && <NominatePlayerModal league={league} onClose={() => setShowNominateModal(false)} />}
      {showManageModal && <ManageMembersModal league={league} onClose={() => setShowManageModal(false)} />}
    </>
  );
};

// ----------------- AUCTION VIEW -----------------
const AuctionView = ({
  league, user, leagueId,
  myCurrentBid, setMyCurrentBid,
  hasSubmittedFinalBid, setHasSubmittedFinalBid
}) => {
  const [timer, setTimer] = useState(0);
  const userTeam = league.teams.find(t => t.ownerId === user.userId);

  // Countdown logic
  useEffect(() => {
    const auctionTimer = league.currentAuction.auctionTimer;
    let intervalId;
    if (auctionTimer.isPaused) {
      setTimer(auctionTimer.timeRemainingOnPause);
    } else {
      const tick = () => {
        const now = Date.now();
        const end = new Date(auctionTimer.endTime).getTime();
        setTimer(Math.max(0, Math.floor((end - now) / 1000)));
      };
      tick();
      intervalId = setInterval(tick, 1000);
    }
    return () => clearInterval(intervalId);
  }, [league.currentAuction.auctionTimer]);

  // Reset on new player
  useEffect(() => {
    setMyCurrentBid(0);
    setHasSubmittedFinalBid(false);
  }, [league.currentAuction.playerId]);

  // Final-bid-only submission
  useEffect(() => {
    if (
      league.currentAuction.status === 'awaiting_final_bids' &&
      timer === 0 &&
      myCurrentBid > 0 &&
      !hasSubmittedFinalBid
    ) {
      const timeout = setTimeout(() => {
        axios.post(
          `${API_BASE_URL}/leagues/${leagueId}/submit-bid`,
          { teamId: userTeam.id, bidAmount: myCurrentBid }
        )
        .then(() => setHasSubmittedFinalBid(true))
        .catch(err => console.error(err));
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [league.currentAuction.status, timer, myCurrentBid, hasSubmittedFinalBid, leagueId, userTeam]);

  const player = league.draftPlayers.find(p => p.id === league.currentAuction.playerId);
  const isAwaiting = league.currentAuction.status === 'awaiting_final_bids';

  if (!player) return <div className="card">Waiting for player nomination...</div>;

  return (
    <div className="card" style={{ marginTop: '20px' }}>
      <h3>Player:</h3>
      <h2>{player.name} - {player.position}</h2>
      {isAwaiting
        ? <p style={{ color:'blue', fontWeight:'bold' }}>Awaiting Results…</p>
        : <p style={{ color:'red', fontWeight:'bold' }}>Ends In: {timer}s</p>
      }

      {!isAwaiting && myCurrentBid > 0 && (
        <p style={{ color:'green' }}>Your bid: ${myCurrentBid}</p>
      )}

      <div style={{ display:'flex', gap: '5px', marginTop:'10px', justifyContent:'center' }}>
        <button onClick={() => setMyCurrentBid(prev => prev - 1)} disabled={isAwaiting}>-</button>
        <input
          type="number"
          value={myCurrentBid}
          onChange={e => setMyCurrentBid(Math.max(0, parseInt(e.target.value,10)||0))}
          disabled={isAwaiting}
          style={{ width:'60px', textAlign:'center' }}
        />
        <button onClick={() => setMyCurrentBid(prev => prev + 1)} disabled={isAwaiting}>+</button>
        <button
          onClick={() => setMyCurrentBid(0)}
          disabled={isAwaiting}
          style={{ backgroundColor:'#dc3545', color:'white' }}
        >Reset</button>
      </div>
    </div>
  );
};

// ----------------- INTERMISSION VIEW -----------------
const IntermissionView = ({ league }) => {
  const [timer, setTimer] = useState(0);
  const lastPick = league.draftLog.slice(-1)[0];
  useEffect(() => {
    const auctionTimer = league.currentAuction.auctionTimer;
    let intervalId;
    if (auctionTimer.isPaused) {
      setTimer(auctionTimer.timeRemainingOnPause);
    } else {
      const tick = () => {
        const now = Date.now();
        const end = new Date(auctionTimer.endTime).getTime();
        setTimer(Math.max(0, Math.floor((end - now) / 1000)));
      };
      tick();
      intervalId = setInterval(tick, 1000);
    }
    return () => clearInterval(intervalId);
  }, [league.currentAuction.auctionTimer]);

  if (!lastPick) return <div className="card">Preparing next player…</div>;

  const winner = league.teams.find(t => t.id === lastPick.winningTeamId);

  return (
    <div className="card" style={{ backgroundColor:'#e6ffed', marginTop:'20px' }}>
      <h2>Intermission!</h2>
      <p>Next in: <strong>{timer}s</strong></p>
      <h4>Last Pick:</h4>
      <p>
        {lastPick.player.name} drafted by <strong>{winner?.name}</strong> for <strong>${lastPick.winningBid}</strong>
      </p>
    </div>
  );
};

// ----------------- TEAM LIST -----------------
const TeamListViewer = ({ league, user, leagueId }) => {
  const [cooldown, setCooldown] = useState(0);
  const userTeam = league.teams.find(t => t.ownerId === user.userId);
  useEffect(() => {
    if (cooldown > 0) {
      const id = setTimeout(() => setCooldown(c => c - 1), 1000);
      return () => clearTimeout(id);
    }
  }, [cooldown]);

  const totalSpots = Object.values(league.rosterSettings).reduce((a,b) => a+b,0);

  const handleBeer = async () => {
    setCooldown(300);
    await axios.post(`${API_BASE_URL}/leagues/${leagueId}/request-beer`, { requestingTeamId: userTeam.id });
  };

  return (
    <div>
      {league.teams.map(team => (
        <div key={team.id} style={{ padding:'5px 0', borderBottom:'1px solid #eee' }}>
          {team.ownerId === user.userId
            ? <>
                <h4>{team.name} (You)</h4>
                <p>
                  Budget: ${team.budget} | Roster: {team.roster.length}/{totalSpots}
                </p>
                {league.beerBitchTeamId && league.beerBitchTeamId !== team.id && (
                  <button onClick={handleBeer} disabled={cooldown > 0}>
                    {cooldown>0 ? `Request Beer (${cooldown}s)` : 'Request a Beer'}
                  </button>
                )}
              </>
            : <>
                <strong>{team.name}</strong> – Budget: ${team.budget}
              </>
          }
        </div>
      ))}
    </div>
  );
};

// ----------------- MODALS -----------------
const NominatePlayerModal = ({ league, onClose }) => {
  const [search, setSearch] = useState('');
  const candidates = league.initialPlayerPool.filter(p => !p.isDrafted)
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>Nominate Player</h3>
        <input
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <ul style={{ listStyle:'none', padding:0, maxHeight:'300px', overflowY:'auto' }}>
          {candidates.map(p => (
            <li key={p.id} className="player-list-item">
              <span>{p.name}</span>
              <button onClick={() => {
                axios.post(`${API_BASE_URL}/leagues/${league.id}/nominate`, {
                  adminId: league.adminId, playerId: p.id
                });
                onClose();
              }}>Nominate</button>
            </li>
          ))}
        </ul>
        <button className="cancel-button" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
};

const ManageMembersModal = ({ league, onClose }) => {
  const [budgets, setBudgets] = useState(
    Object.fromEntries(league.teams.map(t => [t.id, t.budget]))
  );
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>Manage Members</h3>
        <ul style={{ listStyle:'none', padding:0, maxHeight:'300px', overflowY:'auto' }}>
          {league.teams.map(t => (
            <li key={t.id} style={{ padding:'10px', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span>{t.name}</span>
              <input
                type="number"
                value={budgets[t.id]}
                onChange={e => setBudgets(bs => ({ ...bs, [t.id]: parseInt(e.target.value,10)||0 }))}
                style={{ width:'60px' }}
              />
              <button onClick={() => {
                axios.post(`${API_BASE_URL}/leagues/${league.id}/adjust-budget`, {
                  adminId: league.adminId, teamId: t.id, newBudget: budgets[t.id]
                });
              }}>Set</button>
            </li>
          ))}
        </ul>
        <button className="cancel-button" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
};

// A simple BeerBitch modal for completeness
const BeerBitchModal = ({ league, onClose }) => (
  <div className="modal-overlay">
    <div className="modal-content">
      <h3>Assign Beer Duty</h3>
      <ul style={{ listStyle:'none', padding:0 }}>
        {league.teams.map(t => (
          <li key={t.id} style={{ display:'flex', justifyContent:'space-between', padding:'10px', borderBottom:'1px solid #eee' }}>
            <span>{t.name}</span>
            <button onClick={() => {
              axios.post(`${API_BASE_URL}/leagues/${league.id}/beer-bitch`, {
                adminId: league.adminId, teamId: t.id
              });
              onClose();
            }}>Assign</button>
          </li>
        ))}
      </ul>
      <button className="cancel-button" onClick={onClose}>Cancel</button>
    </div>
  </div>
);

export default DraftScreen;
