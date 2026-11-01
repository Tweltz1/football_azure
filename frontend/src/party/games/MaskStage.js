import React, { useEffect, useRef } from 'react';
import Person from '../Person';
import { sfx } from '../sound';
import { PlayerTag, ScenePerson } from '../scene';
import {
  awards, BITE_MS, HINTS, CLUE_MS, isVampire, ranking, ROLE_MS, ROUNDS, SHOW_EACH_MS, TALK_MS, UNMASK_EACH_MS, VOTE_MS,
} from './mask';
import { QuizBackdrop } from './QuizStage';
import { Leaderboard, Podium } from './Results';

export const MASK_CURTAIN = ['#3a1f5c', '#5b2d8e', '#2a1645'];
const CARD_COLORS = ['#9b7bff', '#ff8a2a', '#3ddc97', '#ff5fa2', '#4fc3ff', '#ffe066'];

const standAt = (i, n) => {
  const w = Math.min(150, 1500 / Math.max(1, n));
  return { x: 960 + (i - (n - 1) / 2) * w, y: 975 };
};

const Timer = ({ left, total }) => (
  <div className="lm-timer"><span style={{ width: `${Math.max(0, Math.min(1, left / total)) * 100}%` }} /><b>{Math.ceil(left / 1000)}</b></div>
);

const vampWord = (n) => (n === 1 ? 'one vampire' : `${n === 2 ? 'two' : 'three'} vampires`);

/** A masquerade mask, drawn over someone's head until they're unmasked. */
export const MaskBadge = ({ x, y, state }) => {
  if (state === 'vampire' || state === 'human') {
    return (
      <g transform={`translate(${x} ${y})`}>
        <circle r="30" fill={state === 'vampire' ? '#ff3d5a' : '#3ddc97'} stroke="#16122b" strokeWidth="5" />
        <text y="3" fontSize="34" textAnchor="middle" dominantBaseline="central">{state === 'vampire' ? '🧛' : '😇'}</text>
      </g>
    );
  }
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-40 -6 C-30 -26 -8 -20 0 -10 C8 -20 30 -26 40 -6 C34 14 12 16 0 4 C-12 16 -34 14 -40 -6 Z" fill="#8b5cf6" stroke="#16122b" strokeWidth="5" strokeLinejoin="round" />
      <ellipse cx="-18" cy="-4" rx="9" ry="6" fill="#16122b" />
      <ellipse cx="18" cy="-4" rx="9" ry="6" fill="#16122b" />
      {state === 'done' && <circle cx="38" cy="-24" r="14" fill="#3ddc97" stroke="#16122b" strokeWidth="4" />}
      {state === 'done' && <text x="38" y="-23" fontSize="16" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#16122b">✓</text>}
    </g>
  );
};

/** Who's Behind the Mask? on the TV. */
export default function MaskStage({ game, players, now, onLobby, onAgain }) {
  const lastEvent = useRef(0);
  const elapsed = now - game.phaseAt;

  useEffect(() => {
    game.events.filter((e) => e.id > lastEvent.current).forEach((e) => {
      lastEvent.current = e.id;
      switch (e.type) {
        case 'round': sfx.night(); break;
        case 'clue': sfx.join(); break;
        case 'clued': case 'voted': case 'ready': sfx.hit(); break;
        case 'show': sfx.spawn(); break;
        case 'vote': sfx.boss(); break;
        case 'unmask': sfx.whoosh(); break;
        case 'bite': sfx.candle(); break;
        case 'bit': if (e.right) sfx.boss(); else sfx.fizzle(); break;
        case 'result': if (e.caught) sfx.banish(); else sfx.lost(); break;
        case 'scores': sfx.soul(); break;
        case 'final': sfx.won(); break;
        default: break;
      }
    });
  });

  const ranks = ranking(game);
  const inCast = (cid) => game.cast.includes(cid);
  // Which unmasking we're on, and whether its face is showing yet.
  const unmaskStep = game.phase === 'unmask' ? Math.min(game.unmasked.length - 1, Math.floor(elapsed / UNMASK_EACH_MS)) : -1;
  const unmaskShown = (i) => game.phase !== 'unmask' || i < unmaskStep || (i === unmaskStep && elapsed - i * UNMASK_EACH_MS > 1800);
  const revealedAll = ['result', 'scores'].includes(game.phase);
  const badge = (cid) => {
    const ui = game.unmasked.indexOf(cid);
    if (revealedAll) return isVampire(game, cid) ? 'vampire' : 'mask';
    if (ui >= 0 && ['unmask', 'bite'].includes(game.phase) && unmaskShown(ui) && (game.phase !== 'unmask' || ui <= unmaskStep)) return isVampire(game, cid) ? 'vampire' : 'human';
    if (game.phase === 'clue' && game.clues[cid]) return 'done';
    if (game.phase === 'talk' && game.ready[cid]) return 'done';
    if (game.phase === 'vote' && game.votes[cid]) return 'done';
    return 'mask';
  };
  const poseFor = (cid) => {
    const b = badge(cid);
    if (b === 'vampire') return revealedAll && !game.unmasked.includes(cid) ? 'cheer' : 'scared';
    if (b === 'human') return 'wave';
    if (b === 'done') return 'wave';
    return 'stand';
  };
  const clues = game.order.map((cid) => ({ cid, text: game.clues[cid], p: players.find((x) => x.cid === cid) }));
  const shownClues = game.phase === 'show' ? Math.floor(elapsed / SHOW_EACH_MS) + 1 : clues.length;
  const showBoard = ['show', 'talk', 'vote', 'unmask', 'bite'].includes(game.phase);
  const cur = game.phase === 'unmask' && unmaskStep >= 0 ? game.unmasked[unmaskStep] : null;
  const curP = cur && players.find((p) => p.cid === cur);
  const count = (cid) => game.counts[cid] || 0;

  return (
    <>
      <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
        <QuizBackdrop lights={Math.floor(now / 700)} curtain={MASK_CURTAIN} />
        {game.phase !== 'final' && game.phase !== 'scores' && players.map((p, i) => {
          const s = standAt(i, players.length);
          return (
            <g key={p.cid} opacity={inCast(p.cid) ? 1 : 0.5}>
              <ScenePerson look={p.look} pose={poseFor(p.cid)} k={0} x={s.x} y={s.y} delay={i % 4} scale={0.5} />
              <PlayerTag name={p.name} vip={i === 0} x={s.x} y={s.y + 18} />
              {inCast(p.cid) && <MaskBadge x={s.x} y={s.y - 225} state={badge(p.cid)} />}
              {['unmask', 'bite', 'result'].includes(game.phase) && count(p.cid) > 0 && (
                <text x={s.x + 34} y={s.y - 262} fontSize="26" fontWeight="900" fill="#ffe066" stroke="#16122b" strokeWidth="5" paintOrder="stroke">{`🗳️${count(p.cid)}`}</text>
              )}
            </g>
          );
        })}
      </svg>

      {!['final', 'scores'].includes(game.phase) && (
        <div className="lq-hud">
          <span className="lq-pill">Round {game.round + 1} of {ROUNDS}</span>
          <span className="lq-pill">Category: <b>{game.category}</b></span>
          <span className="lq-pill is-double">🧛 x{game.vampires.length}</span>
          {game.phase === 'clue' && <span className="lq-pill">{Object.keys(game.clues).length} of {game.cast.length} clues in</span>}
          {game.phase === 'vote' && <span className="lq-pill">{Object.keys(game.votes).length} of {game.cast.length} voted</span>}
        </div>
      )}

      {game.phase === 'role' && (
        <div className="lc-card lq-round lk-card" key={`r${game.round}`}>
          <div className="lc-card-kicker">Who&apos;s Behind the Mask? · Round {game.round + 1}</div>
          <h2 className="lc-title">📱 Check your phone!</h2>
          <p><b>Humans</b> see the secret word. <b>{vampWord(game.vampires.length).replace(/^./, (c) => c.toUpperCase())}</b> only see{game.vampires.length === 1 ? 's' : ''} a shortlist of {HINTS} possible words, and {game.vampires.length === 1 ? 'has' : 'have'} to fake it.</p>
          <div className="lc-countdown">{Math.max(1, Math.ceil((ROLE_MS - elapsed) / 1000))}</div>
        </div>
      )}

      {game.phase === 'clue' && (
        <div className="lc-card lm-write lk-card">
          <div className="lc-card-kicker">Category: {game.category}</div>
          <h2 className="lc-title">✍️ Write a one-word clue</h2>
          <p>Humans: hint at the word without saying it. Too obvious and the vampires figure it out! Vampires: pick a clue that could fit.</p>
          <Timer left={Math.max(0, CLUE_MS - elapsed)} total={CLUE_MS} />
        </div>
      )}

      {showBoard && (
        <div className="lq-main lk-main">
          <div className="lk-clues">
            {clues.slice(0, shownClues).map((c, i) => (
              <div key={c.cid} className={`lk-clue${['unmask', 'bite'].includes(game.phase) && game.unmasked.includes(c.cid) && badge(c.cid) !== 'mask' ? (isVampire(game, c.cid) ? ' is-vamp' : ' is-human') : ''}`} style={{ '--c': CARD_COLORS[i % CARD_COLORS.length] }}>
                {c.p && <Person look={c.p.look} view="head" />}
                <span className="lk-clue-name">{c.p?.name}</span>
                <b className="lk-clue-text">{c.text}</b>
              </div>
            ))}
            {!clues.length && <div className="lq-ready">Nobody wrote a clue… suspicious 👀</div>}
          </div>
          {game.phase === 'talk' && (
            <>
              <div className="lq-callout">🗣️ Who&apos;s faking it? Talk it out, then tap Ready on your phone.</div>
              <Timer left={Math.max(0, TALK_MS - elapsed)} total={TALK_MS} />
            </>
          )}
          {game.phase === 'vote' && (
            <>
              <div className="lq-callout">🗳️ Vote on your phone: who&apos;s behind the mask?</div>
              <Timer left={Math.max(0, VOTE_MS - elapsed)} total={VOTE_MS} />
            </>
          )}
          {game.phase === 'bite' && (
            <div className="lk-bite">
              <p>🧛 Caught! The vampires get one last bite: can they guess the secret word?</p>
              <div className="lk-bite-options">
                {game.options.map((w) => (
                  <span key={w} className={game.bite?.guess === w ? (game.bite.right ? 'is-right' : 'is-wrong') : ''}>{w}</span>
                ))}
              </div>
              {game.bite ? <b className="lk-bite-said">{game.bite.right ? 'They got it! 🩸' : 'Wrong! The humans hold on.'}</b> : <Timer left={Math.max(0, BITE_MS - elapsed)} total={BITE_MS} />}
            </div>
          )}
        </div>
      )}

      {game.phase === 'unmask' && (
        <div className="lk-unmask" key={`u${unmaskStep}`}>
          {curP ? (
            <>
              <Person look={curP.look} view="head" />
              <p>{curP.name} was…</p>
              {elapsed - unmaskStep * UNMASK_EACH_MS > 1800 && (
                <h2 className={`lc-title ${isVampire(game, cur) ? 'is-vamp' : 'is-human'}`}>{isVampire(game, cur) ? 'A VAMPIRE! 🧛' : 'Only human 😇'}</h2>
              )}
            </>
          ) : <p>Nobody voted… the vampires slip away!</p>}
        </div>
      )}

      {game.phase === 'result' && (
        <div className="lc-card lq-scores lk-result">
          <div className="lc-card-kicker">The secret word was</div>
          <h2 className="lc-title">{game.word}</h2>
          <div className="lk-reveal">
            {game.vampires.map((cid) => {
              const p = players.find((x) => x.cid === cid);
              const caught = game.unmasked.includes(cid);
              return (
                <div key={cid} className={`lk-vamp${caught ? ' is-caught' : ''}`}>
                  {p && <Person look={p.look} view="head" />}
                  <span>🧛 {p?.name}</span>
                  <small>{caught ? 'Caught!' : 'Got away!'}</small>
                </div>
              );
            })}
          </div>
          <div className="lk-gains">
            {ranks.filter((r) => game.gains[r.cid]).map((r) => <span key={r.cid}>{r.name} <b>+{game.gains[r.cid].gain}</b></span>)}
          </div>
        </div>
      )}

      {game.phase === 'scores' && (
        <div className="lc-card lq-scores">
          <div className="lc-card-kicker">After round {game.round + 1}</div>
          <h2 className="lc-title">Scoreboard</h2>
          <Leaderboard ranks={ranks} prev={game.prevRanks} players={players} />
          <p className="lq-next">Next: <b>Round {game.round + 2}</b>. New word, new vampires. Trust no one!</p>
        </div>
      )}

      {game.phase === 'final' && <Podium ranks={ranks} players={players} awards={awards(game)} onLobby={onLobby} onAgain={onAgain} />}
    </>
  );
}
