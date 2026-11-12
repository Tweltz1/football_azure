import React from 'react';
import ClimbBackdrop from './ClimbBackdrop';
import StudioCredit from './StudioCredit';

/** First thing on the site before signing in: football (the draft site), party games or tabletop adventures. */
const FrontDoor = ({ onFootball }) => (
  <main className="login-page front-door">
    <ClimbBackdrop />
    <section className="front-door-panel">
      <p className="page-kicker">Welcome to</p>
      <h1>Hood League</h1>
      <p>What are we doing tonight?</p>
      <div className="front-door-choices">
        <button type="button" className="front-door-card" onClick={onFootball}>
          <span className="front-door-icon">🏈</span>
          <strong>Football</strong>
          <small>Leagues, auction drafts, rankings and start/sit. Sign in to continue.</small>
        </button>
        <a className="front-door-card is-games" href="/games-night">
          <span className="front-door-icon">🎃</span>
          <strong>Games</strong>
          <small>Halloween party games for a TV and up to 12 phones. Sign in or play as a guest.</small>
        </a>
        <a className="front-door-card is-games" href="/cards">
          <span className="front-door-icon">🃏</span>
          <strong>Card Table</strong>
          <small>500 and Dirty Clubs on your phones, no TV needed. Bots fill empty seats.</small>
        </a>
        <a className="front-door-card is-games is-dnd" href="/dnd">
          <span className="front-door-icon">🐉</span>
          <strong>Hood Quest</strong>
          <small>Fantasy tabletop quests on the TV with an AI narrator. Heroes join on their phones.</small>
        </a>
      </div>
    </section>
    <StudioCredit />
  </main>
);

export default FrontDoor;
