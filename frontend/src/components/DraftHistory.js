import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../api';
import { buildDraftRecap } from '../data/strategyUtils';
import '../App.css';
import './LeagueTools.css';
import './SeasonTools.css';

const formatDate = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const draftLabel = (entry) => `${entry.season} draft${entry.draftMode === 'manual' ? ' (manual)' : ''}`;

export const DraftHistoryList = ({ userId }) => {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`${API_BASE_URL}/history`)
      .then((response) => setEntries(response.data || []))
      .catch((err) => setError(err.response?.data || 'Could not load your draft history.'));
  }, [userId]);

  if (error) return <div className="empty-state"><h3>Draft history unavailable</h3><p>{String(error)}</p></div>;
  if (!entries) return <div className="loading-panel">Loading draft history...</div>;

  const leagueCount = new Set(entries.map((e) => e.leagueId)).size;

  return (
    <div className="page-shell history-page">
      <section className="page-hero">
        <p className="page-kicker">The archives</p>
        <h1>Draft History</h1>
        <p>Every finished draft from your leagues, kept even after a league starts a new season.</p>
        <div className="scoreboard-strip">
          <span>{entries.length} draft{entries.length === 1 ? '' : 's'}</span>
          <span>{leagueCount} league{leagueCount === 1 ? '' : 's'}</span>
        </div>
      </section>

      {entries.length === 0 ? (
        <div className="empty-state">
          <h3>No finished drafts yet</h3>
          <p>When a draft in one of your leagues finishes, it shows up here.</p>
        </div>
      ) : (
        <div className="history-grid">
          {entries.map((entry) => (
            <Link key={entry.id} to={`/history/${encodeURIComponent(entry.id)}`} className="history-card card">
              <p className="section-kicker">{draftLabel(entry)}</p>
              <h3>{entry.leagueName}</h3>
              <div className="recap-row"><span>Finished</span><strong>{formatDate(entry.completedAt)}</strong></div>
              <div className="recap-row"><span>Your team</span><strong>{entry.myTeamName || 'No team'}</strong></div>
              <div className="recap-row"><span>Teams / picks</span><strong>{entry.teamCount} / {entry.pickCount}</strong></div>
              {entry.topPick && (
                <div className="recap-row">
                  <span>Top price</span>
                  <strong>{entry.topPick.name} ${entry.topPick.price}</strong>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

const csvFor = (entry, teamName) => {
  const esc = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = ['Pick Number,Player Name,Position,NFL Team,Winning Bid,Drafted By'];
  entry.draftLog.forEach((pick, index) => {
    lines.push([index + 1, esc(pick.player?.name), pick.player?.position, pick.player?.team, pick.winningBid, esc(teamName(pick.winningTeamId))].join(','));
  });
  return lines.join('\r\n') + '\r\n';
};

const RecapCard = ({ title, pick, detail, teamName }) => (
  <div className="recap-card">
    <p className="section-kicker">{title}</p>
    {pick ? (
      <>
        <h3>{pick.player?.name || 'Unknown Player'}</h3>
        <div className="recap-row"><span>Team</span><strong>{teamName(pick.winningTeamId)}</strong></div>
        <div className="recap-row"><span>Detail</span><strong>{detail(pick)}</strong></div>
      </>
    ) : <p>No data.</p>}
  </div>
);

export const DraftHistoryDetail = ({ userId }) => {
  const { historyId } = useParams();
  const [entry, setEntry] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setEntry(null);
    setError('');
    axios.get(`${API_BASE_URL}/history/${encodeURIComponent(historyId)}`)
      .then((response) => setEntry(response.data))
      .catch((err) => setError(err.response?.data || 'Could not load this draft.'));
  }, [historyId]);

  const teamsWithPicks = useMemo(() => {
    if (!entry) return [];
    return entry.teams
      .map((team) => {
        const picks = entry.draftLog.filter((pick) => pick.winningTeamId === team.id);
        const spent = picks.reduce((sum, pick) => sum + (Number(pick.winningBid) || 0), 0);
        return { team, picks, spent };
      })
      .sort((a, b) => (a.team.ownerId === userId ? -1 : b.team.ownerId === userId ? 1 : b.spent - a.spent));
  }, [entry, userId]);

  if (error) {
    return (
      <div className="empty-state">
        <h3>Draft not found</h3>
        <p>{String(error)}</p>
        <Link to="/history">Back to draft history</Link>
      </div>
    );
  }
  if (!entry) return <div className="loading-panel">Loading draft...</div>;

  const teamName = (teamId) => entry.teams.find((t) => t.id === teamId)?.name || 'Unknown team';
  const recap = buildDraftRecap(entry);
  const totalSpent = entry.draftLog.reduce((sum, pick) => sum + (Number(pick.winningBid) || 0), 0);

  const downloadCsv = () => {
    const blob = new Blob([csvFor(entry, teamName)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${entry.leagueName}-${entry.season}-DraftResults.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-shell history-page">
      <section className="page-hero">
        <p className="page-kicker"><Link to="/history">Draft history</Link> / {draftLabel(entry)}</p>
        <h1>{entry.leagueName}</h1>
        <p>Finished {formatDate(entry.completedAt)}.</p>
        <div className="scoreboard-strip">
          <span>{entry.teams.length} teams</span>
          <span>{entry.draftLog.length} picks</span>
          <span>${totalSpent} spent</span>
          <button type="button" className="join-button" onClick={downloadCsv}>Download CSV</button>
        </div>
      </section>

      {recap.picks > 0 && (
        <section className="card league-analyzer-panel">
          <h2>Draft Recap</h2>
          <div className="recap-grid">
            <RecapCard title="Best Value" pick={recap.bestValue} teamName={teamName} detail={(pick) => `$${pick.winningBid} vs est. $${pick.estimate}`} />
            <RecapCard title="Biggest Overpay" pick={recap.biggestOverpay} teamName={teamName} detail={(pick) => `$${pick.winningBid} vs est. $${pick.estimate}`} />
            {recap.biggestWar?.bidCount > 1 && (
              <RecapCard title="Bidding War" pick={recap.biggestWar} teamName={teamName} detail={(pick) => `${pick.bidCount} teams bid`} />
            )}
          </div>
        </section>
      )}

      <section className="history-teams">
        {teamsWithPicks.map(({ team, picks, spent }) => (
          <div key={team.id} className={`card history-team ${team.ownerId === userId ? 'mine' : ''}`}>
            <div className="player-board-heading">
              <div>
                <p className="section-kicker">{team.ownerId === userId ? 'Your team' : 'Team'}</p>
                <h3>{team.name}</h3>
              </div>
              <div className="board-count">${spent}</div>
            </div>
            {picks.length === 0 ? <p className="startsit-empty">No players.</p> : (
              <ul className="history-roster">
                {picks.map((pick) => (
                  <li key={pick.player.id}>
                    <span className="startsit-slot">{pick.player.position}</span>
                    <span className="history-player">{pick.player.name} <small>{pick.player.team}</small></span>
                    <strong>${pick.winningBid}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Every Pick</h2>
        <table className="leagues-table">
          <thead>
            <tr><th>#</th><th>Player</th><th>Pos</th><th>Price</th><th>Team</th></tr>
          </thead>
          <tbody>
            {entry.draftLog.map((pick, index) => (
              <tr key={`${pick.player.id}-${index}`}>
                <td>{index + 1}</td>
                <td>{pick.player.name} <small>{pick.player.team}</small></td>
                <td>{pick.player.position}</td>
                <td>${pick.winningBid}</td>
                <td>{teamName(pick.winningTeamId)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
};
