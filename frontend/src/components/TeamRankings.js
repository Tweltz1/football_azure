import React, { useEffect, useMemo, useState } from 'react';
import { loadLeagueSeason, playerByes } from '../data/leagueSeason';
import { leagueOutlookFrom, recordText, shortPercent, trajectoryText } from '../data/leagueOdds';
import { seasonRanks } from './StartSit';
import UpdatedAt from './UpdatedAt';

/** Power rankings and playoff, title and last-place odds for one Sleeper league. */
const TeamRankings = ({ leagueId, projections, scoring, rosterSettings, myIds }) => {
  const [season, setSeason] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setSeason(null);
    setError('');
    loadLeagueSeason(leagueId)
      .then((data) => { if (!cancelled) setSeason(data); })
      .catch((err) => { if (!cancelled) setError(err.response?.data || 'League standings are not available right now.'); });
    return () => { cancelled = true; };
  }, [leagueId]);

  const outlook = useMemo(() => (season && projections
    ? leagueOutlookFrom(season, { projections, scoring, rosterSettings, myIds, seasonRanks: seasonRanks(), byes: playerByes() })
    : null), [season, projections, scoring, rosterSettings, myIds]);

  if (error) return <p className="startsit-empty">{String(error)}</p>;
  if (!outlook) return <div className="loading-panel">Loading league standings...</div>;
  const mine = outlook.teams.find((t) => t.mine);

  return (
    <>
      <div className="updated-row">
        <UpdatedAt at={season.fetchedAt} label="Standings updated" staleAfterHours={1} />
      </div>
      {mine && <p className="team-rank-mine">{trajectoryText(mine, outlook)}</p>}
      <div className="rank-table-wrap">
        <table className="rank-table team-rank-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th className="num">Playoffs</th>
              <th className="num">Title</th>
              <th className="num">Last</th>
            </tr>
          </thead>
          <tbody>
            {outlook.powerOrder.map((team) => (
              <React.Fragment key={team.rosterId}>
                <tr className={team.mine ? 'mine' : ''}>
                  <td className="rank-num"><strong>{team.powerRank}</strong></td>
                  <td>
                    <button type="button" className="startsit-name" onClick={() => setOpenId(openId === team.rosterId ? null : team.rosterId)}>
                      {team.name}{team.mine ? ' (you)' : ''}
                    </button>
                    <br />
                    <small className="team-rank-sub">
                      {team.record.games ? `${recordText(team.record)} · ` : ''}{Math.round(team.strength)} a week
                    </small>
                  </td>
                  <td className="num">{shortPercent(team.playoffs)}</td>
                  <td className="num">{shortPercent(team.title)}</td>
                  <td className="num">{shortPercent(team.last)}</td>
                </tr>
                {openId === team.rosterId && (
                  <tr className="team-rank-detail">
                    <td />
                    <td colSpan={4}>{trajectoryText(team, outlook)}</td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="startsit-help">
        Ranked by how many points each team's best lineup should score a week for the rest of the season (our player values,
        who's hurt and bye weeks, mixed with points scored so far). Odds come from playing out the rest of the season and a
        {` ${outlook.playoffTeams}-team`} playoff thousands of times. Last is the chance of finishing last in the regular season. Tap a team for its outlook.
      </p>
    </>
  );
};

export default TeamRankings;
