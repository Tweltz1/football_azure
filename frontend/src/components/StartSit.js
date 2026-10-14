import React, { useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../api';
import {
  STANDARD_LINEUP, benchReason, buildLineup, compareVerdict, isUnavailable, teammatesOut, trendFor,
  vacatedPoints, withProjections, defenseMatchup, boxLine, lineupChanges, analyzeTrade, tradeValue, pickLabel, pickValue, findTrades, balanceTrade, teamNeeds, ownTradeScore, replacementLevels,
} from '../data/startSitUtils';
import { POSITION_TABS, positionRanks, rankLabel, seasonRankings } from '../data/rankings';
import { buildOutlooks } from '../data/outlook';
import { buildMarket, describeMarketSettings, marketSettingsFor, useMarketValues } from '../data/market';
import { initialPlayerList } from '../data/playerData';
import {
  LeagueScoringContext, applyLeagueScoring, applyLeagueScoringToMatchup, useLeagueScoring,
} from '../data/leagueScoring';
import UpdatedAt, { timeAgo } from './UpdatedAt';
import { REFRESH_MINUTES, useRefreshTick } from '../autoRefresh';
import WhyButton from './WhyButton';
import { explainBench, explainPair, explainStarter, explainTrade } from '../data/startSitWhy';
import '../App.css';
import './SeasonTools.css';

const CUSTOM = 'custom';
const SLEEPER_PREFIX = 'sleeper:';
// Projections refresh every few minutes, so anything older than this is suspect.
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

const PlayerName = ({ player, scoring, onOpen, children = null }) => (
  <>
    <button type="button" className="startsit-name" onClick={() => onOpen(player.id)}>{player.name}</button>
    {' '}<small title={player.posRank ? `${rankLabel(player.position, player.posRank)} by projection this week` : undefined}>
      {rankLabel(player.position, player.posRank)}
    </small> <StatusTag player={player} />{' '}
    {/* Keeps the trend badge and any "?" together when the line wraps. */}
    <span className="startsit-nowrap"><TrendBadge player={player} scoring={scoring} />{children}</span>
  </>
);

/** Pop-up with one player's recent games, past games against this week's opponent, and injured teammates. */
export const PlayerInsight = ({ player, allPlayers, defense, scoring, week, updatedAt, onClose }) => {
  const [rawMatchup, setMatchup] = useState(null);
  const [matchupError, setMatchupError] = useState('');
  const leagueScoring = useContext(LeagueScoringContext);
  const matchup = useMemo(
    () => applyLeagueScoringToMatchup(rawMatchup, player.position, leagueScoring),
    [rawMatchup, player.position, leagueScoring],
  );
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
            {vsDefense.notable.length > 0 && (
              <>
                <p className="startsit-help">How other teams' top {vsDefense.position} did against {vsDefense.opponent}, most recent first:</p>
                <ul className="startsit-compare">
                  {vsDefense.notable.map((game) => (
                    <li key={`${game.id}-${game.week}`}>
                      <div className="startsit-compare-name">
                        {game.name} <small>{game.team} · week {game.week}</small>
                        {boxLine(player.position, game.box) && <><br /><small>{boxLine(player.position, game.box)}</small></>}
                      </div>
                      <div className="startsit-bar"><span style={{ width: `${Math.max(4, (game.value / Math.max(...vsDefense.notable.map((g) => g.value), 1)) * 100)}%` }} /></div>
                      <span className="startsit-points">{game.value.toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
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
  playerValue = null, pickMarketValue = null,
}) => (
  <div className="trade-side">
    <h4>{title}</h4>
    <ul className="trade-list">
      {[...players].sort((a, b) => (playerValue ? playerValue(b) - playerValue(a) : tradeValue(b, scoring) - tradeValue(a, scoring))).map((p) => (
        <li key={p.id} className={ids.includes(p.id) ? 'picked' : ''}>
          <label>
            <input type="checkbox" checked={ids.includes(p.id)} onChange={() => onToggle(p.id)} />
            <span>
              {p.name} <small>{p.position} · {p.team || 'FA'}{dynasty && p.age ? ` · age ${Math.floor(p.age)}` : ''}</small> <StatusTag player={p} />
            </span>
          </label>
          {playerValue
            ? <span className="startsit-points" title="Trade value: market and our projections blended">{playerValue(p).toLocaleString()}</span>
            : <span className="startsit-points" title="Expected points per game, rest of season">{tradeValue(p, scoring).toFixed(1)}</span>}
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
              <span className="startsit-points" title="Trade value">{pickMarketValue ? pickMarketValue(pick).toLocaleString() : pickValue(pick, firstPickSeason).toFixed(1)}</span>
            </li>
          ))}
        </ul>
      </>
    )}
  </div>
);

/** Value balance of the trade so far, updated on every tick: the needle leans toward the side getting more. */
const TradeMeter = ({ live, complete }) => {
  const lean = Math.max(-1, Math.min(1, live.share / 0.6));
  const fair = Math.abs(live.share) <= 0.15;
  return (
    <div className="trade-meter" aria-label="Trade balance">
      <div className="trade-meter-labels">
        <span>You give <strong>{live.giveDisplay != null ? live.giveDisplay.toLocaleString() : live.giveTotal.toFixed(1)}</strong></span>
        <span className={`trade-meter-state ${complete ? (fair ? 'fair' : live.share > 0 ? 'win' : 'lose') : ''}`}>
          {!complete ? 'Add the other side' : fair ? 'Even' : live.share > 0 ? 'Leans your way' : 'Leans their way'}
        </span>
        <span>You get <strong>{live.getDisplay != null ? live.getDisplay.toLocaleString() : live.getTotal.toFixed(1)}</strong></span>
      </div>
      <div className="trade-meter-track">
        <div className="trade-meter-fair" />
        <div className="trade-meter-needle" style={{ left: `${50 + lean * 50}%` }} />
      </div>
      {complete && <div className="trade-meter-lineup">Your lineup {signed(live.myChange)} pts a week · theirs {signed(live.theirChange)}</div>}
    </div>
  );
};

/** Each team's strength by position across the league; tap a team to trade with it. */
const TeamNeeds = ({ needs, partnerKey, onPick }) => (
  <div className="trade-needs-wrap">
    <table className="trade-needs-table">
      <thead>
        <tr>
          <th>Team</th>
          {needs.positions.map((pos) => <th key={pos}>{pos}</th>)}
          <th>Lineup</th>
        </tr>
      </thead>
      <tbody>
        {needs.rows.map((row) => (
          <tr key={row.key} className={`${row.mine ? 'mine' : ''} ${row.key === partnerKey ? 'partner' : ''}`}>
            <td>
              {row.mine ? <strong>{row.name} (you)</strong> : (
                <button type="button" className="startsit-name" onClick={() => onPick(row.key)}>{row.name}</button>
              )}
            </td>
            {needs.positions.map((pos) => {
              const cell = row.cells[pos];
              return (
                <td key={pos} className={`need-${cell.tier}`} title={`${cell.points} pts/game from ${pos}s, #${cell.rank} in the league`}>
                  #{cell.rank}
                </td>
              );
            })}
            <td>#{row.totalRank}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className="startsit-help">
      Rank of the points each team's best lineup gets from each position (#1 is best). Green is a top-third strength, red a bottom-third need.
      A good trade partner is strong where you're weak and weak where you're strong. Tap a team to trade with it.
    </p>
  </div>
);

// Preseason position ranks (WR15...), which outlooks lean on for players who have barely played.
let seasonRanksCache = null;
const seasonRanks = () => {
  if (!seasonRanksCache) {
    seasonRanksCache = new Map();
    POSITION_TABS.filter((t) => t.positions.length === 1).forEach((t) => {
      seasonRankings(initialPlayerList, t.value).forEach((p) => seasonRanksCache.set(p.id, p.positionRank));
    });
  }
  return seasonRanksCache;
};

const PPR_BY_SCORING = { ppr: 1, half: 0.5, std: 0 };

/** Pick a team in the same league and players on each side; rates the trade by rest-of-season value. */
const TradeCheck = ({
  myRoster: myRosterRaw, partners, rosterSettings, scoring, allPlayers: allPlayersRaw, projectionsById, week, onOpen,
  defense = null, dynasty = false, myPicks = [], myTeamName = '', projectionsAt = null, rostersAt = null, ppr = 1,
}) => {
  // Every player's rest-of-season outlook (injuries, teammates, schedule, Sleeper's weeks ahead),
  // which is what trade values are built on.
  const outlooks = useMemo(
    () => buildOutlooks(allPlayersRaw, { scoring, week, defense, seasonRanks: seasonRanks() }),
    [allPlayersRaw, scoring, week, defense],
  );
  const withOutlook = useMemo(() => (list) => list.map((p) => ({ ...p, outlook: outlooks.get(p.id) || null })), [outlooks]);
  const myRoster = useMemo(() => withOutlook(myRosterRaw), [withOutlook, myRosterRaw]);
  const allPlayers = useMemo(() => withOutlook(allPlayersRaw), [withOutlook, allPlayersRaw]);
  // Market values from real trades in leagues set up like this one, blended with our projections.
  const teamCount = partners.length + 1;
  const marketSettings = useMemo(
    () => (partners.length ? marketSettingsFor({ dynasty, teamCount, rosterSettings, ppr }) : null),
    [partners.length, dynasty, teamCount, rosterSettings, ppr],
  );
  const { data: marketData, error: marketError } = useMarketValues(marketSettings);
  const levels = useMemo(() => replacementLevels(allPlayers, teamCount, rosterSettings, scoring), [allPlayers, teamCount, rosterSettings, scoring]);
  // Ages only come with rostered players, so they're copied over before the market is lined up with our values.
  const agedPlayers = useMemo(() => {
    if (!dynasty) return allPlayers;
    const ages = new Map([...myRosterRaw, ...partners.flatMap((t) => t.players || [])].filter((p) => p.age).map((p) => [p.id, p.age]));
    return allPlayers.map((p) => (ages.has(p.id) ? { ...p, age: ages.get(p.id) } : p));
  }, [dynasty, allPlayers, myRosterRaw, partners]);
  const market = useMemo(
    () => buildMarket(marketData, agedPlayers, (p) => ownTradeScore(p, levels, scoring, dynasty).score),
    [marketData, agedPlayers, levels, scoring, dynasty],
  );
  const playerValue = market ? (p) => {
    const own = ownTradeScore(p, levels, scoring, dynasty).score;
    const mv = market.players[p.id]?.value;
    return market.toMarket(mv == null ? own : market.weight * market.toScore(mv) + (1 - market.weight) * own);
  } : null;
  const [partnerKey, setPartnerKey] = useState('');
  const [giveIds, setGiveIds] = useState([]);
  const [getIds, setGetIds] = useState([]);
  const [givePickIds, setGivePickIds] = useState([]);
  const [getPickIds, setGetPickIds] = useState([]);

  const [ideas, setIdeas] = useState(null);
  const [searching, setSearching] = useState(false);

  const partner = partners.find((p) => p.key === partnerKey) || partners[0];
  const choosePartner = (key) => { setPartnerKey(key); setGetIds([]); setGetPickIds([]); };
  // Suggestions go stale when the scoring or week changes.
  useEffect(() => { setIdeas(null); }, [scoring, week]);

  const partnerRosters = useMemo(
    () => partners.map((p) => ({ key: p.key, name: p.name, roster: withOutlook(withProjections(p.players, projectionsById, scoring, week)) })),
    [partners, projectionsById, scoring, week, withOutlook],
  );
  const needs = useMemo(
    () => (partners.length ? teamNeeds({
      teams: [{ key: 'mine', name: myTeamName || 'Your team', roster: myRoster, mine: true }, ...partnerRosters],
      rosterSettings, scoring,
    }) : null),
    [partners.length, partnerRosters, myRoster, myTeamName, rosterSettings, scoring],
  );

  const findIdeas = () => {
    setSearching(true);
    // Let the button show "Searching" before the work blocks the page for a moment.
    window.setTimeout(() => {
      setIdeas(findTrades({ myRoster, partners: partnerRosters, rosterSettings, scoring, allPlayers, dynasty, market }));
      setSearching(false);
    }, 30);
  };
  const tryIdea = (idea) => {
    setPartnerKey(idea.partnerKey);
    setGiveIds(idea.give.map((p) => p.id));
    setGetIds(idea.get.map((p) => p.id));
    setGivePickIds([]);
    setGetPickIds([]);
    window.setTimeout(() => document.querySelector('.trade-result')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };
  const allPicks = [...myPicks, ...partners.flatMap((p) => p.picks || [])];
  const firstPickSeason = allPicks.length ? Math.min(...allPicks.map((pick) => pick.season)) : null;
  const pickMarketValue = market ? (pick) => {
    const own = pickValue(pick, firstPickSeason);
    const mv = market.picks[`${pick.season}-${pick.round}`];
    return market.toMarket(mv == null ? own : 0.5 * market.toScore(mv) + 0.5 * own);
  } : null;

  const theirRoster = useMemo(
    () => partnerRosters.find((p) => p.key === partner?.key)?.roster || [],
    [partnerRosters, partner],
  );
  const toggle = (setIds) => (id) => setIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const give = myRoster.filter((p) => giveIds.includes(p.id));
  const get = theirRoster.filter((p) => getIds.includes(p.id));
  const givePicks = dynasty ? myPicks.filter((pick) => givePickIds.includes(pick.id)) : [];
  const getPicks = dynasty ? (partner?.picks || []).filter((pick) => getPickIds.includes(pick.id)) : [];
  const anything = giveIds.length + getIds.length + givePickIds.length + getPickIds.length > 0;
  const bothSides = (give.length || givePicks.length) && (get.length || getPicks.length);
  const tradeArgs = {
    give, get, myRoster, theirRoster, rosterSettings, scoring, allPlayers, teamCount,
    dynasty, givePicks, getPicks, firstPickSeason, levels, market,
  };
  // Re-rated on every tick, so the meter moves as players are added or removed.
  const live = anything ? analyzeTrade(tradeArgs) : null;
  const result = bothSides ? live : null;
  const balance = result
    ? balanceTrade({ ...tradeArgs, levels: result.levels, myPickPool: myPicks, theirPickPool: partner?.picks || [] })
    : [];
  const applyBalance = (option) => {
    const { item, side, action } = option;
    const isPick = !!item.round;
    const setter = side === 'give' ? (isPick ? setGivePickIds : setGiveIds) : (isPick ? setGetPickIds : setGetIds);
    setter((ids) => (action === 'add' ? [...ids, item.id] : ids.filter((id) => id !== item.id)));
  };
  const clearAll = () => { setGiveIds([]); setGetIds([]); setGivePickIds([]); setGetPickIds([]); };
  // The "?" explanations: worked out when tapped, from the same values as the verdicts.
  const whyUpdated = projectionsAt ? `updated ${timeAgo(new Date(projectionsAt).getTime())}` : null;
  const whyTrade = (rated, partnerName) => explainTrade(rated, { allPlayers, scoring, dynasty, partnerName });
  const whyIdea = (idea) => whyTrade(analyzeTrade({
    give: idea.give, get: idea.get, myRoster,
    theirRoster: partnerRosters.find((p) => p.key === idea.partnerKey)?.roster || [],
    rosterSettings, scoring, allPlayers, teamCount, dynasty, levels, market,
  }), idea.partnerName);

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
          <div className="trade-finder">
            <div className="trade-finder-head">
              <div>
                <strong>Trade finder</strong>
                <p className="startsit-help">Looks at every team in the league for trades that improve your starting lineup without gutting theirs.</p>
              </div>
              <button type="button" className="create-button" onClick={findIdeas} disabled={searching}>
                {searching ? 'Searching...' : ideas ? 'Search again' : 'Find trades for me'}
              </button>
            </div>
            {ideas && ideas.length === 0 && (
              <p className="startsit-empty">No trades found that clearly help you and look fair to them. Your lineup may already be well balanced.</p>
            )}
            {ideas && ideas.length > 0 && (
              <ul className="trade-ideas">
                {ideas.map((idea) => (
                  <li key={`${idea.partnerKey}-${idea.give.map((p) => p.id).join()}-${idea.get.map((p) => p.id).join()}`}>
                    <div className="trade-idea-main">
                      <small>With {idea.partnerName}</small>
                      <div>
                        Give <strong>{idea.give.map((p) => `${p.name} (${p.position})`).join(' + ')}</strong>
                        {' '}for <strong>{idea.get.map((p) => `${p.name} (${p.position})`).join(' + ')}</strong>
                      </div>
                      <small>
                        {idea.verdict.label}. Your lineup {signed(idea.myChange)} pts a week, theirs {signed(idea.theirChange)}.
                        <WhyButton label="Why this trade?" explain={() => whyIdea(idea)} updatedLabel={whyUpdated} />
                      </small>
                    </div>
                    <button type="button" className="edit-roster-button" onClick={() => tryIdea(idea)}>Check it</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {needs && (
            <details className="trade-needs">
              <summary>League needs: who is strong and weak at each position</summary>
              <TeamNeeds needs={needs} partnerKey={partner?.key} onPick={choosePartner} />
            </details>
          )}

          <label className="trade-partner">
            Trade with
            <select value={partner?.key || ''} onChange={(e) => choosePartner(e.target.value)}>
              {partners.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </label>
          {dynasty && (
            <p className="startsit-help">
              Dynasty league: younger players are worth more and older ones less (running backs fade first, quarterbacks last),
              and draft picks count. A 1st is valued like a solid starter, and picks further out are worth a bit less.
            </p>
          )}
          <p className="startsit-help trade-market-note">
            {market
              ? <>Values blend the trade market ({describeMarketSettings(market.settings)} leagues on FantasyCalc, from real trades) with our rest-of-season projections for your scoring{dynasty ? ' and player ages' : ''}, {Math.round(market.weight * 100)}/{Math.round((1 - market.weight) * 100)}.</>
              : marketError ? 'Trade market values could not be loaded, so values come from our projections only.' : 'Loading trade market values...'}
          </p>
          <div className="trade-grid">
            <TradePicks
              title="You give" players={myRoster} ids={giveIds} onToggle={toggle(setGiveIds)} scoring={scoring}
              dynasty={dynasty} picks={myPicks} pickIds={givePickIds} onTogglePick={toggle(setGivePickIds)}
              teamName={myTeamName} firstPickSeason={firstPickSeason} playerValue={playerValue} pickMarketValue={pickMarketValue}
            />
            <TradePicks
              title={`You get from ${partner?.name || 'them'}`} players={theirRoster} ids={getIds} onToggle={toggle(setGetIds)} scoring={scoring}
              dynasty={dynasty} picks={partner?.picks || []} pickIds={getPickIds} onTogglePick={toggle(setGetPickIds)}
              teamName={partner?.name} firstPickSeason={firstPickSeason} playerValue={playerValue} pickMarketValue={pickMarketValue}
            />
          </div>
          {live && <TradeMeter live={live} complete={!!result} />}
          {!result && <p className="startsit-help">Tick at least one player{dynasty ? ' or pick' : ''} on each side. Numbers are expected points per game for the rest of the season.</p>}
          {result && (
            <div className={`trade-result ${result.verdict.tone}`}>
              <strong className="trade-verdict">
                {result.verdict.label}
                <WhyButton label="Why this verdict?" explain={() => whyTrade(result, partner?.name)} updatedLabel={whyUpdated} />
              </strong>
              <p>{result.verdict.detail}</p>
              {result.valueVerdict.label !== result.verdict.label && (
                <p className="startsit-help">On player value alone: {result.valueVerdict.label.toLowerCase()}.</p>
              )}
              {balance.length > 0 && (
                <div className="trade-balance">
                  <strong>Make it fair</strong>
                  <ul>
                    {balance.map((option) => {
                      const name = option.item.round ? pickLabel(option.item, option.side === 'give' ? myTeamName : partner?.name) : `${option.item.name} (${option.item.position})`;
                      const verb = option.action === 'add'
                        ? (option.side === 'give' ? 'Also give' : 'Also ask for')
                        : (option.side === 'give' ? 'Keep' : 'Leave out');
                      return (
                        <li key={`${option.action}-${option.side}-${option.item.id}`}>
                          <span>
                            {verb} <strong>{name}</strong>
                            <small> {option.verdict.label.toLowerCase()}, your lineup {signed(option.myChange)}</small>
                          </span>
                          <button type="button" className="edit-roster-button" onClick={() => applyBalance(option)}>Apply</button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <div className="startsit-insight-stats">
                <div><span>Value you give</span><strong>{result.giveDisplay != null ? result.giveDisplay.toLocaleString() : result.giveTotal.toFixed(1)}</strong></div>
                <div><span>Value you get</span><strong>{result.getDisplay != null ? result.getDisplay.toLocaleString() : result.getTotal.toFixed(1)}</strong></div>
                <div><span>Your lineup</span><strong>{signed(result.myChange)}</strong></div>
                <div><span>Their lineup</span><strong>{signed(result.theirChange)}</strong></div>
              </div>
              {result.giveDisplay != null && (
                <p className="trade-favors">
                  {Math.abs(result.getDisplay - result.giveDisplay) < 1 ? 'Dead even on value'
                    : result.getDisplay > result.giveDisplay ? `Favors you by ${(result.getDisplay - result.giveDisplay).toLocaleString()}`
                      : `Favors ${partner?.name || 'them'} by ${(result.giveDisplay - result.getDisplay).toLocaleString()}`}
                </p>
              )}
              {result.adjustment && (
                <p className="startsit-help">
                  {['get', 'give'].filter((side) => result.adjustment[side]).map((side) => {
                    const adj = result.adjustment[side];
                    const amount = adj.display != null ? Math.abs(adj.display).toLocaleString() : Math.abs(adj.score).toFixed(1);
                    return side === 'get'
                      ? `Roster-spot adjustment: −${amount} on your side, since ${adj.players.join(' and ')} wouldn't crack your lineup and you'd have to cut someone to fit them.`
                      : `Roster-spot adjustment: −${amount} on their side, since ${adj.players.join(' and ')} wouldn't crack their lineup.`;
                  }).join(' ')}
                </p>
              )}
              <p className="startsit-help">
                Points per game are a rest-of-season outlook: what each player has scored (or their preseason ranking if they've barely
                played), Sleeper's projections for the weeks ahead, games they're likely to miss, teammates coming back or going out, and
                the defenses left on their schedule. Trade value mostly counts what a player scores above a starter you could find on waivers, plus a little for raw points
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
                        <span className="startsit-points">
                          draft pick, value {p.display != null ? `${p.display.toLocaleString()}${p.marketValue != null ? ` (market ${p.marketValue.toLocaleString()})` : ''}` : p.score.toFixed(1)}
                        </span>
                      </>
                    ) : (
                      <>
                        <button type="button" className="startsit-name" onClick={() => onOpen(p.id)}>{p.name}</button>
                        <small>{p.position}{dynasty && p.age ? `, age ${Math.floor(p.age)}` : ''}{p.role ? `, ${p.role}` : ''}</small>
                        {p.tag && <span className={`startsit-tag ${p.tag.key === 'buy' ? 'good' : 'caution'}`} title={p.tag.detail}>{p.tag.label}</span>}
                        <span className="startsit-points">
                          {p.display != null && <>value {p.display.toLocaleString()}{p.marketValue != null ? ` (market ${p.marketValue.toLocaleString()})` : ' (no market value, projections only)'}, </>}
                          {p.value.toFixed(1)} pts/game, {p.surplus.toFixed(1)} above waiver
                          {dynasty && p.ageFactor !== 1 ? `, age x${p.ageFactor}` : ''}{p.display == null ? `, value ${p.score.toFixed(1)}` : ''}
                        </span>
                        {p.outlook?.notes?.length > 0 && (
                          <ul className="trade-outlook">
                            {p.outlook.notes.slice(0, 3).map((note) => <li key={note}>{note}</li>)}
                          </ul>
                        )}
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
  const [rawProjections, setProjections] = useState(null);
  const [projectionError, setProjectionError] = useState('');
  const [loadingProjections, setLoadingProjections] = useState(true);
  // null means "this week", whatever Sleeper says that is.
  const [week, setWeek] = useState(null);
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
  const sleeperTeams = useMemo(() => sleeperImport?.teams || [], [sleeperImport]);
  // Points follow the scoring of the league being looked at (or the standard format picked).
  const {
    choice, setChoice, scoring, profile, options: scoringOptions, leagueValue,
  } = useLeagueScoring(sleeperTeams);
  const projections = useMemo(() => applyLeagueScoring(rawProjections, profile), [rawProjections, profile]);

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

  // Pick up new projections and injury news while the page stays open, without a loading screen.
  const refreshTick = useRefreshTick();
  useEffect(() => {
    if (refreshTick === 0) return undefined;
    let cancelled = false;
    axios.get(`${API_BASE_URL}/startsit${week ? `?week=${week}` : ''}`)
      .then((response) => { if (!cancelled) setProjections(response.data); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/GetLeagues`)
      .then((response) => setLeagues(response.data || []))
      .catch((error) => console.error('Error fetching leagues for start/sit:', error));
  }, []);

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
        setChoice(leagueValue(data.teams[0].leagueId));
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
    if (team) setChoice(leagueValue(team.leagueId));
  };

  const shownWeek = projections?.week || week;
  // This week's rank at each position (e.g. WR12), shown next to every player.
  const posRanks = useMemo(() => positionRanks(projections?.players || [], scoring), [projections, scoring]);
  const roster = useMemo(
    () => withProjections(rosterPlayers, projectionsById, scoring, shownWeek)
      .map((player) => ({ ...player, posRank: posRanks.get(player.id) || null })),
    [rosterPlayers, projectionsById, scoring, shownWeek, posRanks],
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
  ).map((player) => ({ ...player, posRank: posRanks.get(player.id) || null }));
  const verdict = compareVerdict(comparePlayers);
  // Players no team in this league has, for waiver suggestions on the "?" cards. Without a league
  // we only know the viewer's own list, so those suggestions come with a caveat.
  const waiverPool = useMemo(() => {
    if (!projections) return [];
    const rostered = new Set(rosterPlayers.map((p) => p.id));
    tradePartners.forEach((team) => team.players.forEach((p) => rostered.add(p.id)));
    const free = projections.players.filter((p) => !rostered.has(p.id));
    return withProjections(free, projectionsById, scoring, shownWeek)
      .map((player) => ({ ...player, posRank: posRanks.get(player.id) || null }));
  }, [projections, rosterPlayers, tradePartners, projectionsById, scoring, shownWeek, posRanks]);
  const waiverNote = activeSleeper
    ? 'Not on any roster in this league right now. Check your waiver order before claiming.'
    : activeTeam
      ? 'Not on any team in this league.'
      : "We can't see your league's rosters, so check these are still free agents.";
  // What the "?" buttons explain their calls with.
  const whyCtx = {
    defense: projections?.defense, allPlayers: projections?.players || [], scoring, waiverPool, waiverNote,
  };
  const whyUpdated = projections?.fetchedAt ? `updated ${timeAgo(new Date(projections.fetchedAt).getTime())}` : null;
  const maxComparePoints = Math.max(1, ...comparePlayers.map((p) => p.points || 0));
  const insightPlayer = insightId
    ? [...roster, ...comparePlayers].find((p) => p.id === insightId)
      || withProjections([projectionsById.get(insightId)].filter(Boolean), projectionsById, scoring, shownWeek)[0]
    : null;

  return (
    <LeagueScoringContext.Provider value={profile}>
    <div className="page-shell startsit-page">
      <section className="page-hero">
        <p className="page-kicker">In-season help</p>
        <h1>Start/Sit &amp; Trade Analyzer</h1>
        <p>The best lineup to set each week with the odds behind every call, and trade values that blend the real trade market with projections for your league's scoring.</p>
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
            <select value={choice} onChange={(e) => setChoice(e.target.value)}>
              {scoringOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
        {profile?.custom && (
          <p className="startsit-help league-scoring-note">
            Scored with {profile.leagueName}'s rules: {profile.details.join(', ')}.
          </p>
        )}
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
                              {sit && (
                                <WhyButton
                                  label={`Why start ${start.name} over ${sit.name}?`}
                                  explain={() => explainPair(start, sit, whyCtx)}
                                  updatedLabel={whyUpdated}
                                />
                              )}
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
                              <PlayerName player={player} scoring={scoring} onOpen={setInsightId}>
                                <WhyButton
                                  label={`Why start ${player.name}?`}
                                  explain={() => explainStarter(lineup, slot.key, whyCtx)}
                                  updatedLabel={whyUpdated}
                                />
                              </PlayerName>
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
                        <PlayerName player={p} scoring={scoring} onOpen={setInsightId}>
                          <WhyButton label={`Why sit ${p.name}?`} explain={() => explainBench(lineup, p.id, whyCtx)} updatedLabel={whyUpdated} />
                        </PlayerName>
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
                <WhyButton
                  label={`Why ${verdict.winner.name}?`}
                  explain={() => explainPair(verdict.winner, verdict.runnerUp, whyCtx)}
                  updatedLabel={whyUpdated}
                />
              </div>
            )}
          </section>

          <TradeCheck
            key={activeSource}
            dynasty={!!activeSleeper?.dynasty}
            ppr={activeSleeper ? Number(activeSleeper.scoringSettings?.rec ?? PPR_BY_SCORING[activeSleeper.scoring] ?? 1) : PPR_BY_SCORING[scoring] ?? 1}
            myPicks={activeSleeper?.picks || []}
            myTeamName={activeSleeper?.teamName || ''}
            myRoster={roster}
            partners={tradePartners}
            rosterSettings={rosterSettings}
            scoring={scoring}
            allPlayers={projections.players}
            projectionsById={projectionsById}
            week={shownWeek}
            defense={projections.defense}
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
            Tap a player for recent games, past games against this opponent, and injured teammates, or tap ? for why we made a call. WR12 means the 12th-most projected points among WRs this week (see Rankings for the full list). ▲/▼ shows the last 3 games against the season average.
            Projections and stats from Sleeper for the {projections.season} season, refreshed every {REFRESH_MINUTES} minutes, and this page updates itself while it's open (hit Refresh on your Sleeper team to reload a roster).
            Players listed Out, Doubtful or IR, and players on bye, are kept out of the lineup.
          </p>
        </>
      )}
    </div>
    </LeagueScoringContext.Provider>
  );
};

export default StartSit;
