import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { createDraftConnection } from '../realtime';
import { API_BASE_URL } from '../api';
import { isOfflineLeague } from '../offline/storage';
import { discardDeviceCopy } from '../offline/offlineSync';
import { buildByeWeekAnalyzer, buildCommissionerHealth, buildDraftRecap } from '../data/strategyUtils';
import { isDraftLive, leagueStatusKey, leagueStatusLabel } from '../data/leagueLabels';
import BiddingStyleField from '../whiteboard/BiddingStyleField';
import { biddingStyleLabel, isWhiteboardLeague, normalizeBiddingMode } from '../whiteboard/biddingStyle';
import '../whiteboard/whiteboard.css';
import '../App.css';
import './LeagueTools.css';


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
  const [invitePreview, setInvitePreview] = useState(null);
  const [invitePreviewError, setInvitePreviewError] = useState('');
  const [rosterSettings, setRosterSettings] = useState({});
  const [draftTimers, setDraftTimers] = useState({});
  const [draftMode, setDraftMode] = useState('auction');
  const [biddingMode, setBiddingMode] = useState('standard');

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
      axios.get(`${API_BASE_URL}/invite/${encodeURIComponent(inviteId)}`)
        .then((response) => setInvitePreview(response.data))
        .catch((error) => setInvitePreviewError(error.response?.data || 'This invite link could not be checked.'));
    }
  }, []);

  const closeJoinModal = () => {
    setShowJoinModal(false);
    setJoinInviteId('');
    setInvitePreview(null);
    setInvitePreviewError('');
    window.history.replaceState({}, '', '/leagues');
  };

  const leagueIdsKey = useMemo(() => leagues.map((league) => league.id).sort().join(','), [leagues]);

  useEffect(() => {
    if (!leagueIdsKey) return undefined;

    const connection = createDraftConnection({ leagueIds: leagueIdsKey.split(','), userId });
    connection.on('draftStateUpdate', (updatedLeague) => {
      setLeagues(currentLeagues =>
        currentLeagues.map(l => l.id === updatedLeague.id ? updatedLeague : l)
      );
    });
    connection.start().catch((e) => {
      console.error('Live connection failed on Leagues page: ', e);
    });

    return () => connection.stop();
  }, [leagueIdsKey, userId]);

  const commissionerLeagues = useMemo(() => leagues.filter((league) => league.adminId === userId), [leagues, userId]);

  const handleDelete = async (leagueId) => {
    if (window.confirm('Are you sure you want to delete this league?')) {
      // A league saved for an offline draft is removed from this device first, so deleting it works
      // with no internet; the online copy is then deleted too when there's a connection.
      const savedOnDevice = isOfflineLeague(leagueId);
      const offlineNote = 'Removed from this device. The online league is still there; delete it again when you have internet.';
      if (savedOnDevice) discardDeviceCopy(leagueId);
      if (savedOnDevice && navigator.onLine === false) {
        alert(offlineNote);
        fetchLeagues();
        return;
      }
      try {
        await axios.delete(`${API_BASE_URL}/leagues/${leagueId}`, { data: { adminId: userId } });
        alert('League deleted successfully!');
        fetchLeagues();
      } catch (error) {
        if (savedOnDevice && !error.response) {
          alert(offlineNote);
          fetchLeagues();
          return;
        }
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
        draftMode,
        ...(draftMode === 'manual' ? {} : { biddingMode }),
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
      closeJoinModal();
      setJoinLeagueName('');
      setJoinPassword('');
      fetchLeagues();
    } catch (error) {
      alert(`Failed to join league: ${error.response?.data || error.message}`);
    }
  };

  const handleNewSeason = async (league) => {
    const message = `Start a new season for ${league.name}? This draft is saved in Draft History, then every team's roster is cleared and budgets reset to $200 so you can draft again.`;
    if (!window.confirm(message)) return;
    try {
      await axios.post(`${API_BASE_URL}/leagues/${league.id}/new-season`, {});
      alert(`${league.name} is ready for a new draft. Last season's draft is in Draft History.`);
      fetchLeagues();
    } catch (error) {
      alert(`Failed to start a new season: ${error.response?.data || error.message}`);
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

  const openSettings = (league) => {
    setShowRosterModal(true);
    setCurrentLeague(league);
    setRosterSettings(league.rosterSettings || {});
    setDraftTimers(league.draftTimers || {});
    setDraftMode(league.draftMode || 'auction');
    setBiddingMode(normalizeBiddingMode(league.biddingMode));
  };

  const openRename = (league, teamName) => {
    setShowEditModal(true);
    setCurrentLeague(league);
    setNewTeamName(teamName);
  };

  return (
    <div className="page-shell league-page">
      <section className="page-hero">
        <p className="page-kicker">League control</p>
        <h1>My Leagues</h1>
        <p>Tap a league to open its draft room. Commissioners will find invites and settings under Commissioner tools.</p>
        <div className="scoreboard-strip">
          <span>{leagues.length} league{leagues.length === 1 ? '' : 's'}</span>
          {commissionerLeagues.length > 0 && <span>{commissionerLeagues.length} you run</span>}
          {inviteMessage && <span className="invite-message">{inviteMessage}</span>}
        </div>
      </section>

      <div className="league-toolbar">
        <div>
          <p className="section-kicker">Draft rooms</p>
          <h2>Your Leagues</h2>
        </div>
        <div className="button-group">
          <Link to="/create-league">
            <button className="create-button">Create League</button>
          </Link>
          <button onClick={() => setShowJoinModal(true)} className="join-button">Join League</button>
        </div>
      </div>

      {leagues.length > 0 ? (
        <div className="league-card-list">
          {leagues.map((league) => (
            <LeagueCard
              key={league.id}
              league={league}
              userId={userId}
              onRename={openRename}
              onAnalyze={openAnalyzer}
              onCopyInvite={handleCopyInvite}
              onSettings={openSettings}
              onNewSeason={handleNewSeason}
              onDelete={handleDelete}
            />
          ))}
        </div>
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
            <h3>League settings: {currentLeague.name}</h3>
            <p className="section-kicker">Draft mode</p>
            <div className="button-group" role="group" aria-label="Draft mode">
              <button
                type="button"
                className={draftMode === 'auction' ? 'create-button' : 'edit-roster-button'}
                onClick={() => setDraftMode('auction')}
              >
                Auction Draft
              </button>
              <button
                type="button"
                className={draftMode === 'manual' ? 'create-button' : 'edit-roster-button'}
                onClick={() => setDraftMode('manual')}
              >
                Manual Draft
              </button>
            </div>
            {draftMode === 'auction' && <BiddingStyleField value={biddingMode} onChange={setBiddingMode} />}
            <div className="divider" />
            <p className="section-kicker">Roster spots</p>
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
            <p className="section-kicker">Timers (seconds)</p>
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
            <h3>{joinInviteId ? `Join ${invitePreview?.name || 'League'}` : 'Join a League'}</h3>
            {joinInviteId ? (
              <div className="league-invite-note">
                {invitePreviewError && String(invitePreviewError)}
                {!invitePreviewError && !invitePreview && 'Checking your invite...'}
                {invitePreview && invitePreview.isMember && `You're already in ${invitePreview.name}.`}
                {invitePreview && !invitePreview.isMember && invitePreview.status === 'completed' && (
                  `${invitePreview.name} has already finished its draft. Ask the commissioner to start a new season first.`
                )}
                {invitePreview && !invitePreview.isMember && invitePreview.status !== 'completed' && (
                  <>
                    You've been invited to <strong>{invitePreview.name}</strong>
                    {invitePreview.commissionerTeamName ? ` by ${invitePreview.commissionerTeamName}` : ''}.
                    {' '}{invitePreview.memberCount} member{invitePreview.memberCount === 1 ? '' : 's'} so far. No password needed.
                  </>
                )}
              </div>
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
              {invitePreview?.isMember ? (
                <Link to={`/draft/${invitePreview.id}`} onClick={closeJoinModal}>
                  <button type="button">Open Draft Room</button>
                </Link>
              ) : (
                <button
                  onClick={handleJoinLeague}
                  disabled={!!joinInviteId && (!!invitePreviewError || !invitePreview || invitePreview.status === 'completed')}
                >
                  Join League
                </button>
              )}
              <button onClick={closeJoinModal} className="cancel-button">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const draftModeLabel = (league) => {
  if (league.draftMode === 'manual') return 'Manual draft';
  return isWhiteboardLeague(league) ? `Auction, ${biddingStyleLabel(league.biddingMode).toLowerCase()}` : 'Auction';
};

const LeagueCard = ({ league, userId, onRename, onAnalyze, onCopyInvite, onSettings, onNewSeason, onDelete }) => {
  const isAdmin = league.adminId === userId;
  const health = buildCommissionerHealth(league, userId);
  const statusKey = leagueStatusKey(league);
  const teamName = (league.teams || []).find((t) => t.ownerId === userId)?.name || '';
  const finished = statusKey === 'completed';
  const live = isDraftLive(league);
  const memberCount = (league.members || []).length;
  const enterLabel = live ? 'Join Live Draft' : finished ? 'See Draft Results' : 'Enter Draft Room';

  return (
    <article className={`league-card${live ? ' is-live' : ''}`}>
      <header className="league-card-head">
        <div className="league-card-title">
          <h3>{league.name}</h3>
          <p>{draftModeLabel(league)} &middot; {memberCount}/12 teams{isAdmin && <> &middot; You run it</>}</p>
        </div>
        <span className={`league-status league-status-${statusKey || 'none'}`}>{leagueStatusLabel(league)}</span>
      </header>

      <div className="league-card-team">
        <span>Your team</span>
        <strong>{teamName || 'No name yet'}</strong>
        <button type="button" className="link-button" onClick={() => onRename(league, teamName)}>
          {teamName ? 'Rename' : 'Name it'}
        </button>
      </div>

      {health.needsAttention && (
        <span className="health-warning">{health.readyCount} of {health.memberCount} teams ready</span>
      )}

      <Link to={`/draft/${league.id}`} className="league-card-enter">
        <button type="button" className="view-details-button">{enterLabel}</button>
      </Link>

      <div className="league-card-more">
        <Link to={`/draft/${league.id}/tv`} {...(isOfflineLeague(league.id) ? {} : { target: '_blank', rel: 'noreferrer' })}>
          <button type="button" className="join-button">TV Board</button>
        </Link>
        <button type="button" className="join-button" onClick={() => onAnalyze(league)}>Analyze</button>
        {finished && (
          <Link to="/history">
            <button type="button" className="join-button">Past Drafts</button>
          </Link>
        )}
      </div>

      {isAdmin && (
        <details className="league-card-admin">
          <summary>Commissioner tools</summary>
          <p className="league-card-admin-note">Timers: {health.timerLabel}</p>
          <div className="league-card-more">
            <button type="button" className="edit-roster-button" onClick={() => onCopyInvite(league)}>Copy Invite Link</button>
            <button type="button" className="edit-roster-button" onClick={() => onSettings(league)}>League Settings</button>
            {finished && (
              <button type="button" className="create-button" onClick={() => onNewSeason(league)}>Start New Season</button>
            )}
            <button type="button" className="delete-button" onClick={() => onDelete(league.id)}>Delete League</button>
          </div>
        </details>
      )}
    </article>
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
