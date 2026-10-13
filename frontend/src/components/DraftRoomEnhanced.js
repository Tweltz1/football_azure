import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { createDraftConnection } from '../realtime';
import { useAuth } from '../AuthContext';
import { API_BASE_URL } from '../api';
import { subscribeProfileUpdates } from '../profileSync';
import DraftScreen from './DraftScreen';
import WhiteboardPad from '../whiteboard/WhiteboardPad';
import { isAutoReadLeague, isWhiteboardLeague } from '../whiteboard/biddingStyle';
import './DraftRoomEnhanced.css';

const COLLAPSIBLE_CARD_TITLES = [
  'Draft Controls & Overview',
  'League Teams',
  'League Teams:',
  'Player Lists',
  'Current Player Up for Bid:',
  'Intermission!',
  'Tie Breaker!',
  'Boards Up!'
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
  useAdminBudgetReviewReporter(leagueId, resolvedUserId, league?.adminId);
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
        chatMessages={chatMessages}
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
  const memberIds = league?.members || [];
  const rosterTotal = useMemo(() => getRosterTotal(league?.rosterSettings), [league]);
  const normalizedStatus = String(league?.status || '').toLowerCase();
  const isManualDraft = league?.draftMode === 'manual';
  const isWhiteboard = !isManualDraft && isWhiteboardLeague(league);
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
  const assignedOwnerIds = new Set(teams.map((team) => team.ownerId).filter(Boolean));
  const unassignedMemberIds = memberIds.filter((memberId) => !assignedOwnerIds.has(memberId));

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

  const handleLockInBoard = async (amount, board) => {
    try {
      await axios.post(`${API_BASE_URL}/leagues/${leagueId}/bid`, { userId: user.userId, amount, board }, { suppressBidLimitAlert: true });
    } catch (error) {
      throw new Error(error.response?.data || error.message);
    }
  };

  const boardPadReason = !currentTeam
    ? 'You need a team in this league to bid.'
    : normalizedStatus === 'boardreview'
      ? 'Boards are up. The commissioner is awarding this player.'
      : league?.auctionTimer?.isPaused && normalizedStatus === 'drafting'
        ? 'The draft is paused.'
        : 'Boards open when the next player is up.';

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
          {unassignedMemberIds.map((memberId) => {
            const isOnline = (league?.onlineUserIds || []).includes(memberId);
            const isAway = isOnline && (league?.awayUserIds || []).includes(memberId);
            const presenceStatus = !isOnline ? 'offline' : isAway ? 'away' : 'online';
            const presenceLabel = presenceStatus === 'online' ? 'Active' : presenceStatus === 'away' ? 'Away' : 'Offline';
            return (
              <div className="team-presence-row" key={`unassigned-${memberId}`}>
                <span className={`presence-light ${presenceStatus}`} aria-label={presenceLabel} />
                <span className="team-presence-name">{formatMemberLabel(memberId)}</span>
                <span className={`team-presence-meta ${presenceStatus}`}>{presenceLabel} | Unassigned</span>
              </div>
            );
          })}
        </div>
      </CollapsiblePanel>

      {isManualDraft ? (
        <ManualCompanionPanel leagueId={leagueId} league={league} user={user} currentTeam={currentTeam} rosterTotal={rosterTotal} />
      ) : isWhiteboard ? (
        <CollapsiblePanel title="Quick Bid" storageKey="draft-panel-quick-bid" defaultOpen>
          <WhiteboardPad
            compact
            autoRead={isAutoReadLeague(league)}
            activeBid={user?.userId ? league?.activeBids?.[user.userId] || null : null}
            disabled={!currentTeam || normalizedStatus !== 'drafting' || Boolean(league?.auctionTimer?.isPaused)}
            disabledReason={boardPadReason}
            onLockIn={handleLockInBoard}
            userId={user?.userId || null}
            maxAmount={quickBidMax}
          />
        </CollapsiblePanel>
      ) : (
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
          {typeof activeBid === 'number' && <p key={activeBid} className="draft-muted quick-bid-active bid-flash">Your active bid: <strong>${activeBid}</strong></p>}
          {isCappedBelowMinimum && <p className="draft-muted">You are capped below the minimum bid for this player.</p>}
          {isTieBreaker && !userCanBidInPhase && <p className="draft-muted">Only tied teams can bid in this round.</p>}
          {isFinalTie && <p className="draft-muted">Final tie is locked for admin resolution.</p>}
          {quickBidStatus && <p className="quick-bid-status">{quickBidStatus}</p>}
        </CollapsiblePanel>
      )}

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

const ManualCompanionPanel = ({ leagueId, league, user, currentTeam, rosterTotal }) => {
  const [beerRequestCooldown, setBeerRequestCooldown] = useState(0);
  const currentPlayer = useMemo(
    () => (league?.initialPlayerPool || []).find((player) => player.id === league?.currentPlayerId),
    [league]
  );
  const beerDutyTeam = (league?.teams || []).find((team) => team.id === league?.beerBitchTeamId);
  const favoriteSet = new Set(currentTeam?.favoritePlayerIds || []);
  const favoritePlayers = (league?.initialPlayerPool || [])
    .filter((player) => favoriteSet.has(player.id) && !player.isDrafted)
    .slice(0, 6);

  useEffect(() => {
    if (beerRequestCooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setBeerRequestCooldown((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [beerRequestCooldown]);

  const handleRequestBeer = async () => {
    if (!currentTeam) return;

    setBeerRequestCooldown(300);
    try {
      await axios.post(`${API_BASE_URL}/leagues/${leagueId}/request-beer`, { requestingTeamId: currentTeam.id });
    } catch (error) {
      setBeerRequestCooldown(0);
      alert(`Error requesting beer: ${error.response?.data || error.message}`);
    }
  };

  const canRequestBeer = Boolean(currentTeam && beerDutyTeam && beerDutyTeam.id !== currentTeam.id);
  const beerButtonLabel = beerRequestCooldown > 0
    ? `Request Beer (${beerRequestCooldown}s)`
    : !currentTeam
      ? 'Waiting for Team'
      : beerDutyTeam?.id === currentTeam.id
        ? 'You Are on Duty'
        : 'Request Beer';

  return (
    <CollapsiblePanel title="Manual Room" storageKey="draft-panel-manual-room" defaultOpen>
      <div className="manual-companion-panel">
        <section className="manual-companion-card">
          <p className="draft-command-kicker">Up Now</p>
          {currentPlayer ? (
            <>
              <h3>{currentPlayer.name}</h3>
              <p>{currentPlayer.position} / {currentPlayer.team} / Bye {currentPlayer.bye || '-'} / Rank #{currentPlayer.rank || '-'}</p>
            </>
          ) : (
            <p className="draft-muted">Waiting for the commissioner to pick a player.</p>
          )}
        </section>

        <section className="manual-companion-card">
          <p className="draft-command-kicker">Your Team</p>
          {currentTeam ? (
            <>
              <h3>{currentTeam.name}</h3>
              <div className="manual-companion-stats">
                <span>${currentTeam.budget} budget</span>
                <span>{(currentTeam.roster || []).length}/{rosterTotal} roster</span>
              </div>
              {(currentTeam.roster || []).length > 0 && (
                <ul className="manual-companion-list">
                  {(currentTeam.roster || []).slice(-5).map((spot, index) => (
                    <li key={`${spot.player?.id || index}-${index}`}>
                      <strong>{spot.player?.name || 'Unknown Player'}</strong>
                      <span>{spot.player?.position || spot.position || '-'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="draft-muted">You are in the room. The commissioner can assign you to a manual team.</p>
          )}
        </section>

        <section className="manual-companion-card">
          <p className="draft-command-kicker">Favorites</p>
          {favoritePlayers.length > 0 ? (
            <ul className="manual-companion-list">
              {favoritePlayers.map((player) => (
                <li key={player.id}>
                  <strong>{player.name}</strong>
                  <span>{player.position} / {player.team}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="draft-muted">Favorite players from your profile show here after your team is assigned.</p>
          )}
        </section>

        <section className="manual-companion-card">
          <p className="draft-command-kicker">Beer</p>
          <p className="draft-muted">{beerDutyTeam ? `${beerDutyTeam.name} is on beer duty.` : 'No beer duty assigned.'}</p>
          <button type="button" onClick={handleRequestBeer} disabled={!canRequestBeer || beerRequestCooldown > 0}>
            {beerButtonLabel}
          </button>
        </section>
      </div>
    </CollapsiblePanel>
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
        if (!isMounted) return;
        connection = createDraftConnection({ leagueIds: [leagueId], userId });

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
        console.error('Shared draft live connection failed:', error);
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

const useAdminBudgetReviewReporter = (leagueId, userId, adminId) => {
  useEffect(() => {
    if (!leagueId || !userId || userId !== adminId) return undefined;

    const handleClick = (event) => {
      const button = event.target?.closest?.('button');
      if (!button || button.disabled || button.textContent?.trim() !== 'Manage Members') return;

      axios.post(`${API_BASE_URL}/leagues/${leagueId}/budget-review`, { adminId: userId }).catch((error) => {
        console.warn('Unable to send budget review notice:', error);
      });
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [leagueId, userId, adminId]);
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

const formatMemberLabel = (memberId = '') => {
  if (!memberId) return 'Unknown member';
  const value = String(memberId);
  const emailName = value.includes('@') ? value.split('@')[0] : value;
  return emailName.replace(/[._-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
};

export default DraftRoomEnhanced;
