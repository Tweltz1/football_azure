import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { createDraftConnection } from '../realtime';
import { useAuth } from '../AuthContext';
import { API_BASE_URL } from '../api';
import { BoardGrid, pickLabel, reviewLabel } from '../whiteboard/BoardViews';
import { isWhiteboardLeague } from '../whiteboard/biddingStyle';
import './DraftTvView.css';


const DraftTvView = () => {
  const { leagueId } = useParams();
  const { user } = useAuth();
  const [league, setLeague] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const now = useNow(1000);

  useEffect(() => {
    let isMounted = true;

    const fetchLeague = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/leagues/${leagueId}/state`);
        if (isMounted) setLeague(response.data);
      } catch (error) {
        console.error('Error loading TV draft board:', error);
      } finally {
        if (isMounted) setLoaded(true);
      }
    };

    fetchLeague();
    return () => {
      isMounted = false;
    };
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId) return undefined;

    let connection;
    let isMounted = true;

    const setupConnection = async () => {
      try {
        if (!isMounted) return;
        connection = createDraftConnection({ leagueIds: [leagueId], userId: user?.userId });

        connection.on('draftStateUpdate', (updatedLeague) => {
          if (updatedLeague?.id === leagueId) {
            setLeague(updatedLeague);
            setLoaded(true);
          }
        });

        await connection.start();
      } catch (error) {
        console.error('TV draft board live connection failed:', error);
      }
    };

    setupConnection();
    return () => {
      isMounted = false;
      if (connection) connection.stop();
    };
  }, [leagueId, user?.userId]);

  const timer = getTimerSeconds(league?.auctionTimer, now);
  const status = String(league?.status || '').toLowerCase();
  const currentPlayer = useMemo(() => findPlayer(league, league?.currentPlayerId), [league]);
  const lastPick = league?.draftLog?.length ? league.draftLog[league.draftLog.length - 1] : null;
  const lastPickBids = useMemo(() => buildBidRows(league, lastPick?.allBids), [league, lastPick]);
  const winningTeam = getTeamById(league, lastPick?.winningTeamId);
  const rosterTotal = getRosterTotal(league?.rosterSettings);

  if (!loaded) {
    return <div className="draft-tv-view"><div className="tv-loading">Loading live board...</div></div>;
  }

  if (!league) {
    return <div className="draft-tv-view"><div className="tv-loading">Could not load this draft.</div></div>;
  }

  const isAuction = status === 'drafting' || status === 'tiebreaker';
  const isManual = status === 'manual';
  const isBoardReview = status === 'boardreview' && Boolean(league.boardReview);
  const isIntermissionLike = !isBoardReview && (status === 'intermission' || status === 'completed' || !isAuction);
  const isWhiteboard = !isManual && isWhiteboardLeague(league);
  const lastPickHasBoards = Object.values(lastPick?.allBids || {}).some((bid) => bid?.board);
  const showPickBoards = isIntermissionLike && !isManual && lastPick && (isWhiteboard || lastPickHasBoards);
  const boardCount = Object.keys(league.boardReview?.bids || {}).length;

  return (
    <div className="draft-tv-view">
      <header className="tv-header">
        <div>
          <p>Hood League Live Draft</p>
          <h1>{league.name}</h1>
        </div>
        <div className="tv-status-strip">
          <span className={`tv-status-bug status-${status || 'waiting'}`}>{isBoardReview ? 'BOARDS UP' : String(league.status || 'waiting').toUpperCase()}</span>
          <strong
            className={isManual || isBoardReview ? 'manual-current-player' : `tv-clock${isAuction && timer > 0 && timer <= 5 ? ' is-urgent' : ''}`}
            style={isAuction ? { '--timer-progress': Math.min(1, Math.max(0, timer / (Number(status === 'tiebreaker' ? league.draftTimers?.rebidTimer : league.draftTimers?.bidTimer) || 20))) } : undefined}
          >
            {isManual ? (currentPlayer?.name || 'No player up') : isBoardReview ? 'Commissioner deciding' : formatTimer(timer)}
          </strong>
        </div>
      </header>

      {isAuction && (
        <section className="tv-auction-grid">
          <div className="tv-current-player">
            <p className="tv-kicker">On The Clock</p>
            {currentPlayer ? (
              <>
                <h2>{currentPlayer.name}</h2>
                <div className="tv-player-meta">
                  <span className={`pos-badge pos-${String(currentPlayer.position || '').toLowerCase()}`}>{currentPlayer.position}</span>
                  <span>{currentPlayer.team}</span>
                  <span>Bye {currentPlayer.bye || '-'}</span>
                  <span>Rank #{currentPlayer.rank || '-'}</span>
                </div>
              </>
            ) : (
              <h2>Waiting for nomination</h2>
            )}
          </div>

          <div className="tv-current-bid tv-sealed-bids">
            <p className="tv-kicker">{isWhiteboard ? 'Whiteboard Auction' : 'Blind Auction'}</p>
            <strong>Sealed</strong>
            <span>{isWhiteboard ? 'Boards flip when the clock hits 0' : 'Bids are revealed when the clock hits 0'}</span>
          </div>

          <div className="tv-bid-board">
            <p className="tv-kicker">Last Pick</p>
            {lastPick ? (
              <div className="tv-last-pick">
                <strong>{lastPick.player?.name || 'Unknown Player'}</strong>
                <span>{winningTeam?.name || 'Unknown Team'} for ${lastPick.winningBid}</span>
              </div>
            ) : (
              <div className="tv-empty-bids">No picks yet.</div>
            )}
          </div>
        </section>
      )}

      {isBoardReview && (
        <section className="tv-board-reveal">
          <header>
            <div>
              <p className="tv-kicker">Boards Up</p>
              <h2>{currentPlayer?.name || 'Current player'}</h2>
            </div>
            <span>{boardCount} board{boardCount === 1 ? '' : 's'} · waiting for the commissioner</span>
          </header>
          <BoardGrid league={league} bids={league.boardReview.bids} label={reviewLabel(league)} revealKey={league.boardReview.playerId || ''} size="tv" />
        </section>
      )}

      {isIntermissionLike && (
        <section className={`tv-result-strip${showPickBoards ? ' has-boards' : ''}`}>
          <div>
            <p className="tv-kicker">{isManual && currentPlayer ? 'Up Now' : isManual ? 'Manual Tracker' : 'Last Result'}</p>
            {isManual && currentPlayer ? (
              <>
                <h2>{currentPlayer.name}</h2>
                <div className="tv-player-meta">
                  <span className={`pos-badge pos-${String(currentPlayer.position || '').toLowerCase()}`}>{currentPlayer.position}</span>
                  <span>{currentPlayer.team}</span>
                  <span>Bye {currentPlayer.bye || '-'}</span>
                  <span>Rank #{currentPlayer.rank || '-'}</span>
                </div>
              </>
            ) : lastPick ? (
              <h2>{lastPick.player?.name || 'Unknown Player'} to {winningTeam?.name || 'Unknown Team'} for ${lastPick.winningBid}</h2>
            ) : (
              <h2>Waiting for the first pick</h2>
            )}
          </div>
          {isManual ? (
            <div className="tv-bid-board compact">
              <p className="tv-kicker">{currentPlayer ? 'Selected Player' : 'Latest Entry'}</p>
              <div className="tv-empty-bids">
                {currentPlayer
                  ? `${currentPlayer.position} / ${currentPlayer.team} / Bye ${currentPlayer.bye || '-'}`
                  : lastPick ? `Commissioner entered $${lastPick.winningBid}` : 'No picks entered yet.'}
              </div>
            </div>
          ) : showPickBoards ? null : (
            <BidBoard title="Last Player Bids" bids={lastPickBids} emptyText="No completed bids yet." compact />
          )}
        </section>
      )}

      {showPickBoards && (
        <section className="tv-board-reveal is-result">
          <BoardGrid
            league={league}
            bids={lastPick.allBids || {}}
            winnerId={winningTeam?.ownerId}
            label={pickLabel(league, lastPick)}
            revealKey={`${lastPick.player?.id}-${league.draftLog.length}`}
            size="tv"
          />
        </section>
      )}

      <section className="tv-roster-board">
        {(league.teams || []).map((team) => (
          <article className="tv-team-card" key={team.id}>
            <header>
              <h3>{team.name}</h3>
              <span>{(team.roster || []).length}/{rosterTotal}</span>
            </header>
            <ul>
              {(team.roster || []).length > 0 ? (team.roster || []).map((spot, index) => {
                const player = spot.player || {};
                return (
                  <li key={`${team.id}-${player.id || index}`} className={`pos-${String(player.position || spot.position || '').toLowerCase()}`}>
                    <strong>{player.name || 'Unknown Player'}</strong>
                    <span>{player.position || spot.position || '-'} / {player.team || '-'} / Bye {player.bye || '-'}</span>
                  </li>
                );
              }) : <li className="tv-empty-roster">No picks yet</li>}
            </ul>
          </article>
        ))}
      </section>
    </div>
  );
};

const BidBoard = ({ title, bids, emptyText, compact = false }) => (
  <div className={`tv-bid-board ${compact ? 'compact' : ''}`}>
    <p className="tv-kicker">{title}</p>
    {(bids || []).length > 0 ? (
      <ol>
        {bids.map((bid) => (
          <li key={`${bid.userId}-${bid.amount}`}>
            <span>{bid.teamName}</span>
            <strong>${bid.amount}</strong>
          </li>
        ))}
      </ol>
    ) : (
      <div className="tv-empty-bids">{emptyText}</div>
    )}
  </div>
);

const useNow = (intervalMs) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(interval);
  }, [intervalMs]);

  return now;
};

const buildBidRows = (league, bids = {}) => Object.entries(bids || {})
  .map(([userId, bid]) => {
    const team = getTeamByOwnerId(league, userId);
    return {
      userId,
      teamName: team?.name || 'Unknown Team',
      amount: Number(bid?.amount) || 0,
      timestamp: bid?.timestamp || null,
    };
  })
  .sort((a, b) => b.amount - a.amount || String(a.timestamp || '').localeCompare(String(b.timestamp || '')));

const findPlayer = (league, playerId) => (league?.initialPlayerPool || []).find((player) => player.id === playerId);
const getTeamById = (league, teamId) => (league?.teams || []).find((team) => team.id === teamId);
const getTeamByOwnerId = (league, ownerId) => (league?.teams || []).find((team) => team.ownerId === ownerId);
const getRosterTotal = (settings = {}) => Object.values(settings || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);

const getTimerSeconds = (auctionTimer, now) => {
  if (!auctionTimer) return 0;
  if (auctionTimer.isPaused) return Math.max(0, Number(auctionTimer.timeRemainingOnPause) || 0);
  if (!auctionTimer.endTime) return 0;
  return Math.max(0, Math.ceil((new Date(auctionTimer.endTime).getTime() - now) / 1000));
};

const formatTimer = (seconds) => {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  return minutes > 0 ? `${minutes}:${String(remainder).padStart(2, '0')}` : `${remainder}s`;
};

export default DraftTvView;
