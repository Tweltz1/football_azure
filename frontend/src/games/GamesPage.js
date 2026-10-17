import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SoundToggle from '../components/SoundToggle';
import { CREW } from '../data/crew';
import { GAME_KINDS, GAMES } from './sim.generated';
import GamePlayer from './GamePlayer';
import { practiceRunner, readBests } from './gameRunners';
import './Games.css';

// Which crew member shows on each game's card.
export const GAME_ART = { climb: 8, fieldgoal: 4, penalty: 5, price: 7, nameplayer: 1 };

/** The Games tab: practice any lobby game as often as you like. Bests are kept on this device. */
const GamesPage = () => {
  const [params, setParams] = useSearchParams();
  const game = GAME_KINDS.includes(params.get('game')) ? params.get('game') : null;
  const [round, setRound] = useState(0);
  // A fresh runner (new random seed) for every round.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const runner = useMemo(() => (game ? practiceRunner(game) : null), [game, round]);
  const bests = readBests();

  const pick = (kind) => setParams(kind ? { game: kind } : {});

  return (
    <div className="games-page">
      <div className="games-header">
        <div>
          <p className="section-kicker">Draft games</p>
          <h2>Games</h2>
          <p className="games-sub">Practice here as much as you want. In the draft lobby the commissioner can put up a game for extra draft dollars, and everyone gets one official try.</p>
        </div>
        <SoundToggle />
      </div>
      {game ? (
        <GamePlayer
          key={`${game}-${round}`}
          game={game}
          runner={runner}
          onDone={() => pick(null)}
          onAgain={() => setRound((n) => n + 1)}
        />
      ) : (
        <div className="games-grid">
          {GAME_KINDS.map((kind) => (
            <button type="button" key={kind} className="game-card" onClick={() => pick(kind)}>
              <img src={CREW[GAME_ART[kind]].art} alt="" />
              <span className="game-card-text">
                <strong>{GAMES[kind].title}</strong>
                <span>{GAMES[kind].blurb}</span>
                {bests[kind] != null && <span className="game-card-best">Your best: {bests[kind]} {GAMES[kind].unit}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default GamesPage;
