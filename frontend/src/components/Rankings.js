import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../api';
import { SCORING_OPTIONS, defenseMatchup, isUnavailable, trendFor, withProjections } from '../data/startSitUtils';
import { POSITION_TABS, rankLabel, seasonRankings, weeklyRankings } from '../data/rankings';
import { initialPlayerList, playerPoolMeta } from '../data/playerData';
import { PlayerInsight } from './StartSit';
import UpdatedAt from './UpdatedAt';
import { REFRESH_MINUTES, useRefreshTick } from '../autoRefresh';
import '../App.css';
import './SeasonTools.css';
import './Rankings.css';

const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);
const PAGE = 40;
const VIEWS = [
  { value: 'week', label: 'This week' },
  { value: 'season', label: 'Season' },
];
const MATCHUP_LABEL = { good: 'Easy', average: 'Avg', tough: 'Tough' };

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

const posClass = (position) => `rank-pos pos-${String(position || '').toLowerCase()}`;

const Segmented = ({ options, value, onChange, label }) => (
  <div className="rank-segmented" role="tablist" aria-label={label}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="tab"
        aria-selected={value === option.value}
        className={value === option.value ? 'active' : ''}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const Change = ({ change }) => {
  if (change == null) return <span className="rank-change new" title="New in the rankings this week">New</span>;
  if (change === 0) return <span className="rank-change flat">–</span>;
  return (
    <span className={`rank-change ${change > 0 ? 'up' : 'down'}`} title="Spots moved at their position since last week">
      {change > 0 ? '▲' : '▼'} {Math.abs(change)}
    </span>
  );
};

/** Player ids on the viewer's Hood League rosters and saved Sleeper teams, with the team name. */
const useMyPlayers = (userId) => {
  const [mine, setMine] = useState(() => new Map());

  useEffect(() => {
    let cancelled = false;
    const found = new Map();
    const add = (id, teamName) => {
      if (id && !found.has(id)) found.set(id, teamName);
    };

    const hoodLeague = axios.get(`${API_BASE_URL}/GetLeagues`).then((response) => {
      for (const league of response.data || []) {
        const team = (league.teams || []).find((t) => t && t.ownerId === userId);
        for (const spot of team?.roster || []) add(spot?.player?.id, team.name);
      }
    });
    const sleeperName = readSetting('hl-startsit-sleeper-user', '');
    const sleeper = sleeperName
      ? axios.get(`${API_BASE_URL}/startsit/sleeper?username=${encodeURIComponent(sleeperName)}`).then((response) => {
        for (const team of response.data?.teams || []) {
          for (const player of team.players || []) add(player.id, team.teamName);
        }
      })
      : Promise.resolve();

    Promise.allSettled([hoodLeague, sleeper]).then(() => {
      if (!cancelled) setMine(found);
    });
    return () => { cancelled = true; };
  }, [userId]);

  return mine;
};

const WeeklyTable = ({ rows, tab, scoring, defense, mine, onOpen }) => (
  <div className="rank-table-wrap">
    <table className="rank-table">
      <thead>
        <tr>
          <th className="rank-num">#</th>
          <th>Player</th>
          <th>Matchup</th>
          <th className="num">Proj</th>
          <th className="num rank-hide-sm" title="Average of the last 3 games">Last 3</th>
          <th className="num rank-hide-sm">Avg</th>
          <th className="num rank-hide-sm" title="Rank at their position in the season rankings">Season</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((player) => {
          const trend = trendFor(player, scoring);
          const matchup = defenseMatchup(player, defense, scoring);
          const owner = mine.get(player.id);
          return (
            <tr key={player.id} className={owner ? 'mine' : ''}>
              <td className="rank-num">
                {tab === 'FLEX'
                  ? <><strong>{player.rank}</strong><span className={posClass(player.position)}>{rankLabel(player.position, player.positionRank)}</span></>
                  : <strong>{player.rank}</strong>}
              </td>
              <td>
                <button type="button" className="startsit-name" onClick={() => onOpen(player.id)}>{player.name}</button>
                <div className="rank-sub">
                  {player.team || 'FA'}
                  {player.injury && (
                    <span className={`startsit-tag ${isUnavailable(player.injury) ? 'warn' : 'caution'}`}>{player.injury}</span>
                  )}
                  {owner && <span className="rank-mine" title={owner}>Yours</span>}
                </div>
              </td>
              <td>
                {player.opponent ? <span className="startsit-matchup">vs {player.opponent}</span> : <span className="startsit-matchup">–</span>}
                {matchup && (
                  <span className={`rank-matchup ${matchup.verdict}`} title={`${player.opponent}: ${matchup.rankLabel}`}>
                    {MATCHUP_LABEL[matchup.verdict]}
                  </span>
                )}
              </td>
              <td className="num"><strong>{player.projection.toFixed(1)}</strong></td>
              <td className="num rank-hide-sm">
                {trend.lastThree == null ? '–' : (
                  <span className={`rank-trend ${trend.direction}`} title={`Last 3 games avg ${trend.lastThree}, season avg ${trend.season}`}>
                    {trend.lastThree.toFixed(1)}
                  </span>
                )}
              </td>
              <td className="num rank-hide-sm">{trend.season == null ? '–' : trend.season.toFixed(1)}</td>
              <td className="num rank-hide-sm">{player.seasonRank ? rankLabel(player.position, player.seasonRank) : '–'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const SeasonTable = ({ rows, tab, mine, week }) => (
  <div className="rank-table-wrap">
    <table className="rank-table">
      <thead>
        <tr>
          <th className="rank-num">#</th>
          <th>Player</th>
          <th className="num">Overall</th>
          <th className="num" title="Spots moved at their position since last week">Move</th>
          <th className="num rank-hide-sm">Bye</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((player) => {
          const owner = mine.get(player.id);
          const onBye = Number(player.bye) > 0 && Number(player.bye) === Number(week);
          return (
            <tr key={player.id} className={owner ? 'mine' : ''}>
              <td className="rank-num">
                {tab === 'FLEX'
                  ? <><strong>{player.rank}</strong><span className={posClass(player.position)}>{rankLabel(player.position, player.positionRank)}</span></>
                  : <strong>{player.rank}</strong>}
              </td>
              <td>
                <strong>{player.name}</strong>
                <div className="rank-sub">
                  {player.team || 'FA'}
                  {player.injuryStatus && (
                    <span className={`startsit-tag ${isUnavailable(player.injuryStatus) ? 'warn' : 'caution'}`}>{player.injuryStatus}</span>
                  )}
                  {onBye && <span className="startsit-tag caution">Bye</span>}
                  {owner && <span className="rank-mine" title={owner}>Yours</span>}
                </div>
              </td>
              <td className="num">{player.overallRank}</td>
              <td className="num"><Change change={player.change} /></td>
              <td className="num rank-hide-sm">{player.bye || '–'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const Rankings = ({ userId }) => {
  const [view, setView] = useState(() => readSetting('hl-rankings-view', 'week'));
  const [tab, setTab] = useState(() => readSetting('hl-rankings-position', 'QB'));
  const [scoring, setScoring] = useState(() => readSetting('hl-startsit-scoring', 'ppr'));
  // null means "this week", whatever Sleeper says that is.
  const [week, setWeek] = useState(null);
  const [search, setSearch] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [projections, setProjections] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [insightId, setInsightId] = useState(null);
  const mine = useMyPlayers(userId);

  useEffect(() => writeSetting('hl-rankings-view', view), [view]);
  useEffect(() => writeSetting('hl-rankings-position', tab), [tab]);
  useEffect(() => writeSetting('hl-startsit-scoring', scoring), [scoring]);
  useEffect(() => setShowAll(false), [view, tab, week, onlyMine]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    axios.get(`${API_BASE_URL}/startsit${week ? `?week=${week}` : ''}`)
      .then((response) => { if (!cancelled) setProjections(response.data); })
      .catch((err) => { if (!cancelled) setError(err.response?.data || 'Weekly projections are not available right now.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
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

  const season = useMemo(() => seasonRankings(initialPlayerList, tab), [tab]);
  const seasonRankById = useMemo(() => {
    const byId = new Map();
    for (const tabOption of POSITION_TABS.filter((t) => t.positions.length === 1)) {
      for (const player of seasonRankings(initialPlayerList, tabOption.value)) byId.set(player.id, player.positionRank);
    }
    return byId;
  }, []);

  const weekly = useMemo(() => {
    const { rows, hidden } = weeklyRankings(projections?.players || [], tab, scoring);
    return { rows: rows.map((row) => ({ ...row, seasonRank: seasonRankById.get(row.id) || null })), hidden };
  }, [projections, tab, scoring, seasonRankById]);

  const projectionsById = useMemo(
    () => new Map((projections?.players || []).map((p) => [p.id, p])),
    [projections],
  );

  const query = search.trim().toLowerCase();
  const matches = (player) => (!query || player.name.toLowerCase().includes(query) || String(player.team || '').toLowerCase() === query)
    && (!onlyMine || mine.has(player.id));
  const allRows = (view === 'week' ? weekly.rows : season).filter(matches);
  const rows = showAll || query || onlyMine ? allRows : allRows.slice(0, PAGE);

  const shownWeek = projections?.week || week;
  const insightPlayer = insightId && projectionsById.get(insightId)
    ? withProjections([projectionsById.get(insightId)], projectionsById, scoring, shownWeek)[0]
    : null;
  const tabLabel = POSITION_TABS.find((t) => t.value === tab)?.label || tab;

  return (
    <div className="page-shell startsit-page rankings-page">
      <section className="page-hero">
        <p className="page-kicker">In-season help</p>
        <h1>Rankings</h1>
        <p>Who to trust at each position: this week's projected ranks, and the season-long rankings with how they moved.</p>
        <div className="startsit-controls">
          <div className="rank-control">
            <span>View</span>
            <Segmented options={VIEWS} value={view} onChange={setView} label="Rankings view" />
          </div>
          {view === 'week' && (
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
          )}
          {view === 'week' && (
            <label>
              Scoring
              <select value={scoring} onChange={(e) => setScoring(e.target.value)}>
                {SCORING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          )}
        </div>
      </section>

      <section className="card startsit-panel">
        <div className="rank-toolbar">
          <Segmented options={POSITION_TABS} value={tab} onChange={setTab} label="Position" />
          <div className="rank-filters">
            <input
              type="search"
              className="startsit-search"
              placeholder="Search a player or team (e.g. KC)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="rank-check">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} disabled={mine.size === 0} />
              Only my players
            </label>
          </div>
        </div>

        {view === 'week' && (
          <>
            <div className="player-board-heading">
              <div>
                <p className="section-kicker">Week {shownWeek || ''} projections</p>
                <h2>{tabLabel} rankings</h2>
              </div>
              {projections && <div className="board-count">{weekly.rows.length} ranked</div>}
            </div>
            {loading && <div className="loading-panel">Loading projections...</div>}
            {error && !loading && <p className="startsit-empty">{String(error)}</p>}
            {projections && !loading && (
              <>
                <div className="updated-row">
                  <UpdatedAt at={projections.fetchedAt} label="Projections updated" staleAfterHours={2} />
                </div>
                {rows.length === 0
                  ? <p className="startsit-empty">{onlyMine ? `None of your players are ranked at ${tabLabel} this week.` : 'No players match.'}</p>
                  : <WeeklyTable rows={rows} tab={tab} scoring={scoring} defense={projections.defense} mine={mine} onOpen={setInsightId} />}
                {weekly.hidden > 0 && !query && !onlyMine && (
                  <p className="startsit-help">{weekly.hidden} {tabLabel} player{weekly.hidden === 1 ? ' has' : 's have'} no projection this week (out, on bye or not expected to play) and {weekly.hidden === 1 ? 'is' : 'are'} left off.</p>
                )}
              </>
            )}
          </>
        )}

        {view === 'season' && (
          <>
            <div className="player-board-heading">
              <div>
                <p className="section-kicker">Season rankings</p>
                <h2>{tabLabel} rankings</h2>
              </div>
              <div className="board-count">{season.length} ranked</div>
            </div>
            <div className="updated-row">
              <UpdatedAt at={playerPoolMeta.fetchedAt} label="Rankings updated" staleAfterHours={24 * 8} />
            </div>
            {rows.length === 0
              ? <p className="startsit-empty">{onlyMine ? `None of your players are in the ${tabLabel} rankings.` : 'No players match.'}</p>
              : <SeasonTable rows={rows} tab={tab} mine={mine} week={projections?.currentWeek} />}
          </>
        )}

        {!showAll && !query && !onlyMine && allRows.length > rows.length && (
          <button type="button" className="edit-roster-button rank-more" onClick={() => setShowAll(true)}>
            Show all {allRows.length}
          </button>
        )}
      </section>

      {insightPlayer && projections && (
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
        This week ranks players by their Sleeper projection for the week, refreshed every {REFRESH_MINUTES} minutes, and this page updates itself while it's open. Matchup compares this week's
        opponent with what other defenses have allowed to that position (Easy is the top third, Tough the bottom third).
        Season rankings are Sleeper's overall rankings, updated every Tuesday morning; Move is how many spots a player went up or
        down at their position since the week before. Tap a player for recent games and past games against this opponent.
      </p>
    </div>
  );
};

export default Rankings;
