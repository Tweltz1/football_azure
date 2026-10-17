import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../api';
import { CREW } from '../data/crew';
import { GAME_KINDS, GAMES } from './sim.generated';
import { MAPS } from './race/raceSim';
import { errorText } from './gameRunners';

// Which crew member shows on each board's tab.
const ART = { climb: 8, fieldgoal: 4, penalty: 5, price: 7, nameplayer: 1, race: 6 };

const BOARDS = [
  { key: 'race-wins', game: 'race', board: 'wins', label: 'Fun Run wins' },
  { key: 'race-time', game: 'race', board: null, label: 'Fun Run fastest' },
  ...GAME_KINDS.map((kind) => ({ key: kind, game: kind, board: 'all', label: GAMES[kind].title })),
];

const scoreText = (pick, row) => {
  if (pick.game === 'race') return pick.board === 'wins' ? `${row.score} ${row.score === 1 ? 'win' : 'wins'}` : row.detail;
  return `${row.score} ${GAMES[pick.game].unit}`;
};

/**
 * Best scores from everyone signed in: Fun Run wins (live rooms with two or more players) and fastest
 * times per map, and each mini-game's best. Only games the server dealt or replayed count.
 */
const Leaderboards = ({ initial = 'race-wins' }) => {
  const [key, setKey] = useState(initial);
  const [map, setMap] = useState(MAPS[0].key);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const pick = BOARDS.find((b) => b.key === key) || BOARDS[0];
  const board = pick.board ?? `time-${map}`;

  useEffect(() => {
    let live = true;
    setData(null);
    setError('');
    axios.get(`${API_BASE_URL}/games/leaderboard`, { params: { game: pick.game, board } })
      .then((res) => live && setData(res.data))
      .catch((e) => live && setError(errorText(e)));
    return () => { live = false; };
  }, [pick.game, board]);

  const inTop = data?.rows.some((r) => r.me);
  return (
    <section className="leaderboards" aria-label="Leaderboards">
      <div className="leaderboards-head">
        <h3>Leaderboards</h3>
        <select value={key} onChange={(e) => setKey(e.target.value)} aria-label="Leaderboard">
          {BOARDS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
        </select>
      </div>
      {pick.board == null && (
        <div className="leaderboards-maps" role="tablist" aria-label="Map">
          {MAPS.map((m) => (
            <button key={m.key} type="button" role="tab" aria-selected={m.key === map} className={m.key === map ? 'is-picked' : ''} onClick={() => setMap(m.key)}>
              {m.name}
            </button>
          ))}
        </div>
      )}
      {error && <p className="game-error">{error}</p>}
      {!data && !error && <p className="game-hint">Loading...</p>}
      {data && data.rows.length === 0 && <p className="game-hint">Nobody on this board yet. Play to be first.</p>}
      {data && data.rows.length > 0 && (
        <ol className="leaderboard-rows">
          {data.rows.map((row, index) => (
            <li key={`${row.name}-${index}`} className={row.me ? 'is-me' : ''}>
              <span className="leaderboard-rank">{index + 1}</span>
              {index === 0 && <img src={CREW[ART[pick.game]].art} alt="" />}
              <span className="leaderboard-name">{row.me ? `${row.name} (you)` : row.name}</span>
              <span className="leaderboard-score">{scoreText(pick, row)}</span>
            </li>
          ))}
        </ol>
      )}
      {data?.mine && !inTop && (
        <p className="game-hint">You're #{data.mine.rank} with {scoreText(pick, data.mine)}.</p>
      )}
      <p className="game-hint">Counts practice and lobby games played while signed in. Fun Run wins are live rooms with two or more players.</p>
    </section>
  );
};

export default Leaderboards;
