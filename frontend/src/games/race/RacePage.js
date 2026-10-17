import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL, fetchLeagueState } from '../../api';
import { useAuth } from '../../AuthContext';
import { CREW } from '../../data/crew';
import { isCommish } from '../../data/leagueLabels';
import SoundToggle from '../../components/SoundToggle';
import { errorText, randomSeed, readClimber, saveClimber } from '../gameRunners';
import Leaderboards from '../Leaderboards';
import RaceGame from './RaceGame';
import { cleanRoomCode, joinRaceRoom, MAX_RACERS, newRoomCode } from './raceNet';
import { ITEMS, mapFor, progressOf, TICKS_PER_SECOND } from './raceSim';
import '../Games.css';
import './Race.css';

const myCid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const shortName = (name) => String(name || 'Player').split(/[\s@]/)[0].slice(0, 14) || 'Player';
/** Fill-in racers for a room: average crew bots (practice bots range from easy to hard). */
const AVERAGE_BOT = [0.55, 0.65];
const crewBots = (count, skill = AVERAGE_BOT) => Array.from({ length: count }, (_, i) => {
  const crew = Math.floor(Math.random() * CREW.length);
  return { cid: `bot-${i + 1}`, name: `${CREW[crew].name} bot`, crew, bot: true, skill: skill[0] + Math.random() * (skill[1] - skill[0]) };
});

const CrewPicker = ({ value, onChange }) => (
  <div className="race-crew-picks">
    {CREW.map((guy, index) => (
      <button key={guy.name} type="button" className={index === value ? 'is-picked' : ''} aria-pressed={index === value} onClick={() => onChange(index)}>
        <img src={guy.art} alt="" />
        <span>{guy.name}</span>
      </button>
    ))}
  </div>
);

const ItemList = () => (
  <details className="race-items">
    <summary>What the power-ups do</summary>
    <ul>
      {ITEMS.map((item) => (
        <li key={item.key}><img src={CREW[item.crew].art} alt="" /><span><strong>{item.name}</strong> {item.does}</span></li>
      ))}
    </ul>
    <p className="game-hint">Boxes are random. If you fall way behind, the speed-ups come up a bit more often.</p>
  </details>
);

/** Starts the race clock on the server, so the finished run can count for the leaderboards. */
const startRanked = (seed) => axios.post(`${API_BASE_URL}/games/race/start`, { seed }).then(() => true).catch(() => false);

/** Sends your run to be checked and saved. Resolves to the leaderboard result, or { error }. */
const finishRanked = (seed, roster, meCid, engine, live, raceId) => {
  const slot = roster.findIndex((p) => p.cid === meCid);
  if (slot < 0) return Promise.resolve(null);
  return axios.post(`${API_BASE_URL}/games/race/finish`, {
    seed, slot, crew: roster[slot].crew, inputs: engine.myInputs, live, raceId,
  }).then((res) => res.data).catch((e) => ({ error: errorText(e) }));
};

/** What your run did on the leaderboards. */
const RankedLine = ({ ranked, seed }) => {
  if (!ranked) return null;
  if (ranked.error) return <p className="game-hint">Not saved to the leaderboard: {ranked.error}</p>;
  const map = mapFor(seed).name;
  return (
    <p className="race-ranked">
      {ranked.time
        ? <>{ranked.time.newBest ? `New best on ${map}! ` : `Your best on ${map} is still ${(ranked.time.best / TICKS_PER_SECOND).toFixed(1)}s. `}You're <strong>#{ranked.time.rank}</strong>.</>
        : 'No finish, no time this race.'}
      {ranked.won && <> <strong>You won the race!</strong> That's {ranked.wins} {ranked.wins === 1 ? 'win' : 'wins'}.</>}
    </p>
  );
};

/** Finishing order, plus a prize button for the commissioner when the race came from a league lobby. */
const Results = ({ order, seed, ranked, meCid, leagueId, userId }) => {
  const [league, setLeague] = useState(null);
  const [prize, setPrize] = useState('5');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!leagueId) return;
    fetchLeagueState(leagueId).then((res) => setLeague(res.data)).catch(() => {});
  }, [leagueId]);
  const winner = order.find((r) => r.runner.finishTick != null && !r.bot);
  const winnerTeam = league && winner ? (league.teams || []).find((t) => t && t.ownerId === winner.userId) : null;
  const award = async () => {
    const amount = parseInt(prize, 10) || 0;
    if (!winnerTeam || amount <= 0) return;
    try {
      await axios.post(`${API_BASE_URL}/leagues/${leagueId}/adjust-budget`, { teamId: winnerTeam.id, newBudget: winnerTeam.budget + amount });
      setMessage(`Added $${amount} to ${winnerTeam.name}.`);
      setLeague({ ...league, teams: league.teams.map((t) => (t.id === winnerTeam.id ? { ...t, budget: t.budget + amount } : t)) });
    } catch (e) {
      setMessage(errorText(e));
    }
  };
  return (
    <div className="race-results">
      <h3>Results · {mapFor(seed).name}</h3>
      <RankedLine ranked={ranked} seed={seed} />
      <ol>
        {order.map((r) => (
          <li key={r.cid} className={r.cid === meCid ? 'is-me' : ''}>
            <img src={CREW[r.crew].art} alt="" />
            <span className="race-result-name">{r.cid === meCid ? 'You' : r.name}</span>
            <span>{r.runner.finishTick != null ? `${(r.runner.finishTick / TICKS_PER_SECOND).toFixed(1)}s` : `${Math.round(progressOf(r.runner, mapFor(seed).length) * 100)}% (didn't finish)`}</span>
          </li>
        ))}
      </ol>
      {league && isCommish(league, userId) && winnerTeam && (
        <div className="race-award">
          <span>Prize for {winnerTeam.name}: $</span>
          <input type="number" min="1" max="100" value={prize} onChange={(e) => setPrize(e.target.value)} aria-label="Prize" />
          <button type="button" className="game-go" onClick={award}>Award</button>
          {message && <span className="game-hint">{message}</span>}
        </div>
      )}
    </div>
  );
};

/** A live room: who's here, what they picked, and the race when the host starts it. */
const RaceRoom = ({ code, leagueId, user, crew, setCrew }) => {
  const navigate = useNavigate();
  const cid = useMemo(myCid, []);
  const [people, setPeople] = useState([]);
  const [race, setRace] = useState(null);
  const [results, setResults] = useState(null);
  const [trouble, setTrouble] = useState('');
  const [ready, setReady] = useState(false);
  const [fillBots, setFillBots] = useState(true);
  const hooksRef = useRef(null);
  const netRef = useRef(null);
  const name = shortName(user.userDetails);

  useEffect(() => {
    const net = joinRaceRoom(code, { cid, userId: user.userId, name, crew, ready: false }, {
      onPeople: setPeople,
      onStart: (payload) => { setResults(null); setReady(false); setRace(payload); },
      onInputs: (payload) => hooksRef.current?.receiveInputs(payload),
      onAttack: (payload) => hooksRef.current?.receiveAttack(payload),
      onTrouble: () => setTrouble("Can't reach the race room. Check your connection."),
    });
    netRef.current = net;
    return () => net.leave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, cid]);

  useEffect(() => { netRef.current?.setMe({ crew, ready }); }, [crew, ready]);
  useEffect(() => { if (race) startRanked(race.seed); }, [race]);

  const raceDone = (order, engine) => {
    const done = race;
    setResults({ id: done.id, order, seed: done.seed, ranked: null });
    setRace(null);
    const live = done.roster.filter((p) => !p.bot).length >= 2;
    finishRanked(done.seed, done.roster, cid, engine, live, done.id)
      .then((ranked) => setResults((now) => (now && now.id === done.id ? { ...now, ranked } : now)));
  };

  const isHost = people[0]?.cid === cid;
  const racers = people.slice(0, MAX_RACERS);
  // The host's Start counts as their ready.
  const notReady = racers.filter((p) => p.cid !== cid && !p.ready);
  const bots = fillBots ? MAX_RACERS - racers.length : 0;
  const start = () => {
    const roster = [...racers.map((p) => ({ cid: p.cid, userId: p.userId, name: p.name, crew: p.crew })), ...crewBots(bots)];
    // The host's phone runs the bots and sends their moves along with its own.
    const payload = { id: myCid(), seed: randomSeed(), roster, hostCid: cid };
    netRef.current.send('start', payload);
    setResults(null);
    setReady(false);
    setRace(payload);
  };

  if (race) {
    return (
      <RaceGame
        key={race.id}
        seed={race.seed}
        roster={race.roster}
        meCid={cid}
        hostCid={race.hostCid}
        net={netRef.current}
        hooksRef={hooksRef}
        onDone={raceDone}
      />
    );
  }

  return (
    <div className="race-room">
      {results && <Results order={results.order} seed={results.seed} ranked={results.ranked} meCid={cid} leagueId={leagueId} userId={user.userId} />}
      <div className="race-room-head">
        <div>
          <p className="section-kicker">{leagueId ? 'League race room' : 'Race room'}</p>
          {!leagueId && <h3 className="race-code">Code <strong>{code}</strong></h3>}
          <p className="game-hint">{leagueId ? 'Everyone who opens the race from this league lobby lands here.' : 'Friends join from Games, Crew Fun Run, Join with code.'}</p>
        </div>
        <button type="button" className="game-secondary" onClick={() => navigate('/games/race')}>Leave</button>
      </div>
      {trouble && <p className="game-error">{trouble}</p>}
      <ul className="race-people">
        {people.map((p, index) => (
          <li key={p.cid} className={index >= MAX_RACERS ? 'is-waiting' : ''}>
            <img src={CREW[p.crew]?.art} alt="" />
            <span>{p.cid === cid ? `${p.name} (you)` : p.name}</span>
            <small className={p.ready ? 'is-ready' : ''}>
              {index >= MAX_RACERS ? 'Next race' : `${CREW[p.crew]?.name}${index === 0 ? ' · Host' : p.ready ? ' · Ready ✓' : ' · Not ready'}`}
            </small>
          </li>
        ))}
      </ul>
      <p className="race-pick-label">Pick your runner (doubles are fine)</p>
      <CrewPicker value={crew} onChange={setCrew} />
      <ItemList />
      {isHost ? (
        <div className="race-start">
          {racers.length < MAX_RACERS && (
            <label className="race-fill">
              <input type="checkbox" checked={fillBots} onChange={(e) => setFillBots(e.target.checked)} />
              Fill the other {MAX_RACERS - racers.length} {MAX_RACERS - racers.length === 1 ? 'spot' : 'spots'} with crew bots (average speed)
            </label>
          )}
          <button type="button" className="game-go" onClick={start} disabled={racers.length === 0 || notReady.length > 0}>
            Start the race ({racers.length + bots} {racers.length + bots === 1 ? 'runner' : 'runners'})
          </button>
          {notReady.length > 0 && (
            <span className="game-hint">Waiting on {notReady.map((p) => p.name).join(', ')} to ready up.</span>
          )}
        </div>
      ) : (
        <div className="race-start">
          <button type="button" className={ready ? 'game-secondary' : 'game-go'} onClick={() => setReady((r) => !r)}>
            {ready ? 'Not ready yet' : "I'm ready"}
          </button>
          <span className="game-hint">{ready ? `Ready. Waiting for ${people[0]?.name || 'the host'} to start.` : 'Pick your runner, then ready up.'}</span>
        </div>
      )}
    </div>
  );
};

/** Solo practice against crew bots. */
const Practice = ({ user, crew, bots, onExit }) => {
  const [round, setRound] = useState(0);
  const [results, setResults] = useState(null);
  const race = useMemo(() => {
    const seed = randomSeed();
    const roster = [{ cid: 'me', name: shortName(user.userDetails), crew }];
    for (let i = 0; i < bots; i += 1) {
      const botCrew = Math.floor(Math.random() * CREW.length);
      roster.push({ cid: `bot${i}`, name: CREW[botCrew].name, crew: botCrew, bot: true, skill: 0.35 + Math.random() * 0.6 });
    }
    return { seed, roster };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);
  useEffect(() => { startRanked(race.seed); }, [race]);
  const raceDone = (order, engine) => {
    const id = round;
    setResults({ id, order, ranked: null });
    finishRanked(race.seed, race.roster, 'me', engine, false, null)
      .then((ranked) => setResults((now) => (now && now.id === id ? { ...now, ranked } : now)));
  };
  if (results) {
    return (
      <div className="race-room">
        <Results order={results.order} seed={race.seed} ranked={results.ranked} meCid="me" />
        <div className="game-player-actions">
          <button type="button" className="game-go" onClick={() => { setResults(null); setRound((n) => n + 1); }}>Race again</button>
          <button type="button" className="game-secondary" onClick={onExit}>Done</button>
        </div>
      </div>
    );
  }
  return (
    <>
      <RaceGame key={round} seed={race.seed} roster={race.roster} meCid="me" net={null} onDone={raceDone} />
      <div className="game-player-actions"><button type="button" className="game-secondary" onClick={onExit}>Quit</button></div>
    </>
  );
};

/** /games/race: practice with bots, or a live room by code (or the league's room from a draft lobby). */
const RacePage = () => {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = cleanRoomCode(params.get('room'));
  const leagueId = params.get('league') || null;
  const [crew, setCrewState] = useState(readClimber);
  const [bots, setBots] = useState(5);
  const [practicing, setPracticing] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const setCrew = (index) => { setCrewState(index); saveClimber(index); };

  let body;
  if (code) {
    body = <RaceRoom key={code} code={code} leagueId={leagueId} user={user} crew={crew} setCrew={setCrew} />;
  } else if (practicing) {
    body = <Practice user={user} crew={crew} bots={bots} onExit={() => setPracticing(false)} />;
  } else {
    body = (
      <div className="race-menu">
        <p className="race-pick-label">Pick your runner</p>
        <CrewPicker value={crew} onChange={setCrew} />
        <ItemList />
        <div className="race-menu-options">
          <div className="race-option">
            <strong>Practice against the crew</strong>
            <label>
              Bots
              <select value={bots} onChange={(e) => setBots(parseInt(e.target.value, 10))}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button type="button" className="game-go" onClick={() => setPracticing(true)}>Practice</button>
          </div>
          <div className="race-option">
            <strong>Race your friends (up to {MAX_RACERS})</strong>
            <button type="button" className="game-go" onClick={() => navigate(`/games/race?room=${newRoomCode()}`)}>Make a room</button>
            <form onSubmit={(e) => { e.preventDefault(); if (cleanRoomCode(joinCode)) navigate(`/games/race?room=${cleanRoomCode(joinCode)}`); }}>
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Code" maxLength={4} aria-label="Room code" />
              <button type="submit" className="game-secondary">Join</button>
            </form>
          </div>
        </div>
        <Leaderboards initial="race-time" />
      </div>
    );
  }

  return (
    <div className="games-page race-page">
      <div className="games-header">
        <div>
          <p className="section-kicker"><Link to="/games">Games</Link></p>
          <h2>Crew Fun Run</h2>
          <p className="games-sub">Race to the flag. Jump the gaps, spikes and rocks, grab ? boxes, and use the crew's power-ups on each other.</p>
        </div>
        <SoundToggle />
      </div>
      {body}
    </div>
  );
};

export default RacePage;
