import React, { useEffect, useState } from 'react';
import Person from '../party/Person';
import { isJoker, isRed, isThinCut, rankLabel, suitOf, SUIT_SYMBOL } from './cards';

// Phone pieces shared by 500 and Dirty Clubs: a card, your hand, the table (with you at the bottom),
// and a status line. There's no TV for these games: every phone shows the whole table.

export const CardFace = ({ card, small, on, off, onClick, tag }) => {
  const joker = isJoker(card);
  const suit = suitOf(card);
  const cls = `lt-card${small ? ' is-small' : ''}${joker ? ' is-joker' : isRed(suit) ? ' is-red' : ''}${on ? ' is-on' : ''}${off ? ' is-off' : ''}`;
  const face = joker ? (
    <><span className="lt-card-rank">🃏</span><span className="lt-card-suit">JOKER</span></>
  ) : (
    <><span className="lt-card-rank">{rankLabel(card)}</span><span className="lt-card-suit">{SUIT_SYMBOL[suit]}{'︎'}</span></>
  );
  if (!onClick) return <span className={cls}>{face}{tag && <i className="lt-card-tag">{tag}</i>}</span>;
  return <button type="button" className={cls} disabled={off} onClick={onClick}>{face}{tag && <i className="lt-card-tag">{tag}</i>}</button>;
};

export const cardName = (c) => (isJoker(c) ? 'the Joker' : `${rankLabel(c)}${SUIT_SYMBOL[suitOf(c)]}`);

/**
 * Your hand. When it's your turn to play, tap a card to pick it up and tap it again (or the button) to play it.
 * legal: the cards you may play, or null when it isn't your turn.
 */
export const Hand = ({ cards, legal, onPlay, fresh = [] }) => {
  const [picked, setPicked] = useState(null);
  const key = (cards || []).join(',');
  const legalKey = legal ? legal.join(',') : '';
  useEffect(() => { setPicked(null); }, [key, legalKey]);
  if (!cards || !cards.length) return null;
  const tap = (c) => {
    if (!legal) return;
    if (picked === c) { onPlay(c); setPicked(null); } else setPicked(c);
  };
  return (
    <div className="lt-handbox">
      <div className="lt-hand">
        {cards.map((c) => (
          <CardFace
            key={c}
            card={c}
            on={picked === c}
            off={legal ? !legal.includes(c) : false}
            onClick={legal ? () => tap(c) : undefined}
            tag={fresh.includes(c) ? 'new' : null}
          />
        ))}
      </div>
      {legal && (
        <button type="button" className="lc-btn lc-btn-big" disabled={!picked} onClick={() => { onPlay(picked); setPicked(null); }}>
          {picked ? `Play ${cardName(picked)}` : 'Tap a card, then tap it again'}
        </button>
      )}
    </div>
  );
};

/**
 * The table, turned so you sit at the bottom. seats: [{ name, line, turn, dim, color, dealer, bubble, hot }].
 * plays: the trick so far [{ seat, card }]. winner: who's taking it. center: what to show in the middle.
 */
export const TableView = ({ seats, me, plays = [], winner = null, center = null }) => {
  const n = seats.length;
  const base = me >= 0 ? me : 0;
  const at = (seat, rx, ry) => {
    const rel = (seat - base + n) % n;
    const a = Math.PI / 2 + (rel * 2 * Math.PI) / n;
    return { left: `${50 + Math.cos(a) * rx}%`, top: `${50 + Math.sin(a) * ry}%` };
  };
  return (
    <div className="lt-table">
      <div className="lt-felt" />
      {center && <div className="lt-center">{center}</div>}
      {plays.map((p) => (
        <div key={p.card} className={`lt-played${winner === p.seat ? ' is-win' : ''}`} style={at(p.seat, 17, 19)}>
          <CardFace card={p.card} small />
        </div>
      ))}
      {seats.map((s, i) => (
        <div
          key={i}
          className={`lt-seat${s.turn ? ' is-turn' : ''}${s.dim ? ' is-dim' : ''}${i === me ? ' is-me' : ''}`}
          style={{ ...at(i, 38, 41), borderColor: s.color || undefined }}
        >
          <b>{i === me ? `${s.name} (you)` : s.name}{s.dealer ? <i className="lt-dealer">D</i> : null}</b>
          {s.line && <small>{s.line}</small>}
          {s.bubble && <span className={`lt-bubble${s.hot ? ' is-hot' : ''}`}>{s.bubble}</span>}
        </div>
      ))}
    </div>
  );
};

/** A status line with your character's head. */
export const Status = ({ look, pose = 'stand', big, line, children }) => (
  <div className="lt-status">
    <Person look={look} pose={pose} view="head" />
    <div>
      <p className="lt-status-big">{big}</p>
      {line && <p className="lt-status-line">{line}</p>}
      {children}
    </div>
  </div>
);

/** A small scoreboard: rows of { name, score, color, note }. */
export const Scores = ({ rows, title }) => (
  <div className="lt-scores">
    {title && <p className="lt-scores-title">{title}</p>}
    {rows.map((r) => (
      <div key={r.name} className="lt-score-row" style={{ borderColor: r.color }}>
        <span>{r.name}</span>
        {r.note && <small>{r.note}</small>}
        {r.change != null && <b className={r.bad ? 'is-down' : ''}>{r.change}</b>}
        <span className="lt-total">{r.score}</span>
      </div>
    ))}
  </div>
);

const pile = (n) => Array.from({ length: Math.min(6, Math.max(2, Math.round(n / 7))) }, (_, i) => <i key={i} style={{ transform: `translate(${-i * 1.5}px, ${-i * 2}px)` }} />);

/**
 * Cutting the deck. The cutter drags along the spread deck (or the slider) to pick a spot, then cuts.
 * Everyone else watches the deck, and once it's cut every phone plays the two halves swapping.
 * size: cards in the deck. mine: it's your cut. cutter: their name. cutAt: where it was cut (after the cut).
 */
export const CutDeck = ({ size, mine, cutter, cutAt, left, onCut }) => {
  const [at, setAt] = useState(Math.round(size / 2));
  const [sent, setSent] = useState(false);
  const min = 1;
  const max = size - 1;
  if (cutAt != null) {
    const bottom = size - cutAt;
    const thin = isThinCut(cutAt, size);
    return (
      <div className={`lt-cut is-done${thin ? ' is-thin' : ''}`}>
        {thin && (
          <div className="lt-thin" aria-live="polite">
            <b>THIN TO WIN!</b>
            {['✨', '🔥', '✨', '💸', '✨', '🔥'].map((x, k) => <i key={k} className={`is-${k}`}>{x}</i>)}
          </div>
        )}
        <div className="lt-cut-stage">
          <div className="lt-pile is-top"><span className="lt-pile-stack">{pile(cutAt)}</span><b>{cutAt}</b></div>
          <div className="lt-pile is-bottom"><span className="lt-pile-stack">{pile(bottom)}</span><b>{bottom}</b></div>
          {[0, 1, 2, 3].map((k) => <i key={k} className={`lt-fly is-${k}`} />)}
        </div>
        <p className="lt-status-line">{`${mine ? 'You' : cutter} cut ${cutAt} card${cutAt === 1 ? '' : 's'}${thin ? '. Thin to win!' : '.'} Dealing…`}</p>
      </div>
    );
  }
  if (!mine) {
    return (
      <div className="lt-cut">
        <div className="lt-cut-stage"><div className="lt-pile is-wait"><span className="lt-pile-stack">{pile(size)}</span></div></div>
        <p className="lt-status-line">{cutter} is cutting the deck…</p>
      </div>
    );
  }
  const pickFrom = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    setAt(Math.max(min, Math.min(max, Math.round((x / r.width) * size))));
  };
  return (
    <div className="lt-cut">
      <div
        className="lt-spread"
        role="presentation"
        onClick={pickFrom}
        onTouchStart={pickFrom}
        onTouchMove={pickFrom}
        onMouseMove={(e) => { if (e.buttons) pickFrom(e); }}
      >
        {Array.from({ length: size }, (_, i) => (
          <i key={i} className={i < at ? 'is-lift' : ''} style={{ left: `calc(${(i / (size - 1)) * 100}% - ${(i / (size - 1)) * 34}px)` }} />
        ))}
      </div>
      <input type="range" className="lt-cut-range" min={min} max={max} value={at} aria-label="Where to cut" onChange={(e) => setAt(Number(e.target.value))} />
      <p className="lt-status-line">{isThinCut(at, size) && <b className="lt-thin-hint">Thin to win! </b>}Take <b>{at}</b> off the top and put them under the other <b>{size - at}</b>.{left ? ` (${left}s)` : ''}</p>
      <button type="button" className="lc-btn lc-btn-big" disabled={sent} onClick={() => { setSent(true); onCut(at); }}>✂️ Cut here</button>
    </div>
  );
};
