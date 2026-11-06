import React, { useEffect, useState } from 'react';
import { SUIT_NAME, SUIT_SYMBOL, SUITS } from './cards';
import { CardFace, DesignContext, cardName, CutDeck, Hand, Scores, ScoreSheet, SheetButton, Status, suits, TableView } from './CardPhone';

// 500 on a phone: the table, your hand, bidding, the kitty, and the scores.

export const TEAM_COLORS = ['#4f7bff', '#ff5f6d'];
const BID_SUITS = ['S', 'C', 'D', 'H', 'NT'];
const VALUE = (n, s) => 40 + (n - 6) * 100 + BID_SUITS.indexOf(s) * 20;
export const bidName = (b) => {
  if (b === 'MIS') return 'Nola';
  if (b === 'OPEN') return 'Double Nola';
  if (b === 'PASS') return 'Pass';
  return `${b.replace(/\D+$/, '')}${b.endsWith('NT') ? ' NT' : SUIT_SYMBOL[b.slice(-1)]}`;
};

const BidPicker = ({ canBid, onBid }) => (
  <div className="lt-bids">
    <div className="lt-bid-grid">
      <span />
      {BID_SUITS.map((s) => <b key={s} className={s === 'H' || s === 'D' ? 'is-red' : ''}>{s === 'NT' ? 'NT' : `${SUIT_SYMBOL[s]}︎`}</b>)}
      {[6, 7, 8, 9, 10].map((n) => (
        <React.Fragment key={n}>
          <b>{n}</b>
          {BID_SUITS.map((s) => {
            const b = `${n}${s}`;
            return <button type="button" key={b} disabled={!canBid.includes(b)} onClick={() => onBid(b)}><small>{VALUE(n, s)}</small></button>;
          })}
        </React.Fragment>
      ))}
    </div>
    <div className="lt-bid-row">
      <button type="button" disabled={!canBid.includes('MIS')} onClick={() => onBid('MIS')}>Nola <small>170 · you alone, no tricks</small></button>
      <button type="button" disabled={!canBid.includes('OPEN')} onClick={() => onBid('OPEN')}>Double Nola <small>380 · both of you, no tricks</small></button>
    </div>
    <button type="button" className="lc-btn lc-btn-ghost lt-pass" onClick={() => onBid('PASS')}>Pass</button>
  </div>
);

const Discard = ({ cards, kitty, count, handsOne, onDone }) => {
  const [pick, setPick] = useState([]);
  const [give, setGive] = useState(null);
  const toggle = (c) => setPick((p) => (p.includes(c) ? p.filter((x) => x !== c) : p.length >= count ? p : [...p, c]));
  if (handsOne && pick.length === count) {
    return (
      <div className="lt-handbox">
        <p className="lt-status-line">Which of these 5 goes to your partner? They&apos;ll throw one of theirs away (the Joker, maybe).</p>
        <div className="lt-hand">
          {pick.map((c) => <CardFace key={c} card={c} on={give === c} onClick={() => setGive(c)} />)}
        </div>
        <button type="button" className="lc-btn lc-btn-big" disabled={!give} onClick={() => onDone(pick, give)}>{give ? suits(`Hand ${cardName(give)} to your partner`) : 'Tap the card to hand over'}</button>
        <button type="button" className="lcp-link" onClick={() => { setPick([]); setGive(null); }}>Start over</button>
      </div>
    );
  }
  return (
    <div className="lt-handbox">
      <div className="lt-hand">
        {cards.map((c) => <CardFace key={c} card={c} on={pick.includes(c)} onClick={() => toggle(c)} tag={kitty.includes(c) ? 'new' : null} />)}
      </div>
      <button type="button" className="lc-btn lc-btn-big" disabled={pick.length !== count} onClick={() => onDone(pick, null)}>
        {pick.length === count ? (handsOne ? 'Next: pick one for your partner' : `Throw these ${count} away`) : `Pick ${count - pick.length} more to discard`}
      </button>
    </div>
  );
};

const PassPick = ({ cards, got, onPass }) => {
  const [pick, setPick] = useState(null);
  return (
    <div className="lt-handbox">
      <div className="lt-hand">
        {cards.map((c) => <CardFace key={c} card={c} on={pick === c} onClick={() => setPick(pick === c ? null : c)} tag={c === got ? 'from partner' : null} />)}
      </div>
      <button type="button" className="lc-btn lc-btn-big" disabled={!pick} onClick={() => onPass(pick)}>{pick ? suits(`Throw ${cardName(pick)} away`) : 'Tap a card to throw away'}</button>
    </div>
  );
};

const NameSuit = ({ onPick, onCancel }) => (
  <div className="lt-namesuit">
    <p className="lt-status-big">Leading the Joker: which suit must everyone follow?</p>
    <div className="lt-suits">
      {SUITS.map((s) => <button type="button" key={s} className={s === 'H' || s === 'D' ? 'is-red' : ''} onClick={() => onPick(s)}>{SUIT_SYMBOL[s]}<small>{SUIT_NAME[s]}</small></button>)}
    </div>
    <button type="button" className="lcp-link" onClick={onCancel}>Play a different card</button>
  </div>
);

/** 500 on a phone. game: the phone view from five.js. act(type, data) sends a move. */
function FiveTable({ game, act, look, endButtons }) {
  const [joker, setJoker] = useState(false);
  const [sheet, setSheet] = useState(false);
  useEffect(() => { setJoker(false); }, [game.phase, game.trick.length]);

  const me = game.seat;
  const seats = game.seats;
  const us = game.myTeam;
  const lastBid = (i) => { const b = [...game.bids].reverse().find((x) => x.seat === i); return b ? bidName(b.bid) : null; };
  const contract = game.contract;
  const tableSeats = seats.map((x, i) => {
    let line = x.bot ? 'bot' : x.away ? 'away (bot plays)' : '';
    if (x.out) line = 'sitting out';
    else if (['play', 'trick', 'hand'].includes(game.phase)) line = `${x.tricks} trick${x.tricks === 1 ? '' : 's'}${x.bot ? ' · bot' : ''}`;
    else if (game.phase === 'bid' && game.passedSeats?.[i]) line = 'passed';
    let bubble = null;
    if (game.phase === 'bid') bubble = lastBid(i);
    if (contract && contract.seat === i && game.phase !== 'bid') bubble = bidName(contract.bid);
    return {
      name: x.name,
      won: ['play', 'trick', 'hand'].includes(game.phase) ? x.tricks : 0,
      design: x.design || null,
      avatar: x.avatar || null,
      line,
      color: TEAM_COLORS[x.team],
      turn: game.turn === i && ['cut', 'bid', 'pass', 'kitty', 'play'].includes(game.phase),
      dim: x.out,
      dealer: game.dealer === i,
      bubble,
      hot: bubble && ((game.high && game.high.seat === i) || (contract && contract.seat === i)),
    };
  });

  let center = null;
  if (game.phase === 'cut') center = `${seats[game.turn].name} cuts`;
  if (game.phase === 'deal') center = 'Dealing…';
  if (game.phase === 'nobid') center = 'Everyone passed. New deal!';
  if (game.phase === 'bid') center = game.high ? `High bid: ${bidName(game.high.bid)}` : 'Bidding…';
  if (game.phase === 'pass') center = `${seats[game.turn].name} swaps a card`;
  if (game.phase === 'kitty') center = `${seats[contract.seat].name} takes the kitty`;
  if (game.phase === 'play' && !game.trick.length) center = `${seats[game.turn].name} leads`;
  if (game.phase === 'trick') center = null;
  if (game.named) center = `Joker asks for ${SUIT_SYMBOL[game.named]}`;
  const trumpText = contract
    ? (contract.bid === 'MIS' ? 'Nola: no trump' : contract.bid === 'OPEN' ? 'Double Nola: no trump' : game.trump ? `Trump ${SUIT_SYMBOL[game.trump]} ${SUIT_NAME[game.trump]}` : 'No Trump')
    : '';
  const head = (
    <div className="lcp-gamehead lt-head">
      <span>Hand {game.hand}</span>
      <span>{contract ? suits(`${seats[contract.seat].name}: ${bidName(contract.bid)}`) : 'Bidding'}</span>
      {[0, 1].map((t) => <span key={t} className="lt-teamscore" style={{ background: TEAM_COLORS[t] }}>{t === us ? 'Us' : us == null ? `T${t + 1}` : 'Them'} {game.scores[t]}</span>)}
      <SheetButton onClick={() => setSheet(true)} />
    </div>
  );
  const sideName = (t) => (t === us ? `Us (${game.teams[t]})` : us == null ? game.teams[t] : `Them (${game.teams[t]})`);
  const sheetView = sheet && (
    <ScoreSheet
      onClose={() => setSheet(false)}
      rule="The bidding team wins or loses its bid's value. The other team gets 10 a trick (nothing on Nola). First to 500 on their own bid wins."
      totals={[0, 1].map((t) => ({ name: sideName(t), score: game.scores[t], color: TEAM_COLORS[t] }))}
      hands={[...(game.history || [])].reverse().map((h) => {
        let how = h.made ? `made it${h.slam ? ' with all 10 (250)' : ''}` : 'got set';
        if (h.oppTook != null) how += `, took ${h.took} of 10`;
        else how += h.made ? ', no tricks' : `, took ${h.took}`;
        return {
          key: h.hand,
          title: `Hand ${h.hand}: ${h.bidder} bid ${h.label}`,
          note: `${h.bidder} ${how}.`,
          lines: [0, 1].map((t) => {
            const gain = t === h.team ? h.points : h.oppPoints;
            let why = '';
            if (t === h.team) why = h.made ? `made ${h.label}` : `set on ${h.label}`;
            else if (h.oppTook != null) why = `${h.oppTook} trick${h.oppTook === 1 ? '' : 's'} × 10${gain < h.oppTook * 10 ? ' (capped at 490)' : ''}`;
            else why = 'nothing on Nola';
            return { name: sideName(t), color: TEAM_COLORS[t], change: gain >= 0 ? `+${gain}` : String(gain), bad: gain < 0, why, score: h.scores ? h.scores[t] : '' };
          }),
        };
      })}
    />
  );
  const table = <TableView seats={tableSeats} me={me} plays={game.trick.map((x) => ({ ...x, design: seats[x.seat]?.design || null }))} winner={game.winner} center={center} />;

  if (game.phase === 'final' && game.final) {
    const won = game.final.won;
    return (
      <>
        {head}
        {sheetView}
        <Status look={look} pose={won ? 'cheer' : 'stand'} big={me < 0 ? `${game.teams[game.final.winner]} win!` : won ? 'You won! 🎉' : `${game.teams[game.final.winner]} win`} line={`${game.scores[0]} to ${game.scores[1]} after ${game.hand} hands`} />
        <Scores rows={[0, 1].map((t) => ({ name: `${t === game.final.winner ? '🏆 ' : ''}${game.teams[t]}`, score: game.scores[t], color: TEAM_COLORS[t] }))} />
        {endButtons}
      </>
    );
  }

  const cutter = seats[(game.dealer + 1) % seats.length].name;
  let body;
  if (game.phase === 'cut' || game.phase === 'deal') {
    body = <CutDeck key={`cut${game.hand}`} size={game.deckSize} mine={game.phase === 'cut' ? game.myTurn : (game.dealer + 1) % seats.length === me} cutter={cutter} cutAt={game.phase === 'deal' ? game.cutAt : null} left={game.cutLeft} onCut={(at) => act('cut', { at })} />;
  } else if (me < 0) {
    body = <Status look={look} big="👀 Watching" line={game.waiting ? "You'll take a bot's seat at the next deal." : 'All 4 seats are taken. Enjoy the show!'} />;
  } else if (game.phase === 'bid' && game.myTurn) {
    body = (
      <>
        <Status look={look} pose="wave" big="Your bid!" line={game.high ? `To beat: ${bidName(game.high.bid)} by ${seats[game.high.seat].name}` : `Nobody has bid yet. Your partner is ${seats[(me + 2) % 4].name}.`} />
        <BidPicker canBid={game.canBid || []} onBid={(b) => act('bid', { bid: b })} />
      </>
    );
  } else if (game.phase === 'kitty' && game.myTurn) {
    body = (
      <Status
        look={look}
        pose="cheer"
        big={`You won it: ${bidName(contract.bid)}`}
        line={`You picked up the kitty (marked new). Discard ${game.toDiscard}${game.handsOne ? ', then pick one of them to hand your partner' : ''}.`}
      />
    );
  } else if (game.phase === 'pass' && game.myTurn) {
    body = <Status look={look} pose="wave" big="Throw one card away" line={`${seats[contract.seat].name} handed you ${cardName(game.passCard)} (marked). Throw one card on the discard pile${contract.bid === 'OPEN' ? ', like the Joker' : ''}.`} />;
  } else if (game.phase === 'play' && game.myTurn) {
    body = <Status look={look} pose="wave" big="Your turn!" line={trumpText} />;
  } else if (game.phase === 'hand' && game.result) {
    const r = game.result;
    const ours = r.team === us;
    body = (
      <>
        <Status
          look={look}
          pose={r.made === ours ? 'cheer' : 'scared'}
          big={r.made ? `${r.bidder} made ${bidName(r.bid)}${r.slam ? ', all 10!' : '!'}` : `${r.bidder} got set on ${bidName(r.bid)}!`}
          line={r.bid === 'MIS' || r.bid === 'OPEN' ? (r.made ? 'Not a single trick.' : 'Took a trick.') : `Took ${r.took} of 10.`}
        />
        <Scores rows={[0, 1].map((t) => {
          const gain = t === r.team ? r.points : r.oppPoints;
          return { name: game.teams[t], score: game.scores[t], color: TEAM_COLORS[t], change: gain >= 0 ? `+${gain}` : String(gain), bad: gain < 0 };
        })}
        />
      </>
    );
  } else {
    let big = '';
    if (game.phase === 'bid') big = game.passed ? 'You passed' : `${seats[game.turn].name} is bidding…`;
    if (game.phase === 'kitty') big = `${seats[contract.seat].name} is picking up the kitty…`;
    if (game.phase === 'pass') big = `${seats[game.turn].name} got a card from ${seats[contract.seat].name} and is throwing one away…`;
    if (game.phase === 'play') big = seats[me].out ? 'Your partner is playing Nola. You sit this one out.' : `${seats[game.turn].name}'s turn`;
    if (game.phase === 'trick') big = `${seats[game.winner].name} takes it`;
    if (game.phase === 'nobid') big = 'Everyone passed. Redeal!';
    body = big ? <Status look={look} pose={game.phase === 'trick' && game.winner % 2 === us ? 'cheer' : 'stand'} big={big} line={trumpText} /> : null;
  }

  let hand = <Hand trump={game.trump} cards={game.cards} />;
  if (game.phase === 'kitty' && game.myTurn) hand = <Discard cards={game.cards} kitty={game.kitty || []} count={game.toDiscard} handsOne={game.handsOne} onDone={(cards, give) => act('discard', { cards, give })} />;
  if (game.phase === 'pass' && game.myTurn) hand = <PassPick cards={game.cards} got={game.passCard} onPass={(card) => act('pass', { card })} />;
  if (game.phase === 'play' && game.myTurn) {
    const play = (c) => { if (c === 'JK' && game.nameSuit) setJoker(true); else act('play', { card: c }); };
    hand = joker
      ? <NameSuit onPick={(s) => { act('play', { card: 'JK', named: s }); setJoker(false); }} onCancel={() => setJoker(false)} />
      : <Hand trump={game.trump} cards={game.cards} legal={game.legal || []} onPlay={play} />;
  }

  return (
    <>
      {head}
      {sheetView}
      {table}
      {body}
      {me >= 0 && hand}
    </>
  );
}

/** Your own cards use your card design; cards others play show theirs. */
export default function FivePhone(props) {
  const { game } = props;
  const mine = (game.seats[game.seat] || {}).design || 'classic';
  return <DesignContext.Provider value={mine}><FiveTable {...props} /></DesignContext.Provider>;
}
