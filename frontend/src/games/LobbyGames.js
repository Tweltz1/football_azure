import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../api';
import { CREW } from '../data/crew';
import InfoTip from '../help/InfoTip';
import { GAME_KINDS, GAMES } from './sim.generated';
import GamePlayer from './GamePlayer';
import { GAME_ART } from './GamesPage';
import { errorText, officialRunner } from './gameRunners';
import './Games.css';

const teamNameFor = (league, userId) =>
  (league.teams || []).find((t) => t && t.ownerId === userId)?.name || 'Member';

/** Everyone's official scores for one game, best first (unfinished tries last). */
const standings = (league, challenge) => Object.entries(challenge.attempts || {})
  .map(([userId, a]) => ({ userId, name: teamNameFor(league, userId), score: a.finishedAt ? a.score : null, detail: a.detail, playing: !a.finishedAt }))
  .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

const SetupForm = ({ leagueId }) => {
  const [game, setGame] = useState('climb');
  const [prize, setPrize] = useState('5');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const add = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await axios.post(`${API_BASE_URL}/leagues/${leagueId}/minigame/create`, { game, prize: parseInt(prize, 10) || 0 });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="lobby-game-setup" onSubmit={add}>
      <label>
        Game
        <select value={game} onChange={(e) => setGame(e.target.value)}>
          {GAME_KINDS.map((kind) => <option key={kind} value={kind}>{GAMES[kind].title}</option>)}
        </select>
      </label>
      <label>
        Prize
        <span className="lobby-prize-input">$<input type="number" min="1" max="100" value={prize} onChange={(e) => setPrize(e.target.value)} /></span>
      </label>
      <button type="submit" className="game-go" disabled={busy}>Add game</button>
      {error && <p className="game-error">{error}</p>}
    </form>
  );
};

const ChallengeCard = ({ league, leagueId, challenge, userId, isAdmin, inLobby, onPlay }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const info = GAMES[challenge.game];
  const rows = standings(league, challenge);
  const mine = challenge.attempts?.[userId];
  const leader = rows.find((r) => r.score != null);
  const winner = challenge.awardedTo ? teamNameFor(league, challenge.awardedTo) : null;

  const act = async (action, body) => {
    setBusy(true);
    setError('');
    try {
      await axios.post(`${API_BASE_URL}/leagues/${leagueId}/minigame/${action}`, { challengeId: challenge.id, ...body });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const canResume = mine && !mine.finishedAt && info.style === 'turns';
  const canPlay = !mine && !challenge.awardedTo && inLobby;

  return (
    <div className="lobby-game">
      <div className="lobby-game-top">
        <img src={CREW[GAME_ART[challenge.game]].art} alt="" />
        <div>
          <strong>{info.title}</strong>
          <span className="lobby-game-prize">Prize: ${challenge.prize}{winner ? `, won by ${winner}` : ''}</span>
        </div>
      </div>
      <p className="lobby-game-blurb">{info.blurb}</p>

      {rows.length > 0 && (
        <ol className="lobby-game-scores">
          {rows.map((row) => (
            <li key={row.userId} className={row.userId === challenge.awardedTo ? 'is-winner' : ''}>
              <span>{row.name}</span>
              <span>{row.score != null ? `${row.score} ${info.unit}` : 'playing...'}{row.detail ? <small> {row.detail}</small> : null}</span>
              {isAdmin && !challenge.awardedTo && (
                <span className="lobby-game-admin">
                  {row.score != null && <button type="button" disabled={busy} onClick={() => act('award', { userId: row.userId })}>Award ${challenge.prize}</button>}
                  <button type="button" disabled={busy} onClick={() => act('reset', { userId: row.userId })}>Another try</button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="lobby-game-actions">
        {canPlay && !confirming && <button type="button" className="game-go" onClick={() => setConfirming(true)}>Play your official try</button>}
        {canPlay && confirming && (
          <span className="lobby-game-confirm">
            <span>You get one try{info.style === 'skill' ? ', and leaving counts as your try' : ''}. Ready?</span>
            <button type="button" className="game-go" onClick={() => { setConfirming(false); onPlay(challenge); }}>Let's go</button>
            <button type="button" className="game-secondary" onClick={() => setConfirming(false)}>Not yet</button>
          </span>
        )}
        {canResume && <button type="button" className="game-go" onClick={() => onPlay(challenge)}>Finish your try</button>}
        {mine?.finishedAt && <span className="game-hint">Your score: {mine.score} {info.unit}</span>}
        {mine && !mine.finishedAt && info.style === 'skill' && <span className="game-hint">Your try didn't finish. The commissioner can give you another.</span>}
        {!mine && <Link className="game-secondary" to={`/games?game=${challenge.game}`}>Practice first</Link>}
        {isAdmin && leader && !challenge.awardedTo && (
          <span className="game-hint">Leader: {leader.name}. Tap Award when everyone has played.</span>
        )}
        {isAdmin && <button type="button" className="game-secondary is-danger" disabled={busy} onClick={() => act('remove')}>Remove</button>}
      </div>
      {error && <p className="game-error">{error}</p>}
    </div>
  );
};

/**
 * The lobby's "Draft games" card: the commissioner puts up games for extra draft dollars, each member
 * plays one official try (great for someone who can't make the draft), and the commissioner awards
 * the prize, which goes onto the winner's budget. Nothing here touches bids.
 */
const LobbyGames = ({ league, leagueId, user, isAdmin }) => {
  const [playing, setPlaying] = useState(null);
  const challenges = league.miniGames || [];
  const status = String(league.status || '').toLowerCase();
  const inLobby = status === '' || status === 'created' || status === 'lobby';
  const runner = useMemo(() => (playing ? officialRunner(leagueId, playing.id) : null), [leagueId, playing]);

  if (!isAdmin && challenges.length === 0) return null;

  return (
    <div className="card lobby-games-card" style={{ marginTop: '20px' }}>
      <div className="kicker-with-tip">
        <h3>Draft games</h3>
        <InfoTip label="draft games">
          Games for extra draft dollars, like the ones at the draft. Each member gets one official try from here,
          so someone who can't make it can still play. Scores are checked by the server. The commissioner awards
          the prize, and it's added to that team's budget. Practice any time on the Games tab.
        </InfoTip>
      </div>
      {playing ? (
        <GamePlayer game={playing.game} runner={runner} onDone={() => setPlaying(null)} />
      ) : (
        <>
          {challenges.length === 0 && <p className="game-hint">No games yet. Add one for the league to play before the draft.</p>}
          {challenges.map((challenge) => (
            <ChallengeCard
              key={challenge.id}
              league={league}
              leagueId={leagueId}
              challenge={challenge}
              userId={user.userId}
              isAdmin={isAdmin}
              inLobby={inLobby}
              onPlay={setPlaying}
            />
          ))}
          {isAdmin && inLobby && <SetupForm leagueId={leagueId} />}
        </>
      )}
    </div>
  );
};

export default LobbyGames;
