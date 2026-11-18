import React, { useEffect, useState } from 'react';
import { initialPlayerList } from '../data/playerData';
import StudioCredit from '../components/StudioCredit';
import {
  BUDGET, SLOTS, bid, finish, grade, maxBid, newDraft, nominate, nominationChoices, slotFor, sold, youOf,
} from './mockAuction';
import './mock.css';

const clone = (d) => ({ ...d });
const teamName = (d, id) => d.teams.find((t) => t.id === id)?.name || '';

function Roster({ you, long }) {
  return (
    <ol className="mock-roster">
      {SLOTS.map((s, i) => {
        const p = you.roster.find((r) => r.slot === i);
        const who = p ? (long ? `${p.player.name} (${p.player.position}, ${p.player.team})` : `${p.player.name} (${p.player.team})`) : 'Open';
        return <li key={i}><b>{s}</b><span>{who}</span><em>{p ? `$${p.price}` : ''}</em></li>;
      })}
    </ol>
  );
}

/** hood-league.com/mock-draft: a practice auction draft against 9 bots. No sign-in, nothing saved. */
export default function GuestMockDraft() {
  const [d, setD] = useState(() => newDraft(initialPlayerList));
  const [pick, setPick] = useState('');
  const you = youOf(d);
  const lot = d.lot;

  useEffect(() => { document.title = 'Free fantasy football mock auction draft | Hood League'; }, []);

  const act = (fn) => setD((prev) => clone(fn(prev)));
  const restart = () => { setPick(''); setD(newDraft(initialPlayerList)); };
  const cap = maxBid(you);
  const canBid = Boolean(lot?.player) && lot.leader !== 'you' && slotFor(you.roster, lot.player.position) !== null && cap > lot.price;
  const last = d.log[d.log.length - 1];

  if (d.done) {
    const g = grade(d);
    return (
      <main className="mock-page">
        <header className="mock-head"><a href="/">Hood League</a><span>Mock auction draft</span></header>
        <section className="mock-card mock-done">
          <p className="mock-kicker">Draft done</p>
          <h1>Your grade: {g.letter}</h1>
          <p>You spent ${g.spent} of ${BUDGET} and drafted ${g.value} of player value, the #{g.rank} roster of 10.</p>
          <Roster you={you} long />
          <div className="mock-actions">
            <button type="button" className="mock-btn" onClick={restart}>Draft again</button>
            <a className="mock-btn is-gold" href="/?football=1">Run your league's real draft here, free</a>
          </div>
          <p className="mock-note">Hood League runs live auction drafts for your whole league: everyone bids from their phone, the TV shows the board, and it keeps the budget math for you.</p>
        </section>
        <StudioCredit />
      </main>
    );
  }

  return (
    <main className="mock-page">
      <header className="mock-head"><a href="/">Hood League</a><span>Mock auction draft · no sign-in</span></header>
      <section className="mock-card">
        <div className="mock-budget">
          <span>Your budget <b>${you.budget}</b></span>
          <span>Spots left <b>{SLOTS.length - you.roster.length}</b></span>
          <span>Max bid <b>${cap}</b></span>
        </div>

        {lot?.yourTurn && (
          <div className="mock-nominate">
            <p className="mock-kicker">Your turn to nominate</p>
            <label>
              Put a player up for auction
              <select value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Pick a player…</option>
                {nominationChoices(d).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.position}, {p.team}) · about ${p.value}</option>)}
              </select>
            </label>
            <button type="button" className="mock-btn" disabled={!pick} onClick={() => { act((x) => nominate(x, pick, 1)); setPick(''); }}>Nominate for $1</button>
          </div>
        )}
        {!lot?.yourTurn && lot?.player && (
          <div className="mock-lot">
            <p className="mock-kicker">On the block · nominated by {d.teams[d.nominator].name}</p>
            <h1>{lot.player.name}</h1>
            <p className="mock-meta">{lot.player.position} · {lot.player.team} · Rank #{lot.player.rank} · worth about ${lot.player.value}</p>
            <p className={`mock-price ${lot.leader === 'you' ? 'is-you' : ''}`}>${lot.price}<small>{lot.leader === 'you' ? 'Your bid is high' : `${teamName(d, lot.leader)} is high`}</small></p>
            <div className="mock-actions">
              {[1, 5, 10].map((n) => (
                <button key={n} type="button" className="mock-btn" disabled={!canBid || lot.price + n > cap} onClick={() => act((x) => bid(x, lot.price + n))}>Bid ${lot.price + n}</button>
              ))}
              <button type="button" className="mock-btn is-ghost" onClick={() => act(sold)}>{lot.leader === 'you' ? 'Sold to me' : 'Let it go'}</button>
            </div>
            {slotFor(you.roster, lot.player.position) === null && <p className="mock-note">Your roster has no spot left for a {lot.player.position}.</p>}
          </div>
        )}
        {last && <p className="mock-last">Last sold: <b>{last.player.name}</b> to {teamName(d, last.teamId)} for ${last.price}</p>}
        <button type="button" className="mock-link" onClick={() => act(finish)}>Skip to the end (fill my open spots with $1 players)</button>
      </section>

      <section className="mock-card">
        <h2>Your roster</h2>
        <Roster you={you} />
      </section>

      <section className="mock-card">
        <h2>The bots</h2>
        <ul className="mock-bots">
          {d.teams.slice(1).map((t) => <li key={t.id}><span>{t.name}</span><em>${t.budget} · {t.roster.length}/{SLOTS.length}</em></li>)}
        </ul>
        <p className="mock-note">Practice only: nothing here is saved. <a href="/?football=1">Sign in</a> to run a real draft with your league.</p>
      </section>
      <StudioCredit />
    </main>
  );
}
