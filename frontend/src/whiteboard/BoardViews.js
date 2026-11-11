import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../api';
import { boardToSvg } from './boardCodec';
import { isAutoReadLeague, maxBidFor, openRosterSpots } from './biddingStyle';
import './whiteboard.css';

/** A stored board drawn as SVG, framed to the drawing. */
export const BoardSketch = ({ board, className = '', strokeWidth = 4, title }) => {
  const svg = useMemo(() => boardToSvg(board), [board]);
  if (!svg) return null;
  return (
    <svg className={`wb-sketch ${className}`} viewBox={svg.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={title || 'Whiteboard drawing'}>
      {svg.paths.map((d, index) => (
        <path key={index} d={d} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
};

/**
 * "Everyone holds up their boards": one mini whiteboard per team. Teams that locked nothing in show "No bid".
 * `label(userId, bid)` gives the line under each board; `winnerId` highlights the winner.
 */
export const BoardGrid = ({
  league,
  bids = {},
  winnerId = null,
  selectedId = null,
  onSelect,
  label,
  revealKey = '',
  size = 'regular',
}) => {
  const teams = league?.teams || [];
  // Winner first, then everyone who held up a board, then the teams with no bid.
  const rank = (team) => (winnerId && team.ownerId === winnerId ? 0 : bids[team.ownerId] ? 1 : 2);
  const ordered = teams.map((team, index) => ({ team, index }))
    .sort((a, b) => rank(a.team) - rank(b.team) || a.index - b.index)
    .map(({ team }) => team);

  return (
    <div className={`wb-grid wb-grid-${size}`} key={revealKey}>
      {ordered.map((team, index) => {
        const bid = bids[team.ownerId];
        const isWinner = winnerId && team.ownerId === winnerId;
        const isSelected = selectedId && team.ownerId === selectedId;
        const selectable = Boolean(onSelect && bid);
        const Tag = selectable ? 'button' : 'article';
        return (
          <Tag
            key={team.id}
            type={selectable ? 'button' : undefined}
            className={`wb-card${bid ? '' : ' is-empty'}${isWinner ? ' is-winner' : ''}${isSelected ? ' is-selected' : ''}${selectable ? ' is-selectable' : ''}`}
            style={{ '--i': index }}
            onClick={selectable ? () => onSelect(team.ownerId) : undefined}
            aria-pressed={selectable ? Boolean(isSelected) : undefined}
          >
            <div className="wb-card-board">
              {bid?.board ? (
                <BoardSketch board={bid.board} title={`${team.name}'s board`} strokeWidth={size === 'tv' ? 6 : 4} />
              ) : bid ? (
                <span className="wb-card-typed">${bid.amount}</span>
              ) : (
                <span className="wb-card-none">No bid</span>
              )}
            </div>
            {isWinner && <span className="wb-card-badge">Winner</span>}
            <div className="wb-card-meta">
              <strong>{team.name}</strong>
              {bid && label && label(team.ownerId, bid) && <span>{label(team.ownerId, bid)}</span>}
            </div>
          </Tag>
        );
      })}
    </div>
  );
};

/** Line under each board during the review: the auto-read amount, or nothing in the manual style. */
export const reviewLabel = (league) => (userId, bid) => {
  if (!isAutoReadLeague(league)) return null;
  return bid.amount > 0 ? `Reads $${bid.amount}` : 'Unreadable';
};

/** Line under each board after the award. */
export const pickLabel = (league, pick) => (userId, bid) => {
  const winner = (league?.teams || []).find((team) => team.id === pick?.winningTeamId);
  if (winner && winner.ownerId === userId) return `Won for $${pick.winningBid}`;
  if (!isAutoReadLeague(league)) return bid.board ? null : `$${bid.amount}`;
  return bid.amount > 0 ? `Read $${bid.amount}` : 'Unreadable';
};

/** Manual style: the commissioner reads a tie on the boards, so they pick the tied teams and the amount. */
const ManualRebid = ({ leagueId, candidates }) => {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState([]);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (candidates.length < 2) return null;
  if (!open) {
    return <button type="button" className="link-button" onClick={() => setOpen(true)}>Boards tied? Start a rebid round</button>;
  }
  const toggle = (ownerId) => setPicked((now) => (now.includes(ownerId) ? now.filter((id) => id !== ownerId) : [...now, ownerId]));
  const start = async () => {
    const value = parseInt(amount, 10) || 0;
    if (picked.length < 2) { setError('Choose the tied teams.'); return; }
    if (value < 1) { setError('Enter the tied amount.'); return; }
    setBusy(true);
    setError('');
    try {
      await axios.post(`${API_BASE_URL}/leagues/${leagueId}/board-rebid`, { userIds: picked, amount: value });
    } catch (err) {
      setError(String(err.response?.data || err.message));
      setBusy(false);
    }
  };
  return (
    <div className="wb-award-manual-rebid">
      <p className="wb-award-lead">Which teams tied, and at how much?</p>
      <div className="wb-award-teams">
        {candidates.map((team) => (
          <button key={team.id} type="button" className={`wb-chip${picked.includes(team.ownerId) ? ' is-active' : ''}`} onClick={() => toggle(team.ownerId)}>
            <span>{team.name}</span>
          </button>
        ))}
      </div>
      <label className="wb-award-amount">
        <span>Tied at</span>
        <span className="wb-award-input">
          <i aria-hidden="true">$</i>
          <input type="number" inputMode="numeric" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Tied amount" />
        </span>
      </label>
      <button type="button" className="wb-award-go wb-award-rebid" onClick={start} disabled={busy}>Start rebid round</button>
      {error && <p className="wb-error" role="alert">{error}</p>}
    </div>
  );
};

/**
 * Commissioner-only panel during the board review. Manual: choose the winner and type the amount.
 * Auto-read: prefilled with the top read (ties flagged), editable, then Confirm & award.
 */
export const BoardAwardPanel = ({ league, leagueId, selectedId, onSelect }) => {
  const review = league?.boardReview;
  const autoRead = isAutoReadLeague(league);
  const teams = league?.teams || [];
  const candidates = teams.filter((team) => review?.bids?.[team.ownerId]);
  const topRead = review?.topRead;
  const isTie = autoRead && (topRead?.userIds?.length || 0) > 1;
  const reviewKey = `${review?.playerId}:${Object.keys(review?.bids || {}).sort().join(',')}`;

  const [amount, setAmount] = useState('');
  const [skip, setSkip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Prefill once per review.
  useEffect(() => {
    setError('');
    setSkip(false);
    if (autoRead && topRead) {
      setAmount(String(topRead.amount));
      onSelect(topRead.userIds.length === 1 ? topRead.userIds[0] : null);
    } else {
      setAmount('');
      onSelect(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewKey]);

  const selectedTeam = candidates.find((team) => team.ownerId === selectedId) || null;
  const maxBid = selectedTeam ? maxBidFor(league, selectedTeam) : null;

  const choose = (ownerId) => {
    setSkip(false);
    setError('');
    onSelect(ownerId);
    if (autoRead) {
      const read = review?.bids?.[ownerId]?.amount;
      if (read > 0) setAmount(String(read));
    }
  };

  const handleSkip = async () => {
    setBusy(true);
    setError('');
    try {
      await axios.post(`${API_BASE_URL}/leagues/${leagueId}/skip`, {});
    } catch (err) {
      setError(String(err.response?.data || err.message));
    } finally {
      setBusy(false);
    }
  };

  // First tie: the tied teams write again and must beat it. After that rebid round, the commissioner picks.
  const handleRebid = async () => {
    setBusy(true);
    setError('');
    try {
      await axios.post(`${API_BASE_URL}/leagues/${leagueId}/board-rebid`, { userIds: topRead.userIds, amount: topRead.amount });
    } catch (err) {
      setError(String(err.response?.data || err.message));
    } finally {
      setBusy(false);
    }
  };

  const handleAward = async () => {
    if (skip) {
      handleSkip();
      return;
    }
    const value = parseInt(amount, 10) || 0;
    if (!selectedTeam) {
      setError('Choose the winning team.');
      return;
    }
    if (value < 1) {
      setError('Bid must be at least $1.');
      return;
    }
    if (openRosterSpots(league, selectedTeam) <= 0) {
      setError(`${selectedTeam.name} already has a full roster.`);
      return;
    }
    if (value > maxBid) {
      setError(`${selectedTeam.name} can spend up to $${Math.max(0, maxBid)} and still keep $1 for each remaining roster spot.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await axios.post(`${API_BASE_URL}/leagues/${leagueId}/board-award`, { winningTeamId: selectedTeam.id, amount: value });
    } catch (err) {
      setError(String(err.response?.data || err.message));
    } finally {
      setBusy(false);
    }
  };

  if (!review) return null;

  if (candidates.length === 0) {
    return (
      <section className="wb-award" aria-label="Commissioner award">
        <p className="wb-award-kicker">Commissioner</p>
        <p className="wb-award-lead">Nobody locked in a board for this player.</p>
        <button type="button" className="wb-award-go" onClick={handleSkip} disabled={busy}>Skip player</button>
        {error && <p className="wb-error" role="alert">{error}</p>}
      </section>
    );
  }

  const tiedNames = isTie ? topRead.userIds.map((id) => teams.find((t) => t.ownerId === id)?.name || 'Unknown').join(' and ') : '';

  return (
    <section className="wb-award" aria-label="Commissioner award">
      <div className="wb-award-head">
        <p className="wb-award-kicker">Commissioner award</p>
        <p className="wb-award-lead">
          {review.tie
            ? `This was the rebid round (it had to beat $${review.tie.tieAmount}). ${isTie ? 'It tied again, so pick the winner.' : 'Check the boards, then confirm.'}`
            : autoRead
              ? (isTie ? 'Top reads are tied. Start a rebid round, or pick the winner.' : 'Check the top read, then confirm.')
              : 'Read the boards, pick the winner and enter the amount. If two boards tie, use the rebid round below.'}
        </p>
      </div>

      {isTie && (
        <p className="wb-award-tie" role="status">Tie at ${topRead.amount}: {tiedNames}</p>
      )}
      {isTie && !review.tie && (
        <button type="button" className="wb-award-go wb-award-rebid" onClick={handleRebid} disabled={busy}>
          Rebid round: {tiedNames} must beat ${topRead.amount}
        </button>
      )}
      {!autoRead && !review.tie && <ManualRebid league={league} leagueId={leagueId} candidates={candidates} />}

      <div className="wb-award-teams" role="radiogroup" aria-label="Winning team">
        {candidates.map((team) => {
          const read = review.bids[team.ownerId]?.amount;
          const active = !skip && selectedId === team.ownerId;
          return (
            <button
              key={team.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`wb-chip${active ? ' is-active' : ''}${isTie && topRead.userIds.includes(team.ownerId) ? ' is-tied' : ''}`}
              onClick={() => choose(team.ownerId)}
            >
              <span>{team.name}</span>
              {autoRead && read > 0 && <em>${read}</em>}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={skip}
          className={`wb-chip wb-chip-skip${skip ? ' is-active' : ''}`}
          onClick={() => { setSkip(true); setError(''); onSelect(null); }}
        >
          <span>Nobody – skip player</span>
        </button>
      </div>

      {!skip && (
        <div className="wb-award-row">
          <label className="wb-award-amount">
            <span>Amount</span>
            <span className="wb-award-input">
              <i aria-hidden="true">$</i>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                value={amount}
                onChange={(event) => { setAmount(event.target.value); setError(''); }}
                aria-label="Winning amount"
              />
            </span>
          </label>
          <p className="wb-award-max">{selectedTeam ? `${selectedTeam.name} max bid: $${maxBid}` : 'Choose a team to see its max bid.'}</p>
        </div>
      )}

      <button type="button" className="wb-award-go" onClick={handleAward} disabled={busy || (!skip && !selectedTeam)}>
        {busy ? 'Saving...' : skip ? 'Skip player' : autoRead ? `Confirm & award${amount ? ` $${parseInt(amount, 10) || 0}` : ''}` : 'Award'}
      </button>
      {error && <p className="wb-error" role="alert">{error}</p>}
    </section>
  );
};
