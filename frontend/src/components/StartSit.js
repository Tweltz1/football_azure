import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../api';
import {
  SCORING_OPTIONS, STANDARD_LINEUP, benchReason, buildLineup, compareVerdict, isUnavailable, withProjections,
} from '../data/startSitUtils';
import '../App.css';
import './SeasonTools.css';

const CUSTOM = 'custom';
const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);

// Per-browser conveniences only; the page works without them.
const readSetting = (key, fallback) => {
  try {
    const value = window.localStorage.getItem(key);
    return value == null ? fallback : JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};
const writeSetting = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Storage can be blocked (private windows); nothing to do.
  }
};

const formatPoints = (points) => (points == null ? '-' : points.toFixed(1));

const Matchup = ({ player }) => (
  <span className="startsit-matchup">
    {player.team || 'FA'}
    {player.opponent ? ` vs ${player.opponent}` : ''}
  </span>
);

const StatusTag = ({ player }) => {
  const reason = benchReason(player);
  if (reason) return <span className="startsit-tag warn">{reason}</span>;
  if (player.injury) return <span className="startsit-tag caution">{player.injury}</span>;
  return null;
};

const StartSit = ({ userId }) => {
  const [projections, setProjections] = useState(null);
  const [projectionError, setProjectionError] = useState('');
  const [loadingProjections, setLoadingProjections] = useState(true);
  // null means "this week", whatever Sleeper says that is.
  const [week, setWeek] = useState(null);
  const [scoring, setScoring] = useState(() => readSetting('hl-startsit-scoring', 'ppr'));
  const [leagues, setLeagues] = useState([]);
  const [source, setSource] = useState(() => readSetting('hl-startsit-source', ''));
  const [customIds, setCustomIds] = useState(() => readSetting('hl-startsit-custom', []));
  const [compareIds, setCompareIds] = useState([]);
  const [rosterSearch, setRosterSearch] = useState('');
  const [compareSearch, setCompareSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadingProjections(true);
    setProjectionError('');
    axios.get(`${API_BASE_URL}/startsit${week ? `?week=${week}` : ''}`)
      .then((response) => {
        if (cancelled) return;
        setProjections(response.data);
      })
      .catch((error) => {
        if (!cancelled) setProjectionError(error.response?.data || 'Weekly projections are not available right now.');
      })
      .finally(() => {
        if (!cancelled) setLoadingProjections(false);
      });
    return () => { cancelled = true; };
  }, [week]);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/GetLeagues`)
      .then((response) => setLeagues(response.data || []))
      .catch((error) => console.error('Error fetching leagues for start/sit:', error));
  }, []);

  useEffect(() => writeSetting('hl-startsit-scoring', scoring), [scoring]);
  useEffect(() => writeSetting('hl-startsit-source', source), [source]);
  useEffect(() => writeSetting('hl-startsit-custom', customIds), [customIds]);

  const myTeams = useMemo(() => leagues
    .map((league) => ({ league, team: (league.teams || []).find((t) => t.ownerId === userId) }))
    .filter(({ team }) => team && (team.roster || []).length > 0), [leagues, userId]);

  // Default to the first league with a drafted roster, unless the viewer picked something else before.
  const activeSource = source === CUSTOM || myTeams.some(({ league }) => league.id === source)
    ? source
    : (myTeams[0]?.league.id || CUSTOM);

  const projectionsById = useMemo(
    () => new Map((projections?.players || []).map((p) => [p.id, p])),
    [projections],
  );

  const activeTeam = myTeams.find(({ league }) => league.id === activeSource);
  const rosterSettings = activeTeam ? activeTeam.league.rosterSettings : STANDARD_LINEUP;

  const rosterPlayers = useMemo(() => {
    if (activeTeam) return (activeTeam.team.roster || []).map((spot) => spot.player).filter(Boolean);
    return customIds.map((id) => projectionsById.get(id) || { id, name: id, position: '', team: '' });
  }, [activeTeam, customIds, projectionsById]);

  const shownWeek = projections?.week || week;
  const roster = useMemo(
    () => withProjections(rosterPlayers, projectionsById, scoring, shownWeek),
    [rosterPlayers, projectionsById, scoring, shownWeek],
  );
  const lineup = useMemo(() => buildLineup(roster, rosterSettings), [roster, rosterSettings]);

  const searchPlayers = (query, excludeIds) => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return (projections?.players || [])
      .filter((p) => !excludeIds.includes(p.id) && (p.name.toLowerCase().includes(q) || p.team.toLowerCase() === q))
      .slice(0, 8);
  };

  const comparePlayers = withProjections(
    compareIds.map((id) => projectionsById.get(id)).filter(Boolean), projectionsById, scoring, shownWeek,
  );
  const verdict = compareVerdict(comparePlayers);
  const maxComparePoints = Math.max(1, ...comparePlayers.map((p) => p.points || 0));

  return (
    <div className="page-shell startsit-page">
      <section className="page-hero">
        <p className="page-kicker">In-season help</p>
        <h1>Start / Sit</h1>
        <p>Weekly projections for your drafted roster, the best lineup to set, and quick head-to-head calls.</p>
        <div className="startsit-controls">
          <label>
            Week
            <select value={shownWeek || ''} onChange={(e) => setWeek(parseInt(e.target.value, 10))}>
              {WEEKS.map((w) => (
                <option key={w} value={w}>
                  Week {w}{projections && w === projections.currentWeek ? ' (this week)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Scoring
            <select value={scoring} onChange={(e) => setScoring(e.target.value)}>
              {SCORING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label>
            Roster
            <select value={activeSource} onChange={(e) => setSource(e.target.value)}>
              {myTeams.map(({ league, team }) => (
                <option key={league.id} value={league.id}>{team.name} ({league.name})</option>
              ))}
              <option value={CUSTOM}>My own list</option>
            </select>
          </label>
        </div>
      </section>

      {loadingProjections && <div className="loading-panel">Loading projections...</div>}
      {projectionError && !loadingProjections && (
        <div className="empty-state">
          <h3>Projections unavailable</h3>
          <p>{String(projectionError)}</p>
        </div>
      )}

      {projections && !loadingProjections && (
        <>
          {activeSource === CUSTOM && (
            <section className="card startsit-panel">
              <div className="player-board-heading">
                <div>
                  <p className="section-kicker">My own list</p>
                  <h2>Add your players</h2>
                </div>
                <div className="board-count">{customIds.length} player{customIds.length === 1 ? '' : 's'}</div>
              </div>
              <p className="startsit-help">
                Not drafting here? Add the players on your real team and we'll pick a standard lineup
                (QB, 2 RB, 3 WR, TE, FLEX, K, DST). Your list is saved in this browser.
              </p>
              <input
                type="search"
                className="startsit-search"
                placeholder="Search players or a team (e.g. KC)"
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
              />
              <ul className="startsit-results">
                {searchPlayers(rosterSearch, customIds).map((p) => (
                  <li key={p.id}>
                    <button type="button" className="edit-roster-button" onClick={() => { setCustomIds([...customIds, p.id]); setRosterSearch(''); }}>
                      Add {p.name} <small>{p.position} · {p.team}</small>
                    </button>
                  </li>
                ))}
              </ul>
              {customIds.length > 0 && (
                <div className="startsit-chips">
                  {roster.map((p) => (
                    <button key={p.id} type="button" className="startsit-chip" onClick={() => setCustomIds(customIds.filter((id) => id !== p.id))}>
                      {p.name} ×
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="startsit-grid">
            <section className="card startsit-panel">
              <div className="player-board-heading">
                <div>
                  <p className="section-kicker">Week {projections.week} lineup</p>
                  <h2>Start these</h2>
                </div>
                <div className="board-count">{lineup.total.toFixed(1)} pts</div>
              </div>
              {roster.length === 0 ? (
                <div className="empty-state">
                  {activeSource === CUSTOM
                    ? 'Add players above to get a lineup.'
                    : 'No drafted players on this team yet.'}
                </div>
              ) : (
                <table className="leagues-table startsit-table">
                  <thead>
                    <tr><th>Slot</th><th>Player</th><th>Matchup</th><th>Proj</th></tr>
                  </thead>
                  <tbody>
                    {lineup.starters.map(({ slot, player }) => (
                      <tr key={slot.key}>
                        <td><span className="startsit-slot">{slot.label}</span></td>
                        <td>
                          {player ? (
                            <>
                              <strong>{player.name}</strong> <small>{player.position}</small> <StatusTag player={player} />
                            </>
                          ) : <span className="startsit-empty">Nobody available</span>}
                        </td>
                        <td>{player ? <Matchup player={player} /> : ''}</td>
                        <td>{player ? formatPoints(player.points) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="card startsit-panel">
              <div className="player-board-heading">
                <div>
                  <p className="section-kicker">Bench</p>
                  <h2>Sit these</h2>
                </div>
                <div className="board-count">{lineup.bench.length}</div>
              </div>
              {lineup.bench.length === 0 ? (
                <div className="empty-state">Nobody on the bench.</div>
              ) : (
                <ul className="startsit-bench">
                  {lineup.bench.map((p) => (
                    <li key={p.id}>
                      <div>
                        <strong>{p.name}</strong> <small>{p.position}</small> <StatusTag player={p} />
                        <br />
                        <Matchup player={p} />
                      </div>
                      <span className="startsit-points">{formatPoints(p.points)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="card startsit-panel">
            <div className="player-board-heading">
              <div>
                <p className="section-kicker">Head to head</p>
                <h2>Who should I start?</h2>
              </div>
              {compareIds.length > 0 && (
                <button type="button" className="cancel-button" onClick={() => setCompareIds([])}>Clear</button>
              )}
            </div>
            <p className="startsit-help">Pick two to four players to compare this week.</p>
            {compareIds.length < 4 && (
              <>
                <input
                  type="search"
                  className="startsit-search"
                  placeholder="Search any player"
                  value={compareSearch}
                  onChange={(e) => setCompareSearch(e.target.value)}
                />
                <ul className="startsit-results">
                  {searchPlayers(compareSearch, compareIds).map((p) => (
                    <li key={p.id}>
                      <button type="button" className="edit-roster-button" onClick={() => { setCompareIds([...compareIds, p.id]); setCompareSearch(''); }}>
                        Compare {p.name} <small>{p.position} · {p.team}</small>
                      </button>
                    </li>
                  ))}
                </ul>
                {roster.length > 0 && (
                  <div className="startsit-chips">
                    {roster.filter((p) => p.points != null && !compareIds.includes(p.id)).slice(0, 12).map((p) => (
                      <button key={p.id} type="button" className="startsit-chip" onClick={() => setCompareIds([...compareIds, p.id])}>
                        + {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {comparePlayers.length > 0 && (
              <ul className="startsit-compare">
                {[...comparePlayers].sort((a, b) => (b.points || 0) - (a.points || 0)).map((p) => (
                  <li key={p.id} className={verdict?.winner.id === p.id ? 'winner' : ''}>
                    <div className="startsit-compare-name">
                      <strong>{p.name}</strong> <small>{p.position}</small> <StatusTag player={p} />
                      <br />
                      <Matchup player={p} />
                    </div>
                    <div className="startsit-bar">
                      <span style={{ width: `${Math.max(4, ((p.points || 0) / maxComparePoints) * 100)}%` }} />
                    </div>
                    <span className="startsit-points">{formatPoints(p.points)}</span>
                    <button type="button" className="startsit-remove" aria-label={`Remove ${p.name}`} onClick={() => setCompareIds(compareIds.filter((id) => id !== p.id))}>×</button>
                  </li>
                ))}
              </ul>
            )}

            {verdict && (
              <div className={`startsit-verdict ${verdict.close ? 'close' : ''}`}>
                {verdict.close
                  ? `Toss-up: ${verdict.winner.name} is only ${verdict.margin.toFixed(1)} pts ahead of ${verdict.runnerUp.name}. Go with your gut or the better matchup.`
                  : `Start ${verdict.winner.name}. Projected ${verdict.margin.toFixed(1)} pts more than ${verdict.runnerUp.name}.`}
                {isUnavailable(verdict.winner.injury) && ` Heads up: ${verdict.winner.name} is listed ${verdict.winner.injury}.`}
              </div>
            )}
          </section>

          <p className="startsit-footnote">
            Projections from Sleeper for the {projections.season} season, refreshed every 30 minutes.
            Players listed Out, Doubtful or IR, and players on bye, are kept out of the lineup.
          </p>
        </>
      )}
    </div>
  );
};

export default StartSit;
