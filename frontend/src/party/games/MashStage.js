import React, { useEffect, useRef } from 'react';
import Person from '../Person';
import { sfx } from '../sound';
import { PlayerTag, ScenePerson } from '../scene';
import {
  awards, FINAL_VOTE_MS, FINAL_WRITE_MS, isFinalRound, options, pointsPerVote, ranking, ROUND_MS, ROUNDS, todo, VOTE_MS, voters, WRITE_MS,
} from './mash';
import { QuizBackdrop } from './QuizStage';
import { Leaderboard, Podium } from './Results';

const CURTAIN = ['#1f4a2e', '#2f6b3f', '#163a24'];
const CARD_COLORS = ['#9b7bff', '#ff8a2a', '#3ddc97', '#ff5fa2', '#4fc3ff', '#ffe066'];

const standAt = (i, n) => {
  const w = Math.min(150, 1500 / Math.max(1, n));
  return { x: 960 + (i - (n - 1) / 2) * w, y: 975 };
};

const Timer = ({ left, total }) => (
  <div className="lm-timer"><span style={{ width: `${Math.max(0, Math.min(1, left / total)) * 100}%` }} /><b>{Math.ceil(left / 1000)}</b></div>
);

/** Monster Mash-up on the TV. */
export default function MashStage({ game, players, now, onLobby, onAgain }) {
  const lastEvent = useRef(0);
  const elapsed = now - game.phaseAt;
  const final = isFinalRound(game);
  const m = game.matchups[game.current];

  useEffect(() => {
    game.events.filter((e) => e.id > lastEvent.current).forEach((e) => {
      lastEvent.current = e.id;
      switch (e.type) {
        case 'round': sfx.night(); break;
        case 'write': sfx.join(); break;
        case 'wrote': sfx.hit(); break;
        case 'vote': sfx.spawn(); break;
        case 'voted': sfx.hit(); break;
        case 'skip': sfx.fizzle(); break;
        case 'reveal': if (e.mashup) sfx.soulDone(); else sfx.banish(); break;
        case 'scores': sfx.soul(); break;
        case 'final': sfx.won(); break;
        default: break;
      }
    });
  });

  const ranks = ranking(game);
  const reveal = game.phase === 'reveal' && m?.result && !m.result.skipped ? m.result : null;
  const showAuthors = reveal && elapsed > 1200;
  const doneWriting = (cid) => todo(game, cid).length === 0;
  const canVote = m && game.phase === 'vote' ? new Set(voters(game, m, now).map((p) => p.cid)) : new Set();
  const poseFor = (cid) => {
    if (game.phase === 'final') return ranks[0]?.cid === cid ? 'cheer' : 'wave';
    if (reveal && reveal.gains[cid]) return reveal.gains[cid].winner ? 'cheer' : 'scared';
    if (game.phase === 'write') return doneWriting(cid) ? 'wave' : 'stand';
    return 'stand';
  };
  const writeTotal = final ? FINAL_WRITE_MS : WRITE_MS;
  const voteTotal = final ? FINAL_VOTE_MS : VOTE_MS;
  const opts = m ? options(m) : [];
  const writers = game.players.filter((p) => game.matchups.some((x) => x.authors.includes(p.cid)));
  const writtenCount = writers.filter((p) => doneWriting(p.cid)).length;
  const votedCount = m ? Object.keys(m.votes).length : 0;

  return (
    <>
      <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
        <QuizBackdrop lights={Math.floor(now / 700)} curtain={CURTAIN} />
        {game.phase !== 'final' && !(opts.length > 2 && ['vote', 'reveal'].includes(game.phase)) && players.map((p, i) => {
          const s = standAt(i, players.length);
          const busy = game.phase === 'write' && writers.some((w) => w.cid === p.cid) && !doneWriting(p.cid);
          const done = (game.phase === 'write' && !busy && writers.some((w) => w.cid === p.cid)) || (game.phase === 'vote' && m?.votes[p.cid]);
          const g = reveal?.gains[p.cid];
          return (
            <g key={p.cid}>
              <ScenePerson look={p.look} pose={poseFor(p.cid)} k={0} x={s.x} y={s.y} delay={i % 4} scale={0.5} />
              <PlayerTag name={p.name} vip={i === 0} x={s.x} y={s.y + 18} />
              {(busy || done || (game.phase === 'vote' && canVote.has(p.cid))) && (
                <g transform={`translate(${s.x} ${s.y - 215})`}>
                  <circle r="24" fill={done ? '#3ddc97' : '#fff6e3'} stroke="#16122b" strokeWidth="4" />
                  <text y="2" fontSize="24" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#16122b">{done ? '✓' : busy ? '✍️' : '🗳️'}</text>
                </g>
              )}
              {g && showAuthors && (
                <text x={s.x} y={s.y - 215 - Math.min(1, (elapsed - 1200) / 800) * 30} fontSize="34" fontWeight="900" textAnchor="middle" fill="#ffe066" stroke="#16122b" strokeWidth="6" paintOrder="stroke">
                  {g.gain ? `+${g.gain}` : '0'}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {['write', 'vote', 'reveal', 'skip'].includes(game.phase) && (
        <div className="lq-hud">
          <span className="lq-pill">{ROUNDS[game.round].title}</span>
          {game.phase !== 'write' && !final && <span className="lq-pill">Matchup {game.current + 1} of {game.matchups.length}</span>}
          <span className="lq-pill">{pointsPerVote(game.round)} pts a vote</span>
          {game.phase === 'write' && <span className="lq-pill">{writtenCount} of {writers.length} done</span>}
          {game.phase === 'vote' && <span className="lq-pill">{votedCount} of {canVote.size} voted</span>}
        </div>
      )}

      {game.phase === 'round' && (
        <div className="lc-card lq-round" key={`r${game.round}`}>
          <div className="lc-card-kicker">Monster Mash-up</div>
          <h2 className="lc-title">{ROUNDS[game.round].title}</h2>
          <p>{ROUNDS[game.round].blurb}</p>
          <div className="lc-countdown">{Math.max(1, Math.ceil((ROUND_MS - elapsed) / 1000))}</div>
        </div>
      )}

      {game.phase === 'write' && (
        <div className="lc-card lm-write">
          <div className="lc-card-kicker">{final ? 'Everyone gets the same prompt' : 'Check your phone'}</div>
          <h2 className="lc-title">✍️ Write your answers!</h2>
          <p>{final ? 'One last prompt for the whole room. Make it count, votes are worth triple.' : 'Keep it short and funny. Nobody sees who wrote what until the votes are in.'}</p>
          <Timer left={Math.max(0, writeTotal - elapsed)} total={writeTotal} />
        </div>
      )}

      {m && ['vote', 'reveal', 'skip'].includes(game.phase) && (
        <div className="lq-main lm-main" key={`m${game.round}-${game.current}`}>
          <div className="lq-question lm-prompt">
            <p>{m.prompt}</p>
          </div>
          {game.phase === 'skip' ? (
            <div className="lq-ready">Nobody answered this one 👻</div>
          ) : (
            <div className={`lm-answers${opts.length > 2 ? ' is-many' : ''}${opts.length > 6 ? ' is-lots' : ''}`}>
              {opts.map((o, i) => {
                const author = players.find((p) => p.cid === o.cid);
                const g = reveal?.gains[o.cid];
                const votersFor = reveal ? Object.entries(m.votes).filter(([, pick]) => pick === o.cid).map(([cid]) => cid) : [];
                return (
                  <React.Fragment key={o.cid}>
                    {opts.length === 2 && i === 1 && <div className="lm-vs">VS</div>}
                    <div className={`lm-answer${g?.winner ? ' is-win' : ''}${reveal && !g?.winner ? ' is-lose' : ''}`} style={{ '--c': CARD_COLORS[i % CARD_COLORS.length], animationDelay: `${i * 0.12}s` }}>
                      <span className="lm-answer-text">{o.text}</span>
                      {reveal && (
                        <div className="lm-votes">
                          <b>{g?.votes || 0} vote{g?.votes === 1 ? '' : 's'}</b>
                          <span className="lq-heads">
                            {votersFor.slice(0, 8).map((cid) => {
                              const v = players.find((x) => x.cid === cid);
                              return v ? <Person key={cid} look={v.look} view="head" /> : null;
                            })}
                          </span>
                        </div>
                      )}
                      {showAuthors && author && (
                        <div className="lm-author">
                          <Person look={author.look} view="head" />
                          <span>{author.name}</span>
                          {g?.gain > 0 && <b>+{g.gain}</b>}
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}
          {game.phase === 'vote' && <Timer left={Math.max(0, voteTotal - elapsed)} total={voteTotal} />}
          {reveal && Object.values(reveal.gains).some((g) => g.mashup) && elapsed > 1200 && (
            <div className="lm-mashup">MONSTER MASH-UP! 🧟 Every vote!</div>
          )}
          {game.phase === 'vote' && <div className="lq-callout">Vote on your phone for the funniest answer!</div>}
        </div>
      )}

      {game.phase === 'scores' && (
        <div className="lc-card lq-scores">
          <div className="lc-card-kicker">After {ROUNDS[game.round].title}</div>
          <h2 className="lc-title">Scoreboard</h2>
          <Leaderboard ranks={ranks} prev={game.prevRanks} players={players} />
          <p className="lq-next">Next: <b>{ROUNDS[game.round + 1].title}</b>. {ROUNDS[game.round + 1].blurb}</p>
        </div>
      )}

      {game.phase === 'final' && (
        <Podium ranks={ranks} players={players} awards={awards(game).filter((a) => a.title !== 'Monster Mash Champ')} onLobby={onLobby} onAgain={onAgain} />
      )}
    </>
  );
}
