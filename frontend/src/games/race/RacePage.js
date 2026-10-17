import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL, fetchLeagueState } from '../../api';
import { useAuth } from '../../AuthContext';
import { CREW } from '../../data/crew';
import { isCommish } from '../../data/leagueLabels';
import SoundToggle from '../../components/SoundToggle';
import { errorText, randomSeed, readClimber, saveClimber } from '../gameRunners';
import RaceGame from './RaceGame';
import { cleanRoomCode, joinRaceRoom, MAX_RACERS, newRoomCode } from './raceNet';
import { ITEMS, progressOf, TICKS_PER_SECOND } from './raceSim';
import '../Games.css';
import './Race.css';

const myCid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const shortName = (name) => String(name || 'Player').split(/[\s@]/)[0].slice(0, 14) || 'Player';

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
    <p className="game-hint">Boxes give your own character's power-up more often, so pick the one you like.</p>
  </details>
);

/** Finishing order, plus a prize button for the commissioner when the race came from a league lobby. */
const Results = ({ order, meCid, leagueId, userId }) => {
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
      <h3>Results</h3>
      <ol>
        {order.map((r) => (
          <li key={r.cid} className={r.cid === meCid ? 'is-me' : ''}>
            <img src={CREW[r.crew].art} alt="" />
            <span className="race-result-name">{r.cid === meCid ? 'You' : r.name}</span>
            <span>{r.runner.finishTick != null ? `${(r.runner.finishTick / TICKS_PER_SECOND).toFixed(1)}s` : `${Math.round(progressOf(r.runner) * 100)}% (didn't finish)`}</span>
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
  const hooksRef = useRef(null);
  const netRef = useRef(null);
  const name = shortName(user.userDetails);

  useEffect(() => {
    const net = joinRaceRoom(code, { cid, userId: user.userId, name, crew, racing: false }, {
      onPeople: setPeople,
      onStart: (payload) => { setResults(null); setRace(payload); },
      onInputs: (payload) => hooksRef.current?.receiveInputs(payload),
      onAttack: (payload) => hooksRef.current?.receiveAttack(payload),
      onTrouble: () => setTrouble("Can't reach the race room. Check your connection."),
    });
    netRef.current = net;
    return () => net.leave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, cid]);

  useEffect(() => { netRef.current?.setMe({ crew }); }, [crew]);

  const isHost = people[0]?.cid === cid;
  const start = () => {
    const roster = people.slice(0, MAX_RACERS).map((p) => ({ cid: p.cid, userId: p.userId, name: p.name, crew: p.crew }));
    const payload = { id: myCid(), seed: randomSeed(), roster };
    netRef.current.send('start', payload);
    setResults(null);
    setRace(payload);
  };

  if (race) {
    return (
      <RaceGame
        key={race.id}
        seed={race.seed}
        roster={race.roster}
        meCid={cid}
        net={netRef.current}
        hooksRef={hooksRef}
        onDone={(order) => { setResults(order); setRace(null); }}
      />
    );
  }

  return (
    <div className="race-room">
      {results && <Results order={results} meCid={cid} leagueId={leagueId} userId={user.userId} />}
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
            <small>{index === 0 ? 'Host' : index >= MAX_RACERS ? 'Next race' : CREW[p.crew]?.name}</small>
          </li>
        ))}
      </ul>
      <p className="race-pick-label">Pick your runner (doubles are fine)</p>
      <CrewPicker value={crew} onChange={setCrew} />
      <ItemList />
      <div className="game-player-actions">
        {isHost ? (
          <button type="button" className="game-go" onClick={start} disabled={people.length === 0}>
            Start the race ({Math.min(people.length, MAX_RACERS)} {people.length === 1 ? 'runner' : 'runners'})
          </button>
        ) : <span className="game-hint">Waiting for {people[0]?.name || 'the host'} to start.</span>}
      </div>
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
  if (results) {
    return (
      <div className="race-room">
        <Results order={results} meCid="me" />
        <div className="game-player-actions">
          <button type="button" className="game-go" onClick={() => { setResults(null); setRound((n) => n + 1); }}>Race again</button>
          <button type="button" className="game-secondary" onClick={onExit}>Done</button>
        </div>
      </div>
    );
  }
  return (
    <>
      <RaceGame key={round} seed={race.seed} roster={race.roster} meCid="me" net={null} onDone={setResults} />
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
