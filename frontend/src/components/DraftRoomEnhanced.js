import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { HubConnectionBuilder } from '@microsoft/signalr';
import { useAuth } from '../AuthContext';
import { getSignalRInfo } from '../api';
import { subscribeProfileUpdates } from '../profileSync';
import DraftScreen from './DraftScreen';
import './DraftRoomEnhanced.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';
const COLLAPSIBLE_CARD_TITLES = [
  'Draft Controls & Overview',
  'League Teams',
  'League Teams:',
  'Player Lists',
  'Current Player Up for Bid:',
  'Intermission!',
  'Tie Breaker!'
];

const DraftRoomEnhanced = ({ userId }) => {
  const { leagueId } = useParams();
  const { user } = useAuth();
  const resolvedUserId = user?.userId || userId;
  const [league, setLeague] = useState(null);
  const [leagueLoaded, setLeagueLoaded] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [beerRequest, setBeerRequest] = useState(null);
  const [adminNotice, setAdminNotice] = useState(null);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);

  const handleLeagueUpdate = useCallback((updatedLeague) => {
    setLeague(updatedLeague);
    setLeagueLoaded(true);
  }, []);

  const showAdminNotice = useCallback((message) => {
    setAdminNotice({ id: `${Date.now()}-${message}`, message });
  }, []);

  const handleBudgetReviewNotice = useCallback((notice) => {
    showAdminNotice(`${notice?.adminTeamName || 'Commissioner'} opened budget controls.`);
  }, [showAdminNotice]);

  const handleBudgetAdjustmentNotice = useCallback((notice) => {
    showAdminNotice(`${notice?.teamName || 'A team'} budget changed from $${notice?.oldBudget ?? '?'} to $${notice?.newBudget ?? '?'}.`);
  }, [showAdminNotice]);

  useDraftCardCollapsers();
  useDraftPresenceReporter(leagueId, resolvedUserId);
  useSharedDraftConnection({
    leagueId,
    userId: resolvedUserId,
    onLeagueUpdate: handleLeagueUpdate,
    onChatMessage: setChatMessages,
    onBeerRequest: setBeerRequest,
    onBudgetReviewNotice: handleBudgetReviewNotice,
    onBudgetAdjustmentNotice: handleBudgetAdjustmentNotice,
  });

  useEffect(() => {
    if (!adminNotice) return undefined;
    const timer = window.setTimeout(() => setAdminNotice(null), 7000);
    return () => window.clearTimeout(timer);
  }, [adminNotice]);

  useEffect(() => {
    return subscribeProfileUpdates(() => setProfileRefreshKey((current) => current + 1));
  }, []);

  useEffect(() => {
    if (!leagueId) return;

    let isMounted = true;
    const fetchLeague = async () => {
      setLeagueLoaded(false);
      try {
        const response = await axios.get(`${API_BASE_URL}/leagues/${leagueId}/state`);
        if (isMounted) {
          handleLeagueUpdate(response.data);
        }
      } catch (error) {
        console.error('Error loading draft room state:', error);
        if (isMounted) setLeagueLoaded(true);
      }
    };

    fetchLeague();
    return () => {
      isMounted = false;
    };
  }, [leagueId, handleLeagueUpdate]);

  return (
    <div className="draft-room-enhanced">
      <AdminNoticeToast notice={adminNotice} onClose={() => setAdminNotice(null)} />
      <DraftScreen
        key={profileRefreshKey}
        userId={userId}
        sharedLiveState
        league={league}
        leagueLoaded={leagueLoaded}
        beerRequest={beerRequest}
      />
      <DraftRoomCommandPanel
        leagueId={leagueId}
        user={user}
        league={league}
        chatMessages={chatMessages}
        setChatMessages={setChatMessages}
      />
    </div>
  );
};

const AdminNoticeToast = ({ notice, onClose }) => {
  if (!notice) return null;

  return (
    <div className="admin-audit-toast" role="status" aria-live="polite">
      <span>{notice.message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss admin notice">Dismiss</button>
    </div>
  );
};

const DraftRoomCommandPanel = ({ leagueId, user, league, chatMessages, setChatMessages }) => {
  const [chatText, setChatText] = useState('');
  const [quickBidAmount, setQuickBidAmount] = useState(1);
  const [quickBidStatus, setQuickBidStatus] = useState('');
  const chatEndRef = useRef(null);
  const autoTieBidKeyRef = useRef('');

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatMessages]);

  const teams = league?.teams || [];
  const rosterTotal = useMemo(() => getRosterTotal(league?.rosterSettings), [league]);
  const normalizedStatus = String(league?.status || '').toLowerCase();
  const isTieBreaker = normalizedStatus === 'tiebreaker';
  const isFinalTie = isTieBreaker && (league?.tieBreaker?.round || 0) >= 2;
  const tiedUserIds = league?.tieBreaker?.tiedTeamIds || [];
  const currentTeam = user?.userId ? teams.find((team) => team.ownerId === user.userId) : null;
  const quickBidMax = currentTeam ? getMaxBid(league?.rosterSettings, currentTeam) : 0;
  const quickBidMin = isTieBreaker ? (Number(league?.tieBreaker?.tieAmount) || 0) + 1 : 1;
  const userCanBidInPhase = !isTieBreaker || tiedUserIds.includes(user?.userId);
  const isCappedBelowMinimum = Boolean(currentTeam) && quickBidMax < quickBidMin;
  const quickBidDisabled = !user?.userId
    || !league
    || !currentTeam
    || isFinalTie
    || !userCanBidInPhase
    || isCappedBelowMinimum
    || (normalizedStatus !== 'drafting' && normalizedStatus !== 'tiebreaker');
  const activeBid = user?.userId ? league?.activeBids?.[user.userId]?.amount : null;

  useEffect(() => {
    if (!league || !user?.userId || !currentTeam || !isTieBreaker || isFinalTie) return;

    const tieBreaker = league.tieBreaker;
    const tiedUserIds = tieBreaker?.tiedTeamIds || [];
    if (!tieBreaker || !tiedUserIds.includes(user.userId)) return;

    const requiredAmount = (Number(tieBreaker.tieAmount) || 0) + 1;
    if (requiredAmount <= 1) return;

    const bidKey = `${league.id || leagueId}:${league.currentPlayerId}:${tieBreaker.round}:${tieBreaker.tieAmount}:${user.userId}`;
    if (autoTieBidKeyRef.current === bidKey) return;

    const maxBid = getMaxBid(league.rosterSettings, currentTeam);
    if (requiredAmount > maxBid) {
      autoTieBidKeyRef.current = bidKey;
      setQuickBidStatus(`Max bid is $${maxBid}; waiting for admin if no team can go higher.`);
      return;
    }

    const currentAmount = Number(league.activeBids?.[user.userId]?.amount) || 0;
    if (currentAmount >= requiredAmount) {
      autoTieBidKeyRef.current = bidKey;
      return;
    }

    autoTieBidKeyRef.current = bidKey;
    axios.post(`${API_BASE_URL}/leagues/${leagueId}/tiebreaker-bid`, {
      userId: user.userId,
      amount: requiredAmount,
    }).catch((error) => {
      autoTieBidKeyRef.current = '';
      console.warn('Unable to auto-submit default tie-breaker bid:', error);
    });
  }, [league, leagueId, user?.userId, currentTeam, isTieBreaker, isFinalTie]);

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

  const handleQuickBid = async () => {
    if (quickBidDisabled) return;

    const requestedAmount = Math.max(quickBidMin, parseInt(quickBidAmount, 10) || quickBidMin);
    if (requestedAmount > quickBidMax) {
      setQuickBidAmount(quickBidMax);
      alert(`You cannot bid $${requestedAmount}. Your current max bid is $${quickBidMax} because you must keep $1 for each remaining roster spot.`);
      return;
    }

    const endpoint = isTieBreaker ? 'tiebreaker-bid' : 'bid';
    setQuickBidStatus('Sending...');

    try {
      await axios.post(`${API_BASE_URL}/leagues/${leagueId}/${endpoint}`, {
        userId: user.userId,
        amount: requestedAmount,
      });
      setQuickBidStatus(`Bid $${requestedAmount} sent`);
      setTimeout(() => setQuickBidStatus(''), 1800);
    } catch (error) {
      setQuickBidStatus('');
      alert(`Error sending quick bid: ${error.response?.data || error.message}`);
    }
  };

  return (
    <aside className="draft-command-panel" aria-label="Draft room command panel">
      <CollapsiblePanel title="Teams Live" storageKey="draft-panel-teams" defaultOpen>
        <div className="team-presence-list">
          {teams.length === 0 ? (
            <p className="draft-muted">Teams will appear once the league loads.</p>
          ) : teams.map((team) => {
            const filled = (team.roster || []).length;
            const isOnline = (league?.onlineUserIds || []).includes(team.ownerId);
            const isAway = isOnline && (league?.awayUserIds || []).includes(team.ownerId);
            const presenceStatus = !isOnline ? 'offline' : isAway ? 'away' : 'online';
            const presenceLabel = presenceStatus === 'online' ? 'Active' : presenceStatus === 'away' ? 'Away' : 'Offline';
            return (
              <div className="team-presence-row" key={team.id}>
                <span className={`presence-light ${presenceStatus}`} aria-label={presenceLabel} />
                <span className="team-presence-name">{team.name}</span>
                <span className={`team-presence-meta ${presenceStatus}`}>{presenceLabel} | {filled}/{rosterTotal} spots</span>
              </div>
            );
          })}
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel title="Quick Bid" storageKey="draft-panel-quick-bid" defaultOpen>
        <div className="quick-bid-row">
          <label htmlFor="quick-bid-amount">Amount</label>
          <input
            id="quick-bid-amount"
            type="number"
            min={quickBidMin}
            max={quickBidMax || undefined}
            value={quickBidAmount}
            onChange={(event) => setQuickBidAmount(event.target.value)}
            disabled={quickBidDisabled}
          />
          <button type="button" onClick={handleQuickBid} disabled={quickBidDisabled}>
            Bid
          </button>
        </div>
        {currentTeam && <p className="draft-muted">Max bid: ${quickBidMax} | Minimum: ${quickBidMin}</p>}
        {typeof activeBid === 'number' && <p className="draft-muted">Your active bid: ${activeBid}</p>}
        {isCappedBelowMinimum && <p className="draft-muted">You are capped below the minimum bid for this player.</p>}
        {isTieBreaker && !userCanBidInPhase && <p className="draft-muted">Only tied teams can bid in this round.</p>}
        {isFinalTie && <p className="draft-muted">Final tie is locked for admin resolution.</p>}
        {quickBidStatus && <p className="quick-bid-status">{quickBidStatus}</p>}
      </CollapsiblePanel>

      <CollapsiblePanel title="Draft Chat" storageKey="draft-panel-chat" defaultOpen>
        <div className="draft-chat-log" aria-live="polite">
          {chatMessages.length === 0 ? (
            <p className="draft-muted">No messages yet. Say something regrettably confident.</p>
          ) : chatMessages.map((message, index) => (
            <div className="draft-chat-message" key={`${message.sentAt}-${index}`}>
              <div className="draft-chat-meta">
                <strong>{message.teamName || 'Team'}</strong>
                <span>{formatChatTime(message.sentAt)}</span>
              </div>
              <p>{message.message}</p>
            </div>
          ))}
          <div ref={chatEndRef} />
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
      </CollapsiblePanel>
    </aside>
  );
};

const CollapsiblePanel = ({ title, storageKey, defaultOpen = false, children }) => {
  const [isOpen, setIsOpen] = useState(() => {
    const saved = window.localStorage.getItem(storageKey);
    return saved == null ? defaultOpen : saved === 'open';
  });

  const toggle = () => {
    setIsOpen((current) => {
      const next = !current;
      window.localStorage.setItem(storageKey, next ? 'open' : 'closed');
      return next;
    });
  };

  return (
    <section className={`draft-command-section ${isOpen ? 'open' : 'closed'}`}>
      <button type="button" className="draft-command-heading" onClick={toggle}>
        <span>{title}</span>
        <span>{isOpen ? 'Minimize' : 'Expand'}</span>
      </button>
      {isOpen && <div className="draft-command-body">{children}</div>}
    </section>
  );
};

const useSharedDraftConnection = ({
  leagueId,
  userId,
  onLeagueUpdate,
  onChatMessage,
  onBeerRequest,
  onBudgetReviewNotice,
  onBudgetAdjustmentNotice,
}) => {
  useEffect(() => {
    if (!userId || !leagueId) return;

    let connection;
    let isMounted = true;

    const setupConnection = async () => {
      try {
        const info = await getSignalRInfo(userId);
        if (!isMounted) return;

        connection = new HubConnectionBuilder()
          .withUrl(info.data.url, { accessTokenFactory: () => info.data.accessToken })
          .withAutomaticReconnect()
          .build();

        connection.on('draftStateUpdate', (updatedLeague) => {
          if (updatedLeague?.id === leagueId) {
            onLeagueUpdate(updatedLeague);
          }
        });

        connection.on('draftChatMessage', (message) => {
          if (message?.leagueId === leagueId) {
            onChatMessage((current) => [...current.slice(-59), message]);
          }
        });

        connection.on('beerRequestReceived', (requestingTeamName) => {
          onBeerRequest({
            id: `${Date.now()}-${requestingTeamName}`,
            message: `${requestingTeamName} wants a beer!`,
          });
        });

        connection.on('budgetReviewNotice', (notice) => {
          if (notice?.leagueId === leagueId) {
            onBudgetReviewNotice?.(notice);
          }
        });

        connection.on('budgetAdjustmentNotice', (notice) => {
          if (notice?.leagueId === leagueId) {
            onBudgetAdjustmentNotice?.(notice);
          }
        });

        await connection.start();
        await axios.post(`${API_BASE_URL}/leagues/${leagueId}/connect`, { userId });
      } catch (error) {
        console.error('Shared draft SignalR connection failed:', error);
      }
    };

    setupConnection();

    return () => {
      isMounted = false;
      axios.post(`${API_BASE_URL}/leagues/${leagueId}/disconnect`, { userId }).catch(() => {});
      if (connection) {
        connection.stop();
      }
    };
  }, [leagueId, userId, onLeagueUpdate, onChatMessage, onBeerRequest, onBudgetReviewNotice, onBudgetAdjustmentNotice]);
};

const useDraftPresenceReporter = (leagueId, userId) => {
  useEffect(() => {
    if (!leagueId || !userId) return;

    let lastStatus = '';
    let reportTimer;

    const postPresence = async (status) => {
      if (lastStatus === status) return;
      lastStatus = status;
      try {
        await axios.post(`${API_BASE_URL}/leagues/${leagueId}/presence`, { userId, status });
      } catch (error) {
        console.warn('Unable to update draft presence:', error);
      }
    };

    const reportCurrentPresence = () => {
      const nextStatus = document.visibilityState === 'hidden' || !document.hasFocus() ? 'away' : 'active';
      window.clearTimeout(reportTimer);
      reportTimer = window.setTimeout(() => postPresence(nextStatus), nextStatus === 'away' ? 90 : 0);
    };

    const sendDisconnectBeacon = () => {
      const payload = JSON.stringify({ userId });
      if (navigator.sendBeacon) {
        const body = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(`${API_BASE_URL}/leagues/${leagueId}/disconnect`, body);
      }
    };

    postPresence('active');
    document.addEventListener('visibilitychange', reportCurrentPresence);
    window.addEventListener('focus', reportCurrentPresence);
    window.addEventListener('blur', reportCurrentPresence);
    window.addEventListener('pagehide', sendDisconnectBeacon);

    return () => {
      window.clearTimeout(reportTimer);
      document.removeEventListener('visibilitychange', reportCurrentPresence);
      window.removeEventListener('focus', reportCurrentPresence);
      window.removeEventListener('blur', reportCurrentPresence);
      window.removeEventListener('pagehide', sendDisconnectBeacon);
    };
  }, [leagueId, userId]);
};

const useDraftCardCollapsers = () => {
  useEffect(() => {
    const attachedButtons = new Set();

    const enhanceCards = () => {
      document.querySelectorAll('.card').forEach((card) => {
        if (card.dataset.draftCollapseAttached === 'true') return;

        const heading = card.querySelector('h2, h3, h4');
        const title = heading?.textContent?.trim().replace(/\s+/g, ' ');
        if (!title || !COLLAPSIBLE_CARD_TITLES.some((candidate) => title.startsWith(candidate))) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'draft-panel-toggle';
        button.textContent = 'Minimize';
        button.addEventListener('click', () => {
          const collapsed = card.classList.toggle('is-collapsed');
          button.textContent = collapsed ? 'Expand' : 'Minimize';
        });

        card.classList.add('draft-enhance-collapsible');
        card.dataset.draftCollapseAttached = 'true';
        heading.insertAdjacentElement('afterend', button);
        attachedButtons.add(button);
      });
    };

    enhanceCards();
    const observer = new MutationObserver(enhanceCards);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      attachedButtons.forEach((button) => button.remove());
      document.querySelectorAll('.draft-enhance-collapsible').forEach((card) => {
        card.classList.remove('draft-enhance-collapsible', 'is-collapsed');
        delete card.dataset.draftCollapseAttached;
      });
    };
  }, []);
};

const getRosterTotal = (settings = {}) => Object.values(settings || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);

const getMaxBid = (settings, team) => {
  if (!team) return 0;
  const totalRosterSpots = getRosterTotal(settings);
  const openRosterSpots = Math.max(0, totalRosterSpots - ((team.roster || []).length));
  if (openRosterSpots <= 0) return 0;

  const reserveForRemainingPlayers = openRosterSpots - 1;
  return Math.max(0, (Number(team.budget) || 0) - reserveForRemainingPlayers);
};

const formatChatTime = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

export default DraftRoomEnhanced;
