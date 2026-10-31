import React from 'react';
import ClimbBackdrop from './ClimbBackdrop';

/** First thing on the site before signing in: football (the draft site) or party games. */
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
          <small>Last Candle, a Halloween party game for a TV and up to 12 phones. Sign in or play as a guest.</small>
        </a>
      </div>
    </section>
  </main>
);

export default FrontDoor;
