import React, { useEffect, useRef } from 'react';
import Person from '../Person';
import { sfx } from '../sound';
import { PlayerTag, ScenePerson } from '../scene';
import {
  ANSWER_MS, awards, multiplier, READ_MS, ranking, ROUND_MS, ROUND_SIZE, ROUNDS, roundOf,
} from './quiz';
import { ANSWER_STYLE, ordinal } from './quizLook';

/** A haunted game-show stage: curtains, a moon, footlights made of jack-o'-lanterns. */
export const QuizBackdrop = ({ lights = 0 }) => (
  <g>
    <defs>
      <linearGradient id="lq-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#140b2a" />
        <stop offset="0.7" stopColor="#3a1f55" />
        <stop offset="1" stopColor="#5a2d4f" />
      </linearGradient>
      <radialGradient id="lq-spot" cx="0.5" cy="0" r="0.9">
        <stop offset="0" stopColor="#ffe9b0" stopOpacity="0.22" />
        <stop offset="1" stopColor="#ffe9b0" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="lq-curtain" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#5d1630" />
        <stop offset="0.5" stopColor="#8e1d2c" />
        <stop offset="1" stopColor="#5d1630" />
      </linearGradient>
    </defs>
    <rect width="1920" height="1080" fill="url(#lq-sky)" />
    <circle cx="1640" cy="150" r="80" fill="#fff1c1" stroke="#16122b" strokeWidth="6" />
    <circle cx="1615" cy="130" r="13" fill="#efdca0" /><circle cx="1665" cy="175" r="9" fill="#efdca0" />
    {[[260, 90], [480, 170], [760, 60], [1150, 110], [1380, 70], [1820, 300], [120, 330]].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r={i % 2 ? 3 : 4} fill="#fff" className="lc-star" style={{ animationDelay: `${i * 0.41}s` }} />
    ))}
    <path d="M0 0 H1920 V1080 H0 Z" fill="url(#lq-spot)" />
    {/* stage floor */}
    <path d="M0 880 L1920 880 L1920 1080 L0 1080 Z" fill="#2a1840" stroke="#16122b" strokeWidth="6" />
    <path d="M0 905 L1920 905" stroke="#3b2455" strokeWidth="6" />
    {/* curtains */}
    {[0, 1].map((side) => (
      <g key={side} transform={side ? 'translate(1920 0) scale(-1 1)' : undefined}>
        <path d="M0 0 L170 0 Q120 300 150 560 Q170 760 120 900 L0 900 Z" fill="url(#lq-curtain)" stroke="#16122b" strokeWidth="6" />
        <path d="M40 0 Q20 400 50 900 M95 0 Q80 420 95 900" stroke="#4a0f24" strokeWidth="6" fill="none" />
        {/* cobweb */}
        <g stroke="#cfc6e6" strokeWidth="2" fill="none" opacity="0.5" transform="translate(170 0)">
          <path d="M0 0 L120 120 M0 0 L60 140 M0 0 L140 50" />
          <path d="M30 30 Q50 20 45 10 M60 60 Q90 45 85 25 M90 90 Q130 70 120 40" />
        </g>
      </g>
    ))}
    <path d="M0 0 H1920 V70 Q1440 120 960 70 Q480 120 0 70 Z" fill="#8e1d2c" stroke="#16122b" strokeWidth="6" />
    {/* jack-o'-lantern footlights */}
    {[110, 300, 1620, 1810].map((x, i) => (
      <g key={x} transform={`translate(${x} 1040) scale(0.85)`}>
        <ellipse rx="44" ry="34" fill="#ff8a2a" stroke="#16122b" strokeWidth="5" />
        <path d="M-4 -34 q4 -14 12 -16" stroke="#16122b" strokeWidth="6" fill="none" strokeLinecap="round" />
        <g className={i % 2 === lights % 2 ? 'lc-window' : undefined} fill="#ffe066" stroke="#16122b" strokeWidth="3">
          <path d="M-24 -10 l10 -12 l10 12 Z" /><path d="M4 -10 l10 -12 l10 12 Z" />
          <path d="M-26 6 q26 22 52 0 l-8 4 l-6 -6 l-6 6 l-6 -6 l-6 6 l-6 -6 l-6 6 Z" />
        </g>
      </g>
    ))}
  </g>
);

// Where each player stands along the stage floor.
const standAt = (i, n) => {
  const w = Math.min(150, 1500 / Math.max(1, n));
  return { x: 960 + (i - (n - 1) / 2) * w, y: 975 };
};

const Heads = ({ cids, players }) => (
  <span className="lq-heads">
    {cids.slice(0, 8).map((cid) => {
      const p = players.find((x) => x.cid === cid);
      return p ? <Person key={cid} look={p.look} view="head" /> : null;
    })}
    {cids.length > 8 && <b>+{cids.length - 8}</b>}
  </span>
);

const Leaderboard = ({ game, players, final }) => {
  const ranks = ranking(game);
  const prev = game.prevRanks || {};
  const gains = game.last?.gains || {};
  const top = ranks[0]?.score || 1;
  return (
    <div className={`lq-board${ranks.length > 6 ? ' is-two' : ''}`}>
      {ranks.map((r) => {
        const p = players.find((x) => x.cid === r.cid);
        const move = (prev[r.cid] || r.rank) - r.rank;
        return (
          <div key={r.cid} className={`lq-row${r.rank === 1 ? ' is-top' : ''}`}>
            <span className="lq-rank">{ordinal(r.rank)}</span>
            {p && <Person look={p.look} view="head" />}
            <span className="lq-name">{r.name}</span>
            <span className="lq-bar"><i style={{ width: `${Math.max(3, (r.score / Math.max(1, top)) * 100)}%` }} /></span>
            <span className="lq-score">{r.score.toLocaleString()}</span>
            {!final && <span className={`lq-move${move > 0 ? ' up' : move < 0 ? ' down' : ''}`}>{move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : gains[r.cid]?.gain ? `+${gains[r.cid].gain}` : ''}</span>}
          </div>
        );
      })}
    </div>
  );
};

/** Fright Quiz on the TV. */
export default function QuizStage({ game, players, now, onLobby, onAgain }) {
  const lastEvent = useRef(0);
  const lastSecond = useRef(null);
  const q = game.questions[game.index];
  const elapsed = now - game.phaseAt;
  const left = game.phase === 'answer' ? Math.max(0, ANSWER_MS - elapsed) : 0;
  const seconds = Math.ceil(left / 1000);

  useEffect(() => {
    game.events.filter((e) => e.id > lastEvent.current).forEach((e) => {
      lastEvent.current = e.id;
      switch (e.type) {
        case 'round': sfx.night(); break;
        case 'question': sfx.spawn(); break;
        case 'open': sfx.join(); break;
        case 'answer': sfx.hit(); break;
        case 'reveal': if (e.right) sfx.banish(); else sfx.fizzle(); break;
        case 'scores': sfx.soulDone(); break;
        case 'final': sfx.won(); break;
        default: break;
      }
    });
    if (game.phase === 'answer' && seconds <= 5 && seconds > 0 && lastSecond.current !== seconds) sfx.tick();
    lastSecond.current = seconds;
  });

  const reveal = game.phase === 'reveal' ? game.last : null;
  const ranks = ranking(game);
  const rankOf = Object.fromEntries(ranks.map((r) => [r.cid, r.rank]));
  const poseFor = (cid) => {
    if (reveal) return reveal.gains[cid]?.right ? 'cheer' : 'scared';
    if (game.phase === 'final') return rankOf[cid] === 1 ? 'cheer' : 'wave';
    if (game.phase === 'answer' && game.answers[cid]) return 'wave';
    return 'stand';
  };
  const showQuestion = ['read', 'answer', 'reveal'].includes(game.phase);
  const mult = multiplier(game.index);
  const qInRound = (game.index % ROUND_SIZE) + 1;
  const answeredCount = Object.keys(game.answers).length;
  const pickers = (i) => Object.entries(game.answers).filter(([, a]) => a.choice === i).map(([cid]) => cid);
  const fastest = reveal?.fastestCid ? players.find((p) => p.cid === reveal.fastestCid) : null;

  return (
    <>
      <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
        <QuizBackdrop lights={Math.floor(now / 700)} />
        {game.phase !== 'final' && players.map((p, i) => {
          const s = standAt(i, players.length);
          const g = reveal?.gains[p.cid];
          return (
            <g key={p.cid}>
              <ScenePerson look={p.look} pose={poseFor(p.cid)} k={0} x={s.x} y={s.y} delay={i % 4} scale={0.5} />
              <PlayerTag name={p.name} vip={i === 0} x={s.x} y={s.y + 18} />
              {game.phase === 'answer' && game.answers[p.cid] && (
                <g transform={`translate(${s.x} ${s.y - 215})`}>
                  <circle r="24" fill="#3ddc97" stroke="#16122b" strokeWidth="4" />
                  <text y="2" fontSize="26" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#16122b">✓</text>
                </g>
              )}
              {g && (
                <text x={s.x} y={s.y - 215 - Math.min(1, elapsed / 800) * 30} fontSize="34" fontWeight="900" textAnchor="middle" fill={g.right ? '#ffe066' : '#ff6b6b'} stroke="#16122b" strokeWidth="6" paintOrder="stroke">
                  {g.right ? `+${g.gain}` : '✗'}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {showQuestion && (
        <div className="lq-hud">
          <span className="lq-pill">Question {game.index + 1} of {game.questions.length}</span>
          <span className="lq-pill">{ROUNDS[roundOf(game.index)].title} · {qInRound}/{ROUND_SIZE}</span>
          {mult > 1 && <span className="lq-pill is-double">x2 points!</span>}
          {game.phase === 'answer' && <span className="lq-pill">{answeredCount} of {players.length} answered</span>}
        </div>
      )}

      {showQuestion && (
        <div className="lq-main" key={game.index}>
          <div className="lq-question">
            <p>{q.text}</p>
            {game.phase === 'answer' && (
              <div className={`lq-timer${seconds <= 5 ? ' is-low' : ''}`}>
                <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" className="lq-timer-bg" /><circle cx="50" cy="50" r="44" className="lq-timer-fg" style={{ strokeDashoffset: `${(1 - left / ANSWER_MS) * 276.5}` }} /></svg>
                <b>{seconds}</b>
              </div>
            )}
          </div>
          {game.phase === 'read' ? (
            <div className="lq-ready">Get ready… {Math.max(1, Math.ceil((READ_MS - elapsed) / 1000))}</div>
          ) : (
            <div className="lq-answers">
              {q.answers.map((text, i) => {
                const right = reveal && i === reveal.correct;
                return (
                  <div key={i} className={`lq-answer${reveal ? (right ? ' is-right' : ' is-wrong') : ''}`} style={{ '--c': ANSWER_STYLE[i].color, animationDelay: `${i * 0.08}s` }}>
                    <span className="lq-answer-icon">{ANSWER_STYLE[i].icon}</span>
                    <span className="lq-answer-text">{text}</span>
                    {reveal && <Heads cids={pickers(i)} players={players} />}
                    {right && <span className="lq-check">✓</span>}
                  </div>
                );
              })}
            </div>
          )}
          {reveal && (
            <div className="lq-callout">
              {fastest ? <>⚡ Fastest: <b>{fastest.name}</b> in {(reveal.fastestMs / 1000).toFixed(1)}s</> : 'Nobody got that one! 👻'}
              {Object.entries(reveal.gains).filter(([, g]) => g.streak >= 3).slice(0, 3).map(([cid, g]) => (
                <span key={cid}> · 🔥 {players.find((p) => p.cid === cid)?.name} is on a {g.streak}-streak</span>
              ))}
            </div>
          )}
        </div>
      )}

      {game.phase === 'round' && (
        <div className="lc-card lq-round" key={`r${game.index}`}>
          <div className="lc-card-kicker">Fright Quiz · questions {game.index + 1} to {Math.min(game.questions.length, game.index + ROUND_SIZE)}</div>
          <h2 className="lc-title">{ROUNDS[roundOf(game.index)].title}</h2>
          <p>{ROUNDS[roundOf(game.index)].blurb}</p>
          <div className="lc-countdown">{Math.max(1, Math.ceil((ROUND_MS - elapsed) / 1000))}</div>
        </div>
      )}

      {game.phase === 'scores' && (
        <div className="lc-card lq-scores">
          <div className="lc-card-kicker">After {game.index + 1} of {game.questions.length} questions</div>
          <h2 className="lc-title">Scoreboard</h2>
          <Leaderboard game={game} players={players} />
          {roundOf(game.index + 1) === ROUNDS.length - 1 && <p className="lq-next">Next: <b>Double Trouble</b>. Every point counts twice!</p>}
        </div>
      )}

      {game.phase === 'final' && (
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
            {awards(game).filter((a) => a.title !== 'Fright Quiz Champ').map((a) => {
              const p = players.find((x) => x.cid === a.cid);
              return p ? <span key={a.title}>🏆 <b>{a.title}</b> {p.name} <small>({a.blurb})</small></span> : null;
            })}
          </div>
          <div className="lc-end-actions">
            <button type="button" className="lc-btn" onClick={onLobby}>Back to the lobby</button>
            <button type="button" className="lc-btn lc-btn-ghost" onClick={onAgain}>Play again</button>
          </div>
        </div>
      )}
    </>
  );
}
