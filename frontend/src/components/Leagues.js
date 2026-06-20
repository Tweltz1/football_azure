import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { HubConnectionBuilder } from '@microsoft/signalr';
import { getSignalRInfo } from '../api';
import { buildByeWeekAnalyzer, buildCommissionerHealth, buildDraftRecap } from '../data/strategyUtils';
import '../App.css';
import './LeagueTools.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

const Leagues = ({ userId }) => {
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showAnalyzerModal, setShowAnalyzerModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [currentLeague, setCurrentLeague] = useState(null);
  const [analyzerLeague, setAnalyzerLeague] = useState(null);
  const [joinLeagueName, setJoinLeagueName] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinInviteId, setJoinInviteId] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [rosterSettings, setRosterSettings] = useState({});
  const [draftTimers, setDraftTimers] = useState({});

  const fetchLeagues = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/GetLeagues?userId=${userId}`);
      setLeagues(response.data);
    } catch (error) {
      console.error('Error fetching leagues:', error);
      alert('Failed to fetch leagues.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchLeagues();
  }, [fetchLeagues]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteId = params.get('join');
    if (inviteId) {
      setJoinInviteId(inviteId);
      setShowJoinModal(true);
    }
  }, []);

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
          setLeagues(currentLeagues =>
            currentLeagues.map(l => l.id === updatedLeague.id ? updatedLeague : l)
          );
        });

        await connection.start();
      } catch (e) {
        console.error('SignalR Connection Failed on Leagues page: ', e);
      }
    };

    setupSignalR();
    return () => {
      if (connection) connection.stop();
    };
  }, []);

  const commissionerLeagues = useMemo(() => leagues.filter((league) => league.adminId === userId), [leagues, userId]);

  const handleDelete = async (leagueId) => {
    if (window.confirm('Are you sure you want to delete this league?')) {
      try {
        await axios.delete(`${API_BASE_URL}/leagues/${leagueId}`, { data: { adminId: userId } });
        alert('League deleted successfully!');
        fetchLeagues();
      } catch (error) {
        alert(`Failed to delete league: ${error.response?.data || error.message}`);
      }
    }
  };

  const handleEditTeamName = async () => {
    try {
      await axios.post(`${API_BASE_URL}/leagues/${currentLeague.id}/teams`, {
        userId,
        newTeamName
      });
      alert('Team name updated successfully!');
      setShowEditModal(false);
      fetchLeagues();
    } catch (error) {
      alert(`Failed to update team name: ${error.response?.data || error.message}`);
    }
  };

  const handleUpdateRosterSettings = async () => {
    try {
      await axios.post(`${API_BASE_URL}/leagues/${currentLeague.id}/settings`, {
        adminId: userId,
        rosterSettings,
        draftTimers
      });
      alert('Roster settings updated successfully!');
      setShowRosterModal(false);
      fetchLeagues();
    } catch (error) {
      alert(`Failed to update settings: ${error.response?.data || error.message}`);
    }
  };

  const handleJoinLeague = async () => {
    try {
      const response = await axios.post(`${API_BASE_URL}/JoinLeague`, {
        userId,
        leagueId: joinInviteId || undefined,
        leagueName: joinInviteId ? undefined : joinLeagueName,
        password: joinInviteId ? undefined : joinPassword
      });
      alert(`Successfully joined league '${response.data.name}'!`);
      setShowJoinModal(false);
      setJoinInviteId('');
      setJoinLeagueName('');
      setJoinPassword('');
      window.history.replaceState({}, '', '/leagues');
      fetchLeagues();
    } catch (error) {
      alert(`Failed to join league: ${error.response?.data || error.message}`);
    }
  };

  const handleCopyInvite = async (league) => {
    const inviteUrl = `${window.location.origin}/leagues?join=${league.id}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteMessage(`Invite copied for ${league.name}`);
    } catch (error) {
      window.prompt('Copy this invite link:', inviteUrl);
      setInviteMessage(`Invite ready for ${league.name}`);
    }
    setTimeout(() => setInviteMessage(''), 3000);
  };

  const openAnalyzer = (league) => {
    setAnalyzerLeague(league);
    setShowAnalyzerModal(true);
  };

  if (loading) {
    return <div className="loading-panel">Loading leagues...</div>;
  }

  return (
    <div className="page-shell league-page">
      <section className="page-hero">
        <p className="page-kicker">League control</p>
        <h1>My Leagues</h1>
        <p>Jump into a live draft room, share invites, and inspect commissioner health before the auction starts.</p>
        <div className="scoreboard-strip">
          <span>{leagues.length} active league{leagues.length === 1 ? '' : 's'}</span>
          <span>{commissionerLeagues.length} commissioner table{commissionerLeagues.length === 1 ? '' : 's'}</span>
          {inviteMessage && <span>{inviteMessage}</span>}
        </div>
      </section>

      {commissionerLeagues.length > 0 && (
        <section className="card commissioner-dashboard">
          <div className="player-board-heading">
            <div>
              <p className="section-kicker">Commissioner dashboard</p>
              <h2>League Health</h2>
            </div>
            <div className="board-count">{commissionerLeagues.length} managed</div>
          </div>
          <div className="commissioner-grid">
            {commissionerLeagues.map((league) => (
              <CommissionerCard key={league.id} league={league} userId={userId} onCopyInvite={handleCopyInvite} onAnalyze={openAnalyzer} />
            ))}
          </div>
        </section>
      )}

      <div className="league-toolbar">
        <div>
          <p className="section-kicker">Draft rooms</p>
          <h2>Your Active Leagues</h2>
        </div>
        <div className="button-group">
          <Link to="/create-league">
            <button className="create-button">Create League</button>
          </Link>
          <button onClick={() => setShowJoinModal(true)} className="join-button">Join League</button>
        </div>
      </div>

      {leagues.length > 0 ? (
        <table className="leagues-table">
          <thead>
            <tr>
              <th>League</th>
              <th>Role</th>
              <th>Teams</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {leagues.map(league => {
              const teamName = league.teams.find(t => t.ownerId === userId)?.name || 'N/A';
              return (
                <tr key={league.id}>
                  <td>
                    <strong>{league.name}</strong>
                    <br />
                    <span>Your Team: {teamName} </span>
                    <button className="edit-profile-link" onClick={() => {
                      setShowEditModal(true);
                      setCurrentLeague(league);
                      setNewTeamName(teamName === 'N/A' ? '' : teamName);
                    }}>Edit Team</button>
                  </td>
                  <td>{league.adminId === userId ? 'Commissioner' : 'Member'}</td>
                  <td>{league.members.length}/12</td>
                  <td className="actions-cell-flex">
                    <Link to={`/draft/${league.id}`}>
                      <button className="view-details-button">Enter Draft Room</button>
                    </Link>
                    <Link to={`/draft/${league.id}/tv`} target="_blank" rel="noreferrer">
                      <button className="edit-roster-button">TV Board</button>
                    </Link>
                    <button type="button" className="edit-roster-button" onClick={() => openAnalyzer(league)}>Analyze</button>
                    {league.adminId === userId && (
                      <>
                        <button type="button" onClick={() => handleCopyInvite(league)} className="join-button">Copy Invite</button>
                        <button
                          onClick={() => {
                            setShowRosterModal(true);
                            setCurrentLeague(league);
                            setRosterSettings(league.rosterSettings || {});
                            setDraftTimers(league.draftTimers || {});
                          }}
                          className="edit-roster-button"
                        >
                          Edit Roster
                        </button>
                        <button onClick={() => handleDelete(league.id)} className="delete-button">Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <h3>No leagues yet</h3>
          <p>Create one or join an existing league to start building your auction board.</p>
        </div>
      )}

      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Edit Team Name</h3>
            <label>
              New Team Name
              <input type="text" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} />
            </label>
            <div className="form-actions">
              <button onClick={handleEditTeamName}>Save</button>
              <button onClick={() => setShowEditModal(false)} className="cancel-button">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showAnalyzerModal && analyzerLeague && (
        <LeagueAnalyzerModal league={analyzerLeague} onClose={() => setShowAnalyzerModal(false)} />
      )}

      {showRosterModal && currentLeague && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Edit Roster Settings for {currentLeague.name}</h3>
            <div className="settings-grid">
              <label>QB<input type="number" value={rosterSettings.qb || 0} onChange={(e) => setRosterSettings({...rosterSettings, qb: parseInt(e.target.value)})}/></label>
              <label>RB<input type="number" value={rosterSettings.rb || 0} onChange={(e) => setRosterSettings({...rosterSettings, rb: parseInt(e.target.value)})}/></label>
              <label>WR<input type="number" value={rosterSettings.wr || 0} onChange={(e) => setRosterSettings({...rosterSettings, wr: parseInt(e.target.value)})}/></label>
              <label>TE<input type="number" value={rosterSettings.te || 0} onChange={(e) => setRosterSettings({...rosterSettings, te: parseInt(e.target.value)})}/></label>
              <label>DEF<input type="number" value={rosterSettings.def || 0} onChange={(e) => setRosterSettings({...rosterSettings, def: parseInt(e.target.value)})}/></label>
              <label>K<input type="number" value={rosterSettings.k || 0} onChange={(e) => setRosterSettings({...rosterSettings, k: parseInt(e.target.value)})}/></label>
              <label>FLEX<input type="number" value={rosterSettings.flex || 0} onChange={(e) => setRosterSettings({...rosterSettings, flex: parseInt(e.target.value)})}/></label>
              <label>SUPERFLEX<input type="number" value={rosterSettings.superFlex || 0} onChange={(e) => setRosterSettings({...rosterSettings, superFlex: parseInt(e.target.value)})}/></label>
              <label>BENCH<input type="number" value={rosterSettings.bench || 0} onChange={(e) => setRosterSettings({...rosterSettings, bench: parseInt(e.target.value)})}/></label>
            </div>

            <div className="divider" />
            <div className="settings-grid">
              <label>Bid Timer<input type="number" value={draftTimers.bidTimer || 0} onChange={(e) => setDraftTimers({...draftTimers, bidTimer: parseInt(e.target.value)})}/></label>
              <label>Intermission<input type="number" value={draftTimers.intermissionTimer || 0} onChange={(e) => setDraftTimers({...draftTimers, intermissionTimer: parseInt(e.target.value)})}/></label>
              <label>Re-bid Timer<input type="number" value={draftTimers.rebidTimer || 0} onChange={(e) => setDraftTimers({...draftTimers, rebidTimer: parseInt(e.target.value)})}/></label>
            </div>

            <div className="form-actions">
              <button onClick={handleUpdateRosterSettings}>Save Settings</button>
              <button onClick={() => setShowRosterModal(false)} className="cancel-button">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showJoinModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>{joinInviteId ? 'Join League Invite' : 'Join a League'}</h3>
            {joinInviteId ? (
              <div className="league-invite-note">This invite link will add you to the league automatically.</div>
            ) : (
              <>
                <label>
                  League Name
                  <input type="text" value={joinLeagueName} onChange={(e) => setJoinLeagueName(e.target.value)} required />
                </label>
                <label>
                  Password
                  <input type="password" value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} />
                </label>
              </>
            )}
            <div className="form-actions">
              <button onClick={handleJoinLeague}>Join League</button>
              <button onClick={() => {
                setShowJoinModal(false);
                setJoinInviteId('');
                window.history.replaceState({}, '', '/leagues');
              }} className="cancel-button">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const CommissionerCard = ({ league, userId, onCopyInvite, onAnalyze }) => {
  const health = buildCommissionerHealth(league, userId);
  return (
    <div className="commissioner-card">
      <h3>{league.name}</h3>
      <div className="health-row"><span>Status</span><strong>{health.status}</strong></div>
      <div className="health-row"><span>Ready</span><strong>{health.readyCount}/{health.memberCount}</strong></div>
      <div className="health-row"><span>Timer</span><strong>{health.timerLabel}</strong></div>
      {health.needsAttention && <span className="health-warning">Waiting on ready checks</span>}
      <div className="form-actions">
        <button type="button" className="join-button" onClick={() => onCopyInvite(league)}>Copy Invite</button>
        <button type="button" className="edit-roster-button" onClick={() => onAnalyze(league)}>Analyze</button>
      </div>
    </div>
  );
};

const LeagueAnalyzerModal = ({ league, onClose }) => {
  const byeRows = buildByeWeekAnalyzer(league);
  const recap = buildDraftRecap(league);
  const hasDraftLog = recap.picks > 0;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="player-board-heading">
          <div>
            <p className="section-kicker">League analyzer</p>
            <h3>{league.name}</h3>
          </div>
          <button type="button" className="cancel-button" onClick={onClose}>Close</button>
        </div>

        <section className="league-analyzer-panel">
          <h3>Bye-Week Conflicts</h3>
          <ul className="analyzer-list">
            {byeRows.map((row) => (
              <li key={row.teamId} className="analyzer-team-row">
                <strong>{row.teamName}</strong>
                <div>
                  {Object.keys(row.byeCounts).length > 0 ? Object.entries(row.byeCounts).map(([week, count]) => (
                    <span key={week} className={`conflict-pill ${count >= 3 ? 'warn' : ''}`}>Week {week}: {count}</span>
                  )) : <span className="conflict-pill">No byes yet</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="league-analyzer-panel">
          <h3>Draft Recap</h3>
          {hasDraftLog ? (
            <div className="recap-grid">
              <RecapCard title="Best Value" pick={recap.bestValue} detail={(pick) => `$${pick.winningBid} vs est. $${pick.estimate}`} />
              <RecapCard title="Biggest Overpay" pick={recap.biggestOverpay} detail={(pick) => `$${pick.winningBid} vs est. $${pick.estimate}`} />
              <RecapCard title="Bidding War" pick={recap.biggestWar} detail={(pick) => `${pick.bidCount} bids`} />
            </div>
          ) : (
            <div className="empty-state">Draft recap appears once players have been awarded.</div>
          )}
        </section>
      </div>
    </div>
  );
};

const RecapCard = ({ title, pick, detail }) => (
  <div className="recap-card">
    <p className="section-kicker">{title}</p>
    {pick ? (
      <>
        <h3>{pick.player?.name || 'Unknown Player'}</h3>
        <div className="recap-row"><span>Bid</span><strong>${pick.winningBid}</strong></div>
        <div className="recap-row"><span>Context</span><strong>{detail(pick)}</strong></div>
      </>
    ) : (
      <p>No data yet.</p>
    )}
  </div>
);

export default Leagues;
