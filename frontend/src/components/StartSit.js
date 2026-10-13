import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../api';
import {
  SCORING_OPTIONS, STANDARD_LINEUP, benchReason, buildLineup, compareVerdict, isUnavailable, teammatesOut, trendFor,
  vacatedPoints, withProjections, defenseMatchup, boxLine, lineupChanges, analyzeTrade, tradeValue, pickLabel, pickValue,
} from '../data/startSitUtils';
import UpdatedAt from './UpdatedAt';
import '../App.css';
import './SeasonTools.css';

const CUSTOM = 'custom';
const SLEEPER_PREFIX = 'sleeper:';
// Projections refresh every 30 minutes on the server, so anything older than this is suspect.
const PROJECTIONS_STALE_HOURS = 2;
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

const TREND_ICON = { up: '▲', down: '▼', flat: '▬' };

const TrendBadge = ({ player, scoring }) => {
  const trend = trendFor(player, scoring);
  if (trend.lastThree == null) return null;
  return (
    <span className={`startsit-trend ${trend.direction}`} title={`Last 3 games avg ${trend.lastThree}, season avg ${trend.season}`}>
      {TREND_ICON[trend.direction]} {trend.lastThree.toFixed(1)}
    </span>
  );
};

const PlayerName = ({ player, scoring, onOpen }) => (
  <>
    <button type="button" className="startsit-name" onClick={() => onOpen(player.id)}>{player.name}</button>
    {' '}<small>{player.position}</small> <StatusTag player={player} /> <TrendBadge player={player} scoring={scoring} />
  </>
);

/** Pop-up with one player's recent games, past games against this week's opponent, and injured teammates. */
const PlayerInsight = ({ player, allPlayers, defense, scoring, week, updatedAt, onClose }) => {
  const [matchup, setMatchup] = useState(null);
  const [matchupError, setMatchupError] = useState('');
  const trend = trendFor(player, scoring);
  const teammates = teammatesOut(player, allPlayers, scoring);
  const vacated = vacatedPoints(teammates);
  const vsDefense = defenseMatchup(player, defense, scoring);
  const maxRecent = Math.max(1, ...trend.recent.map((g) => g.value), player.points || 0);

  useEffect(() => {
    if (!player.opponent) return undefined;
    let cancelled = false;
    setMatchup(null);
    setMatchupError('');
    axios.get(`${API_BASE_URL}/startsit/matchup/${encodeURIComponent(player.id)}?opponent=${encodeURIComponent(player.opponent)}`)
      .then((response) => { if (!cancelled) setMatchup(response.data); })
      .catch((error) => { if (!cancelled) setMatchupError(error.response?.data || 'Past matchups are not available right now.'); });
    return () => { cancelled = true; };
  }, [player.id, player.opponent]);

  const matchupAvg = matchup?.average ? Number(matchup.average[scoring] ?? 0) : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content startsit-insight" onClick={(e) => e.stopPropagation()}>
        <div className="player-board-heading">
          <div>
            <p className="section-kicker">{player.position} · {player.team || 'FA'}{player.opponent ? ` vs ${player.opponent}` : ''} · Week {week}</p>
            <h3>{player.name} <StatusTag player={player} /></h3>
            <UpdatedAt at={updatedAt} label="Stats and projection updated" staleAfterHours={PROJECTIONS_STALE_HOURS} />
          </div>
          <button type="button" className="cancel-button" onClick={onClose}>Close</button>
        </div>

        <div className="startsit-insight-stats">
          <div><span>Projected</span><strong>{formatPoints(player.points)}</strong></div>
          <div><span>Last 3 avg</span><strong>{trend.lastThree == null ? '-' : trend.lastThree.toFixed(1)}</strong></div>
          <div><span>Season avg</span><strong>{trend.season == null ? '-' : trend.season.toFixed(1)}</strong></div>
          <div><span>vs {player.opponent || 'opp'}</span><strong>{matchupAvg == null ? '-' : matchupAvg.toFixed(1)}</strong></div>
        </div>

        <section>
          <h4>Recent games {trend.direction !== 'flat' && <span className={`startsit-trend ${trend.direction}`}>{trend.direction === 'up' ? 'Trending up' : 'Trending down'}</span>}</h4>
          {trend.recent.length === 0 ? <p className="startsit-empty">No games played yet this season.</p> : (
            <ul className="startsit-compare">
              {trend.recent.map((game) => (
                <li key={game.week}>
                  <div className="startsit-compare-name">Week {game.week} {game.opponent ? `vs ${game.opponent}` : ''}</div>
                  <div className="startsit-bar"><span style={{ width: `${Math.max(4, (game.value / maxRecent) * 100)}%` }} /></div>
                  <span className="startsit-points">{game.value.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {vsDefense && (
          <section>
            <h4>
              {vsDefense.opponent} defense vs {vsDefense.position}s{' '}
              <span className={`startsit-trend ${vsDefense.verdict === 'good' ? 'up' : vsDefense.verdict === 'tough' ? 'down' : 'flat'}`}>
                {vsDefense.verdict === 'good' ? 'Good matchup' : vsDefense.verdict === 'tough' ? 'Tough matchup' : 'Average matchup'}
              </span>
            </h4>
            <p className="startsit-help">
              {vsDefense.rankLabel}. Per game over {vsDefense.games} game{vsDefense.games === 1 ? '' : 's'} this season:
            </p>
            <table className="startsit-defense">
              <thead>
                <tr><th /><th>{vsDefense.opponent} allows</th><th>League avg</th></tr>
              </thead>
              <tbody>
                {vsDefense.rows.map((row) => {
                  const easier = row.higherIsEasier ? row.value > row.league : row.value < row.league;
                  const gap = Math.abs(row.value - row.league) / Math.max(row.league, 0.1);
                  return (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td className={gap >= 0.1 ? (easier ? 'easier' : 'harder') : ''}>{row.value}</td>
                      <td>{row.league}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {player.opponent && (
          <section>
            <h4>Past games vs {player.opponent}</h4>
            {matchupError && <p className="startsit-empty">{String(matchupError)}</p>}
            {!matchupError && !matchup && <p className="startsit-empty">Looking up past matchups...</p>}
            {matchup && matchup.games.length === 0 && <p className="startsit-empty">No games against {player.opponent} in the last four seasons.</p>}
            {matchup && matchup.games.length > 0 && (
              <>
                <ul className="startsit-compare">
                  {matchup.games.map((game) => {
                    const value = Number(game.points?.[scoring] ?? 0);
                    return (
                      <li key={`${game.season}-${game.week}`}>
                        <div className="startsit-compare-name">
                          {game.season} week {game.week}
                          {game.team && game.team !== player.team ? <small> (with {game.team})</small> : null}
                          {boxLine(player.position, game.box) && <><br /><small>{boxLine(player.position, game.box)}</small></>}
                        </div>
                        <div className="startsit-bar"><span style={{ width: `${Math.max(4, (value / Math.max(maxRecent, value, 1)) * 100)}%` }} /></div>
                        <span className="startsit-points">{value.toFixed(1)}</span>
                      </li>
                    );
                  })}
                </ul>
                {trend.season != null && matchupAvg != null && (
                  <p className="startsit-help">
                    Averages {matchupAvg.toFixed(1)} against {player.opponent} vs {trend.season.toFixed(1)} this season
                    {matchupAvg >= trend.season + 2 ? ', so this matchup has gone well for them.' : matchupAvg <= trend.season - 2 ? ', so this matchup has been tough.' : '.'}
                  </p>
                )}
              </>
            )}
          </section>
        )}

        {['QB', 'RB', 'WR', 'TE'].includes(player.position) && (
          <section>
            <h4>Injured teammates</h4>
            {teammates.length === 0 ? <p className="startsit-empty">No injured {player.team} skill players listed.</p> : (
              <>
                <ul className="startsit-bench">
                  {teammates.map((mate) => (
                    <li key={mate.id}>
                      <div>
                        <strong>{mate.name}</strong> <small>{mate.position}</small> <span className={`startsit-tag ${isUnavailable(mate.injury) || mate.injury === 'IR' ? 'warn' : 'caution'}`}>{mate.injury}</span>
                      </div>
                      <span className="startsit-points" title="Season average">{mate.seasonAvg == null ? '-' : `${mate.seasonAvg.toFixed(1)} avg`}</span>
                    </li>
                  ))}
                </ul>
                {vacated > 0 && (
                  <p className="startsit-help">
                    About {vacated.toFixed(1)} pts/game from teammates in a similar role are out, which can mean more targets or touches for {player.name}.
                  </p>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

const signed = (n) => `${n > 0 ? '+' : ''}${n.toFixed(1)}`;

const TradePicks = ({
  title, players, ids, onToggle, scoring, dynasty, picks = [], pickIds = [], onTogglePick, teamName, firstPickSeason,
}) => (
  <div className="trade-side">
    <h4>{title}</h4>
    <ul className="trade-list">
      {[...players].sort((a, b) => tradeValue(b, scoring) - tradeValue(a, scoring)).map((p) => (
        <li key={p.id} className={ids.includes(p.id) ? 'picked' : ''}>
          <label>
            <input type="checkbox" checked={ids.includes(p.id)} onChange={() => onToggle(p.id)} />
            <span>
              {p.name} <small>{p.position} · {p.team || 'FA'}{dynasty && p.age ? ` · age ${Math.floor(p.age)}` : ''}</small> <StatusTag player={p} />
            </span>
          </label>
          <span className="startsit-points" title="Expected points per game, rest of season">{tradeValue(p, scoring).toFixed(1)}</span>
        </li>
      ))}
    </ul>
    {dynasty && picks.length > 0 && (
      <>
        <h4 className="trade-picks-title">Draft picks</h4>
        <ul className="trade-list trade-pick-list">
          {picks.map((pick) => (
            <li key={pick.id} className={pickIds.includes(pick.id) ? 'picked' : ''}>
              <label>
                <input type="checkbox" checked={pickIds.includes(pick.id)} onChange={() => onTogglePick(pick.id)} />
                <span>{pickLabel(pick, teamName)}</span>
              </label>
              <span className="startsit-points" title="Trade value">{pickValue(pick, firstPickSeason).toFixed(1)}</span>
            </li>
          ))}
        </ul>
      </>
    )}
  </div>
);

/** Pick a team in the same league and players on each side; rates the trade by rest-of-season value. */
const TradeCheck = ({
  myRoster, partners, rosterSettings, scoring, allPlayers, projectionsById, week, onOpen,
  dynasty = false, myPicks = [], myTeamName = '', projectionsAt = null, rostersAt = null,
}) => {
  const [partnerKey, setPartnerKey] = useState('');
  const [giveIds, setGiveIds] = useState([]);
  const [getIds, setGetIds] = useState([]);
  const [givePickIds, setGivePickIds] = useState([]);
  const [getPickIds, setGetPickIds] = useState([]);

  const partner = partners.find((p) => p.key === partnerKey) || partners[0];
  useEffect(() => { setGetIds([]); setGetPickIds([]); }, [partner?.key]);
  const allPicks = [...myPicks, ...partners.flatMap((p) => p.picks || [])];
  const firstPickSeason = allPicks.length ? Math.min(...allPicks.map((pick) => pick.season)) : null;

  const theirRoster = useMemo(
    () => (partner ? withProjections(partner.players, projectionsById, scoring, week) : []),
    [partner, projectionsById, scoring, week],
  );
  const toggle = (setIds) => (id) => setIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const give = myRoster.filter((p) => giveIds.includes(p.id));
  const get = theirRoster.filter((p) => getIds.includes(p.id));
  const givePicks = dynasty ? myPicks.filter((pick) => givePickIds.includes(pick.id)) : [];
  const getPicks = dynasty ? (partner?.picks || []).filter((pick) => getPickIds.includes(pick.id)) : [];
  const result = (give.length || givePicks.length) && (get.length || getPicks.length)
    ? analyzeTrade({
      give, get, myRoster, theirRoster, rosterSettings, scoring, allPlayers, teamCount: partners.length + 1,
      dynasty, givePicks, getPicks, firstPickSeason,
    })
    : null;
  const clearAll = () => { setGiveIds([]); setGetIds([]); setGivePickIds([]); setGetPickIds([]); };
  const anything = giveIds.length + getIds.length + givePickIds.length + getPickIds.length > 0;

  return (
    <section className="card startsit-panel">
      <div className="player-board-heading">
        <div>
          <p className="section-kicker">Trade check</p>
          <h2>Is this trade fair?</h2>
        </div>
        {anything && <button type="button" className="cancel-button" onClick={clearAll}>Clear</button>}
      </div>
      <div className="updated-row">
        <UpdatedAt at={projectionsAt} label="Player values updated" staleAfterHours={PROJECTIONS_STALE_HOURS} />
        {rostersAt
          ? <UpdatedAt at={rostersAt} label="Sleeper rosters updated" staleAfterHours={24} />
          : partners.length > 0 && <span className="updated-at">Rosters are live from this league</span>}
      </div>
      {partners.length === 0 ? (
        <p className="startsit-help">Pick a Sleeper or Hood League team in the Roster menu to trade with the other teams in that league.</p>
      ) : (
        <>
          <label className="trade-partner">
            Trade with
            <select value={partner?.key || ''} onChange={(e) => setPartnerKey(e.target.value)}>
              {partners.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </label>
          {dynasty && (
            <p className="startsit-help">
              Dynasty league: younger players are worth more and older ones less (running backs fade first, quarterbacks last),
              and draft picks count. A 1st is valued like a solid starter, and picks further out are worth a bit less.
            </p>
          )}
          <div className="trade-grid">
            <TradePicks
              title="You give" players={myRoster} ids={giveIds} onToggle={toggle(setGiveIds)} scoring={scoring}
              dynasty={dynasty} picks={myPicks} pickIds={givePickIds} onTogglePick={toggle(setGivePickIds)}
              teamName={myTeamName} firstPickSeason={firstPickSeason}
            />
            <TradePicks
              title={`You get from ${partner?.name || 'them'}`} players={theirRoster} ids={getIds} onToggle={toggle(setGetIds)} scoring={scoring}
              dynasty={dynasty} picks={partner?.picks || []} pickIds={getPickIds} onTogglePick={toggle(setGetPickIds)}
              teamName={partner?.name} firstPickSeason={firstPickSeason}
            />
          </div>
          {!result && <p className="startsit-help">Tick at least one player{dynasty ? ' or pick' : ''} on each side. Numbers are expected points per game for the rest of the season.</p>}
          {result && (
            <div className={`trade-result ${result.verdict.tone}`}>
              <strong className="trade-verdict">{result.verdict.label}</strong>
              <p>{result.verdict.detail}</p>
              {result.valueVerdict.label !== result.verdict.label && (
                <p className="startsit-help">On player value alone: {result.valueVerdict.label.toLowerCase()}.</p>
              )}
              <div className="startsit-insight-stats">
                <div><span>Value you give</span><strong>{result.giveTotal.toFixed(1)}</strong></div>
                <div><span>Value you get</span><strong>{result.getTotal.toFixed(1)}</strong></div>
                <div><span>Your lineup</span><strong>{signed(result.myChange)}</strong></div>
                <div><span>Their lineup</span><strong>{signed(result.theirChange)}</strong></div>
              </div>
              <p className="startsit-help">
                Trade value mostly counts what a player scores above a starter you could find on waivers, plus a little for raw points
                ({Object.entries(result.levels).filter(([pos]) => ['QB', 'RB', 'WR', 'TE'].includes(pos)).map(([pos, v]) => `${pos} ${v.toFixed(1)}`).join(', ')} pts/game in this league).
                Lineup numbers are the change in each team's best weekly lineup, and the verdict counts yours: a trade that fills a
                weak starting spot is worth more to you, and one whose players would sit on your bench is worth less.
                {give.length !== get.length && ` This is a ${give.length}-for-${get.length} in players, so ${give.length > get.length ? 'you free up' : 'they free up'} a roster spot.`}
              </p>
              <ul className="trade-breakdown">
                {[...result.give.map((p) => ({ ...p, side: 'give' })), ...result.get.map((p) => ({ ...p, side: 'get' }))].map((p) => (
                  <li key={`${p.side}-${p.id}`}>
                    <span className={`startsit-tag ${p.side === 'give' ? 'warn' : 'caution'}`}>{p.side === 'give' ? 'Give' : 'Get'}</span>
                    {p.round ? (
                      <>
                        <span>{pickLabel(p, p.side === 'give' ? myTeamName : partner?.name)}</span>
                        <span className="startsit-points">draft pick, value {p.score.toFixed(1)}</span>
                      </>
                    ) : (
                      <>
                        <button type="button" className="startsit-name" onClick={() => onOpen(p.id)}>{p.name}</button>
                        <small>{p.position}{dynasty && p.age ? `, age ${Math.floor(p.age)}` : ''}{p.role ? `, ${p.role}` : ''}</small>
                        <span className="startsit-points">
                          {p.value.toFixed(1)} pts/game, {p.surplus.toFixed(1)} above waiver
                          {dynasty && p.ageFactor !== 1 ? `, age x${p.ageFactor}` : ''}, value {p.score.toFixed(1)}
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
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
  const [insightId, setInsightId] = useState(null);
  const [sleeperName, setSleeperName] = useState(() => readSetting('hl-startsit-sleeper-user', ''));
  const [sleeperImport, setSleeperImport] = useState(null);
  const [sleeperStatus, setSleeperStatus] = useState('');

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

  const importSleeper = async (username, { selectFirst }) => {
    const name = String(username || '').trim();
    if (!name) return;
    setSleeperStatus('Loading your Sleeper teams...');
    try {
      const response = await axios.get(`${API_BASE_URL}/startsit/sleeper?username=${encodeURIComponent(name)}`);
      const data = response.data;
      setSleeperImport(data);
      writeSetting('hl-startsit-sleeper-user', name);
      if (data.teams.length === 0) {
        setSleeperStatus(`${data.displayName} has no Sleeper teams for the ${data.season} season.`);
        return;
      }
      setSleeperStatus('');
      if (selectFirst) {
        setSource(`${SLEEPER_PREFIX}${data.teams[0].leagueId}`);
        setScoring(data.teams[0].scoring);
      }
    } catch (error) {
      setSleeperStatus(String(error.response?.data || 'Could not reach Sleeper. Please try again.'));
    }
  };

  // Reload the Sleeper teams for a username saved on an earlier visit.
  useEffect(() => {
    const saved = readSetting('hl-startsit-sleeper-user', '');
    if (saved) importSleeper(saved, { selectFirst: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sleeperTeams = sleeperImport?.teams || [];

  const myTeams = useMemo(() => leagues
    .map((league) => ({ league, team: (league.teams || []).find((t) => t.ownerId === userId) }))
    .filter(({ team }) => team && (team.roster || []).length > 0), [leagues, userId]);

  // Keep the viewer's last pick when it still exists; otherwise a Sleeper team, then a drafted roster.
  const sourceExists = source === CUSTOM
    || myTeams.some(({ league }) => league.id === source)
    || sleeperTeams.some((t) => `${SLEEPER_PREFIX}${t.leagueId}` === source);
  const activeSource = sourceExists
    ? source
    : (sleeperTeams[0] ? `${SLEEPER_PREFIX}${sleeperTeams[0].leagueId}` : (myTeams[0]?.league.id || CUSTOM));

  const projectionsById = useMemo(
    () => new Map((projections?.players || []).map((p) => [p.id, p])),
    [projections],
  );

  const activeTeam = myTeams.find(({ league }) => league.id === activeSource);
  const activeSleeper = sleeperTeams.find((t) => `${SLEEPER_PREFIX}${t.leagueId}` === activeSource);
  const rosterSettings = useMemo(() => {
    if (activeSleeper) return { slots: activeSleeper.slots };
    return activeTeam ? activeTeam.league.rosterSettings : STANDARD_LINEUP;
  }, [activeSleeper, activeTeam]);

  const rosterPlayers = useMemo(() => {
    if (activeSleeper) return activeSleeper.players;
    if (activeTeam) return (activeTeam.team.roster || []).map((spot) => spot.player).filter(Boolean);
    return customIds.map((id) => projectionsById.get(id) || { id, name: id, position: '', team: '' });
  }, [activeSleeper, activeTeam, customIds, projectionsById]);

  const changeSource = (value) => {
    setSource(value);
    const team = sleeperTeams.find((t) => `${SLEEPER_PREFIX}${t.leagueId}` === value);
    if (team) setScoring(team.scoring);
  };

  const shownWeek = projections?.week || week;
  const roster = useMemo(
    () => withProjections(rosterPlayers, projectionsById, scoring, shownWeek),
    [rosterPlayers, projectionsById, scoring, shownWeek],
  );
  const lineup = useMemo(() => buildLineup(roster, rosterSettings), [roster, rosterSettings]);
  const changes = activeSleeper ? lineupChanges(lineup, activeSleeper.starters, roster, activeSleeper.startersBySlot) : [];

  const tradePartners = useMemo(() => {
    if (activeSleeper) {
      return (activeSleeper.opponents || []).map((team, index) => ({
        key: `s${index}`, name: team.teamName, players: team.players, picks: team.picks || [],
      }));
    }
    if (activeTeam) {
      return (activeTeam.league.teams || [])
        .filter((team) => team && team.ownerId !== userId && (team.roster || []).length > 0)
        .map((team) => ({ key: team.id, name: team.name, players: team.roster.map((spot) => spot.player).filter(Boolean) }));
    }
    return [];
  }, [activeSleeper, activeTeam, userId]);

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
  const insightPlayer = insightId
    ? [...roster, ...comparePlayers].find((p) => p.id === insightId)
      || withProjections([projectionsById.get(insightId)].filter(Boolean), projectionsById, scoring, shownWeek)[0]
    : null;

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
            <select value={activeSource} onChange={(e) => changeSource(e.target.value)}>
              {sleeperTeams.map((t) => (
                <option key={t.leagueId} value={`${SLEEPER_PREFIX}${t.leagueId}`}>{t.teamName} (Sleeper: {t.leagueName})</option>
              ))}
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
          <section className="card startsit-panel">
            <div className="player-board-heading">
              <div>
                <p className="section-kicker">Sleeper</p>
                <h2>{sleeperTeams.length ? `Connected as ${sleeperImport.displayName}` : 'Import your Sleeper team'}</h2>
              </div>
              {sleeperTeams.length > 0 && <div className="board-count">{sleeperTeams.length} team{sleeperTeams.length === 1 ? '' : 's'}</div>}
            </div>
            <form
              className="startsit-sleeper-form"
              onSubmit={(e) => { e.preventDefault(); importSleeper(sleeperName, { selectFirst: true }); }}
            >
              <input
                type="text"
                placeholder="Sleeper username"
                value={sleeperName}
                autoCapitalize="none"
                autoCorrect="off"
                onChange={(e) => setSleeperName(e.target.value)}
              />
              <button type="submit" className="create-button">{sleeperTeams.length ? 'Refresh' : 'Import'}</button>
            </form>
            {sleeperTeams.length > 0 && !sleeperStatus && (
              <UpdatedAt at={sleeperImport.fetchedAt} label="Rosters loaded from Sleeper" staleAfterHours={24} />
            )}
            <p className="startsit-help">
              {sleeperStatus || 'Uses your Sleeper roster, lineup slots and scoring. Only your username is needed, no password.'}
            </p>
          </section>

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
              <div className="updated-row">
                <UpdatedAt at={projections.fetchedAt} label="Projections updated" staleAfterHours={PROJECTIONS_STALE_HOURS} />
                {activeSleeper && <UpdatedAt at={sleeperImport.fetchedAt} label="Sleeper lineup updated" staleAfterHours={24} />}
              </div>
              {activeSleeper && roster.length > 0 && (
                <div className={`startsit-verdict ${changes.length ? '' : 'close'} startsit-changes`}>
                  {changes.length === 0
                    ? 'Your Sleeper lineup already matches the best projected lineup.'
                    : (
                      <>
                        <span>Changes from your current Sleeper lineup:</span>
                        <ul>
                          {changes.map(({ start, sit, shuffle, gain }) => (start ? (
                            <li key={start.id}>
                              Start <strong>{start.name}</strong> <small>{start.position}</small>
                              {sit ? <> over <strong>{sit.name}</strong> <small>{sit.position}</small>{benchReason(sit) ? ` (${benchReason(sit)})` : ''}</> : ' in an empty slot'}
                              {gain > 0 ? ` (+${gain.toFixed(1)} pts)` : ''}
                              {shuffle && <small> (move other starters between slots to match the lineup below)</small>}
                            </li>
                          ) : (
                            <li key={sit.id}>Bench <strong>{sit.name}</strong> <small>{sit.position}</small></li>
                          )))}
                        </ul>
                      </>
                    )}
                </div>
              )}
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
                              <PlayerName player={player} scoring={scoring} onOpen={setInsightId} />
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
                        <PlayerName player={p} scoring={scoring} onOpen={setInsightId} />
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
                      <PlayerName player={p} scoring={scoring} onOpen={setInsightId} />
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

          <TradeCheck
            key={activeSource}
            dynasty={!!activeSleeper?.dynasty}
            myPicks={activeSleeper?.picks || []}
            myTeamName={activeSleeper?.teamName || ''}
            myRoster={roster}
            partners={tradePartners}
            rosterSettings={rosterSettings}
            scoring={scoring}
            allPlayers={projections.players}
            projectionsById={projectionsById}
            week={shownWeek}
            onOpen={setInsightId}
            projectionsAt={projections.fetchedAt}
            rostersAt={activeSleeper ? sleeperImport.fetchedAt : null}
          />

          {insightPlayer && (
            <PlayerInsight
              player={insightPlayer}
              allPlayers={projections.players}
              defense={projections.defense}
              scoring={scoring}
              week={projections.week}
              updatedAt={projections.fetchedAt}
              onClose={() => setInsightId(null)}
            />
          )}

          <p className="startsit-footnote">
            Tap a player for recent games, past games against this opponent, and injured teammates. ▲/▼ shows the last 3 games against the season average.
            Projections and stats from Sleeper for the {projections.season} season, refreshed every 30 minutes (hit Refresh on your Sleeper team to reload a roster).
            Players listed Out, Doubtful or IR, and players on bye, are kept out of the lineup.
          </p>
        </>
      )}
    </div>
  );
};

export default StartSit;
