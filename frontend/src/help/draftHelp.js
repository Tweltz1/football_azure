import React from 'react';

// Plain-words explanations shown behind the "?" buttons and in the no-internet notice.

export const DraftModeHelp = () => (
  <>
    <ul>
      <li><strong>Auction Draft:</strong> the site runs the draft. A player comes up, a clock runs, and every team bids in secret. Nobody sees anyone's bid until the clock hits zero, then the highest bid wins the player.</li>
      <li><strong>Manual Draft:</strong> you run the draft your own way (out loud, on paper, any order). The commissioner picks the player, then enters the winning team and price. Good for in-person drafts.</li>
    </ul>
  </>
);

export const BiddingStyleHelp = () => (
  <>
    <p>How teams send their secret bids in an auction draft:</p>
    <ul>
      <li><strong>Standard:</strong> everyone types a bid on their phone or computer. Highest bid wins automatically.</li>
      <li><strong>Whiteboard – manual:</strong> everyone writes a bid on a whiteboard. Boards flip when the clock hits zero, and the commissioner enters the winner.</li>
      <li><strong>Whiteboard – auto-read:</strong> same whiteboards, but the camera reads the numbers and the commissioner just confirms the winner.</li>
    </ul>
    <p>Ties go to a quick re-bid between the tied teams.</p>
  </>
);

export const RosterHelp = () => (
  <p>
    How many players of each position a full team holds. FLEX takes an RB, WR or TE. SUPERFLEX also takes a QB.
    BENCH is extra spots. The total is how many players each team drafts, and every team keeps $1 for each open spot.
  </p>
);

export const TimerHelp = () => (
  <ul>
    <li><strong>Bid Timer:</strong> how long teams have to bid on each player.</li>
    <li><strong>Intermission:</strong> the break between players, to see who won and plan the next bid.</li>
    <li><strong>Re-bid Timer:</strong> the clock for a tie-breaker round between tied teams.</li>
  </ul>
);

export const NoInternetHelp = () => (
  <>
    <p><strong>Nearby-phones draft</strong> (iPhones only)</p>
    <ul>
      <li>Every team needs an iPhone with the Hood League app.</li>
      <li>The commissioner opens the league and taps <em>Save for nearby draft</em>. Everyone else opens the league and taps <em>Get ready for nearby draft</em>.</li>
      <li>Best done before the draft with internet. Missed it? It still works with no internet if each phone opened the app with internet since joining the league.</li>
      <li>At the draft: turn on Wi-Fi and Bluetooth in Control Center (you don't need to join a network) and stay in the same room. Tap Allow if the phone asks to find devices nearby.</li>
      <li>The commissioner's phone runs the draft. Bids stay secret, just like online.</li>
    </ul>
    <p><strong>One-device draft</strong> (any phone or computer)</p>
    <ul>
      <li>The commissioner opens the league and taps <em>Save for offline draft</em> (best done with internet).</li>
      <li>Bids happen on paper or whiteboards, and the commissioner enters each winner and price.</li>
    </ul>
    <p><strong>No setup at all?</strong> In the app, the commissioner can make a new league with no internet (Create, or "Host a draft on this phone" on the sign-in page). It shows a 4-digit room code; everyone else taps "Join a nearby draft" and types it. A player whose phone died can rejoin as their team the same way, and the commissioner can bid for a team that isn't connected.</p>
    <p>Either way, open the league again when you're back online to upload the results.</p>
  </>
);
