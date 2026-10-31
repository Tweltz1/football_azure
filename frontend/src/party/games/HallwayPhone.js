import React from 'react';
import Person from '../Person';
import { COLORS, HANDLES, SYMBOLS, WINDOWS } from './hallway';

const color = (id) => COLORS.find((c) => c.id === id);
const icon = (id) => SYMBOLS.find((x) => x.id === id)?.icon;
const windowName = (id) => WINDOWS.find((w) => w.id === id)?.name.replace(/^an? /, '');
const handleName = (id) => HANDLES.find((h) => h.id === id)?.name.replace(/^an? /, '');

/** Haunted Hallway on a phone: guides see clues, everyone votes for a door. */
export default function HallwayPhone({ screen, send, look, header }) {
  const game = screen.game;
  const result = screen.result;
  const head = (
    <div className="lcp-gamehead">
      <span>Floor {game.floor} / {game.floors}</span>
      <span>{'🏮'.repeat(Math.max(0, game.lanterns))}</span>
      <span>{game.score.toLocaleString()} pts</span>
    </div>
  );

  if (result) {
    const won = game.phase === 'won';
    return (
      <div className="lcp">
        {header}
        <div className={`lcp-end ${game.phase}`}>
          <Person look={look} pose={won ? 'cheer' : 'scared'} />
          <h2 className="lc-title">{won ? 'You escaped!' : 'Lights out…'}</h2>
          <p>Team score {result.score.toLocaleString()} · {result.right} safe door{result.right === 1 ? '' : 's'} picked</p>
          {result.awards.map((a) => <div key={a} className="lcp-award">🏆 {a}</div>)}
          {screen.vip ? <button type="button" className="lc-btn lc-btn-big" onClick={() => send('again')}>Back to the lobby</button> : <p className="lcp-fine">Waiting for 👑 to pick the next game.</p>}
        </div>
      </div>
    );
  }

  if (game.phase === 'vote') {
    return (
      <div className="lcp lcp-game">
        {head}
        {game.guide ? (
          <div className="lcp-clues">
            <b>🔦 You're a guide! Read these out loud:</b>
            <ul>{game.clues.map((c) => <li key={c}>{c}</li>)}</ul>
            <small>The other guide has different clues. Put them together!</small>
          </div>
        ) : (
          <p className="lcp-quiz-ask">🔦 Listen to {game.guideNames.join(' & ')} and pick the safe door · {Math.ceil(game.left / 1000)}s</p>
        )}
        <div className="lcp-doors">
          {game.doors.map((d, i) => (
            <button type="button" key={i} className={`lcp-door${game.vote === i ? ' is-on' : ''}`} style={{ background: color(d.color)?.hex }} onClick={() => send('act', { type: 'vote', door: i })}>
              <span className="lcp-door-num">{i + 1}</span>
              <span className="lcp-door-icon">{icon(d.symbol)}</span>
              <small>{color(d.color)?.name} · {windowName(d.window)}{d.handle ? ` · ${handleName(d.handle)}` : ''}</small>
              {game.vote === i && <span className="lcp-door-mine">✓ your pick</span>}
            </button>
          ))}
        </div>
        <p className="lcp-fine">You can change your vote until the door opens.</p>
      </div>
    );
  }

  let face = 'stand';
  let big = '👀 Look at the TV';
  let line = '';
  if (game.phase === 'floor') {
    big = `Floor ${game.floor}`;
    line = game.guide ? "🔦 You're a guide this floor! Your clues are coming up." : `Your guides are ${game.guideNames.join(' & ')}. Listen up!`;
  } else if (game.phase === 'reveal' && game.chosen) {
    face = game.chosen.safe ? 'cheer' : 'scared';
    big = game.chosen.safe ? '✅ Safe! Up the stairs!' : '👻 A monster! -1 lantern';
    line = game.chosen.safe ? '' : `The safe door was number ${game.chosen.safeDoor + 1}.`;
  }
  return (
    <div className="lcp lcp-game">
      {head}
      <div className="lcp-wait">
        <Person look={look} pose={face} />
        <p className="lcp-big">{big}</p>
        {line && <p>{line}</p>}
      </div>
    </div>
  );
}
