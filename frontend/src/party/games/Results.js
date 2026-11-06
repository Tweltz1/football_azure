import React from 'react';
import Person from '../Person';
import { ordinal } from './quizLook';

/** Scores so far, with each player's head and how they moved since last time. */
export const Leaderboard = ({ ranks, prev = {}, gains = {}, players }) => {
  const top = ranks[0]?.score || 1;
  return (
    <div className={`lq-board${ranks.length > 6 ? ' is-two' : ''}`}>
      {ranks.map((r) => {
        const p = players.find((x) => x.cid === r.cid);
        const move = (prev[r.cid] || r.rank) - r.rank;
        const gain = gains[r.cid]?.gain;
        return (
          <div key={r.cid} className={`lq-row${r.rank === 1 ? ' is-top' : ''}`}>
            <span className="lq-rank">{ordinal(r.rank)}</span>
            {p && <Person look={p.look} view="head" />}
            <span className="lq-name">{r.name}</span>
            <span className="lq-bar"><i style={{ width: `${Math.max(3, (r.score / Math.max(1, top)) * 100)}%` }} /></span>
            <span className="lq-score">{r.score.toLocaleString()}</span>
            <span className={`lq-move${move > 0 ? ' up' : move < 0 ? ' down' : ''}`}>{move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : gain ? `+${gain}` : ''}</span>
          </div>
        );
      })}
    </div>
  );
};

/** The end of a versus game: the top three on a podium, everyone else, awards and what's next. */
export const Podium = ({ ranks, players, awards, onLobby, onAgain }) => (
  <div className="lq-final">
    <h2 className="lc-title">{ranks[0]?.score ? `${ranks[0].name} wins!` : 'Spooky… nobody scored!'}</h2>
    <div className="lq-podium">
      {[1, 0, 2].map((place) => {
        const r = ranks[place];
        const p = r && players.find((x) => x.cid === r.cid);
        if (!p) return <div key={place} className="lq-step is-empty" />;
        return (
          <div key={place} className={`lq-step lq-step-${r.rank}`}>
            <Person look={p.look} pose={r.rank === 1 ? 'cheer' : 'wave'} className={`lc-bob lc-d${place}`} />
            <div className="lq-block">
              <b>{ordinal(r.rank)}</b>
              <span>{r.name}</span>
              <small>{r.score.toLocaleString()}</small>
            </div>
          </div>
        );
      })}
    </div>
    {ranks.length > 3 && (
      <div className="lq-rest">
        {ranks.slice(3).map((r) => <span key={r.cid}>{ordinal(r.rank)} {r.name} · {r.score.toLocaleString()}</span>)}
      </div>
    )}
    <div className="lq-award-chips">
      {awards.map((a) => {
        const p = players.find((x) => x.cid === a.cid);
        return p ? <span key={a.title}>🏆 <b>{a.title}</b> {p.name} <small>({a.blurb})</small></span> : null;
      })}
    </div>
    <div className="lc-end-actions">
      <button type="button" className="lc-btn" onClick={onLobby}>Back to the lobby</button>
      <button type="button" className="lc-btn lc-btn-ghost" onClick={onAgain}>Play again</button>
    </div>
  </div>
);
