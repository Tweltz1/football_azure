import React, { useState } from 'react';
import { SUIT_NAME, SUIT_SYMBOL, SUITS } from './cards';
import { CardFace, DesignContext, CutDeck, Hand, Scores, ScoreSheet, SheetButton, Status, suits, TableView } from './CardPhone';

// Dirty Clubs on a phone: the table, your hand, bidding, trump, play or fold, and the scores.

export const SEAT_COLORS = ['#4f7bff', '#ff5f6d', '#3ddc97', '#b98cff', '#ffae4a', '#4fd6e8'];

/** Dirty Clubs on a phone. game: the phone view from clubs.js. act(type, data) sends a move. */
function ClubsTable({ game, act, look, endButtons }) {
  const [sheet, setSheet] = useState(false);
  const me = game.seat;
  const seats = game.seats;
  const bidOf = (i) => {
    const b = game.bids.find((x) => x.seat === i);
    if (!b) return null;
    if (b.stuck) return 'Stuck: 2';
    return b.bid ? `Bid ${b.bid}` : 'Pass';
  };
  const playing = ['play', 'trick', 'hand'].includes(game.phase);
  const tableSeats = seats.map((x, i) => {
    const folded = x.in === false;
    let line = `score ${x.score}`;
    if (playing && !folded) line = `${x.tricks} trick${x.tricks === 1 ? '' : 's'} · score ${x.score}`;
    if (folded) line = `folded · score ${x.score}`;
    if (x.bot) line += ' · bot';
    else if (x.away) line += ' · away';
    let bubble = null;
    if (game.phase === 'bid' || game.phase === 'trump') bubble = bidOf(i);
    if (game.phase === 'stay') bubble = i === game.bidder ? `Bid ${game.high.bid}` : x.in === true ? "I'm in" : x.in === false ? 'Fold' : null;
    if (playing && i === game.bidder && game.high) bubble = `Bid ${game.high.bid}`;
    return {
      name: x.name,
      line,
      color: SEAT_COLORS[i % SEAT_COLORS.length],
      turn: game.turn === i && ['cut', 'bid', 'trump', 'play'].includes(game.phase),
      dim: folded,
      dealer: game.dealer === i,
      bubble,
      hot: bubble && game.high && game.high.seat === i,
    };
  });

  let center = null;
  if (['deal', 'bid', 'trump'].includes(game.phase) && game.upcard) {
    center = (
      <div className="lt-upcard">
        <CardFace card={game.upcard} small />
        <small>{game.dirty ? 'Dirty clubs! Everyone plays' : 'Turned up'}</small>
      </div>
    );
  }
  if (game.phase === 'cut') center = `${seats[game.turn].name} cuts`;
  if (game.phase === 'stay') center = 'Play or fold?';
  if (game.phase === 'play' && !game.trick.length) center = `${seats[game.turn].name} leads`;

  const head = (
    <div className="lcp-gamehead lt-head">
      <span>Hand {game.hand}</span>
      <span>{game.trump ? suits(`Trump ${SUIT_SYMBOL[game.trump]}${game.dirty ? ' · dirty!' : ''}`) : 'No trump yet'}</span>
      <span>{me >= 0 ? `You: ${game.score}` : 'Watching'}</span>
      <SheetButton onClick={() => setSheet(true)} />
    </div>
  );
  const table = <TableView seats={tableSeats} me={me} plays={game.trick.map((x) => ({ ...x, design: seats[x.seat]?.design || null }))} winner={game.winner} center={center} />;
  const ranked = seats.map((x, i) => ({ ...x, i })).sort((a, b) => a.score - b.score);
  const sheetView = sheet && (
    <ScoreSheet
      onClose={() => setSheet(false)}
      rule="Lowest score wins. Each trick takes 1 off your score. Getting set (or the bidder missing the bid) adds 5."
      totals={ranked.map((x) => ({ name: `${x.i === me ? 'You' : x.name}`, score: x.score, color: SEAT_COLORS[x.i % SEAT_COLORS.length] }))}
      hands={[...(game.history || [])].reverse().map((h) => ({
        key: h.hand,
        title: h.bidder && h.bid ? `Hand ${h.hand}: ${h.bidder} bid ${h.bid}${h.trump ? ` in ${SUIT_SYMBOL[h.trump]}` : ''}` : `Hand ${h.hand}`,
        note: h.dirty ? 'Dirty clubs: everyone had to play.' : null,
        lines: seats.map((x, i) => {
          const c = h.changes[i] || { change: 0, why: '' };
          return {
            name: i === me ? 'You' : x.name,
            color: SEAT_COLORS[i % SEAT_COLORS.length],
            why: c.why,
            change: c.change ? (c.change > 0 ? `+${c.change}` : String(c.change)) : '–',
            bad: c.change > 0,
            score: h.scores ? h.scores[i] : '',
          };
        }),
      }))}
    />
  );

  if (game.phase === 'final' && game.final) {
    const won = game.final.rank === 1;
    return (
      <>
        {head}
        {sheetView}
        <Status look={look} pose={won ? 'cheer' : 'stand'} big={won ? 'You won! 🎉' : `${game.final.winners.join(' & ')} win${game.final.winners.length === 1 ? 's' : ''}!`} line={`After ${game.hand} hands. Lowest score wins.`} />
        <Scores rows={ranked.map((x, k) => ({ name: `${k === 0 ? '🏆 ' : ''}${x.name}`, score: x.score, color: SEAT_COLORS[x.i % SEAT_COLORS.length] }))} />
        {endButtons}
      </>
    );
  }

  const highV = game.high ? game.high.bid : 0;
  const isDealer = me === game.dealer;
  let body = null;
  let interactive = null;
  if (game.phase === 'cut' || game.phase === 'deal') {
    body = (
      <>
        <CutDeck key={`cut${game.hand}`} size={game.deckSize} mine={game.phase === 'cut' ? game.myTurn : (game.dealer + 1) % seats.length === me} cutter={seats[(game.dealer + 1) % seats.length].name} cutAt={game.phase === 'deal' ? game.cutAt : null} left={game.cutLeft} onCut={(at) => act('cut', { at })} />
        {game.phase === 'deal' && game.dirty && <p className="lt-note is-good">♣ Dirty clubs! Everyone plays.</p>}
      </>
    );
  } else if (me < 0) {
    body = <Status look={look} big="👀 Watching" line={game.waiting ? "You'll take a bot's seat at the next deal." : 'All 6 seats are taken. Enjoy the show!'} />;
  } else if (game.phase === 'bid' && game.myTurn) {
    body = <Status look={look} pose="wave" big="Your bid!" line={game.high ? `To beat: ${game.high.bid} by ${seats[game.high.seat].name}` : 'Nobody has bid yet.'} />;
    interactive = (
      <>
        <div className="lt-bid-row is-big">
          {[2, 3, 4, 5].map((n) => <button type="button" key={n} disabled={n <= highV} onClick={() => act('bid', { bid: n })}>{n}</button>)}
        </div>
        <button type="button" className="lc-btn lc-btn-ghost lt-pass" onClick={() => act('bid', { bid: 0 })}>
          {isDealer && !game.high ? "Pass (you're stuck with 2)" : 'Pass'}
        </button>
      </>
    );
  } else if (game.phase === 'trump' && game.myTurn) {
    body = <Status look={look} pose="cheer" big={`You won the bid with ${game.high.bid}!`} line="Pick trump. Name clubs and nobody can fold." />;
    interactive = (
      <div className="lt-suits">
        {SUITS.map((s) => <button type="button" key={s} className={s === 'H' || s === 'D' ? 'is-red' : ''} onClick={() => act('trump', { suit: s })}>{SUIT_SYMBOL[s]}<small>{SUIT_NAME[s]}</small></button>)}
      </div>
    );
  } else if (game.phase === 'stay' && game.myIn === null) {
    body = <Status look={look} pose="wave" big="Play or fold?" line={`${seats[game.bidder].name} bid ${game.high.bid} in ${SUIT_SYMBOL[game.trump]} ${SUIT_NAME[game.trump]} · ${Math.ceil((game.left || 0) / 1000)}s`} />;
    interactive = (
      <div className="lt-bid-row is-big">
        <button type="button" className="is-in" onClick={() => act('stay', { in: true })}>I&apos;m in</button>
        <button type="button" onClick={() => act('stay', { in: false })}>Fold</button>
      </div>
    );
  } else if (game.phase === 'play' && game.myTurn) {
    body = <Status look={look} pose="wave" big="Your turn!" line={`Trump ${SUIT_SYMBOL[game.trump]} ${SUIT_NAME[game.trump]}`} />;
  } else if (game.phase === 'hand' && game.result) {
    const c = game.result.changes[me];
    body = (
      <>
        <Status look={look} pose={c.change < 0 ? 'cheer' : c.change > 0 ? 'scared' : 'stand'} big={c.change < 0 ? `${c.change} for you 🎉` : c.change > 0 ? `+${c.change}, you got set 😱` : 'No change for you'} line={c.why} />
        <Scores rows={ranked.map((x) => {
          const ch = game.result.changes[x.i];
          return { name: x.name, note: ch.why, score: x.score, color: SEAT_COLORS[x.i % SEAT_COLORS.length], change: ch.change ? (ch.change > 0 ? `+${ch.change}` : String(ch.change)) : '–', bad: ch.change > 0 };
        })}
        />
      </>
    );
  } else {
    let big = '';
    if (game.phase === 'bid') big = `${seats[game.turn].name} is bidding…`;
    if (game.phase === 'trump') big = `${seats[game.bidder].name} is picking trump…`;
    if (game.phase === 'stay') big = me === game.bidder ? 'Who will play against you?' : game.myIn ? "You're in!" : 'You folded';
    if (game.phase === 'play') big = game.myIn === false ? 'You folded this hand' : `${seats[game.turn].name}'s turn`;
    if (game.phase === 'trick') big = `${seats[game.winner].name} takes it`;
    body = big ? <Status look={look} pose={game.phase === 'trick' && game.winner === me ? 'cheer' : 'stand'} big={big} line={game.trump ? `Trump ${SUIT_SYMBOL[game.trump]} ${SUIT_NAME[game.trump]}` : ''} /> : null;
  }

  const hand = game.phase === 'play' && game.myTurn
    ? <Hand trump={game.trump} cards={game.cards} legal={game.legal || []} onPlay={(c) => act('play', { card: c })} />
    : <Hand trump={game.trump} cards={game.cards} />;

  return (
    <>
      {head}
      {sheetView}
      {table}
      {body}
      {interactive}
      {me >= 0 && hand}
    </>
  );
}

/** Your own cards use your card design; cards others play show theirs. */
export default function ClubsPhone(props) {
  const { game } = props;
  const mine = (game.seats[game.seat] || {}).design || 'classic';
  return <DesignContext.Provider value={mine}><ClubsTable {...props} /></DesignContext.Provider>;
}
