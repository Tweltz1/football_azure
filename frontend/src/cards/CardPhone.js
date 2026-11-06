import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import Person from '../party/Person';
import { isJoker, isRed, isThinCut, rankLabel, suitOf, suitSort, SUIT_SYMBOL } from './cards';
import { backStyle, designClass, designOf, faceStyle } from './designs';

// Phone pieces shared by 500 and Dirty Clubs: a card, your hand, the table (with you at the bottom),
// and a status line. There's no TV for these games: every phone shows the whole table.

/** The card design this phone's own cards use. A card can name another (a card someone else played). */
export const DesignContext = createContext('classic');

export const CardFace = ({ card, small, on, off, onClick, tag, lift, design: named, style, ...rest }) => {
  const mine = useContext(DesignContext);
  const design = named === undefined ? mine : named;
  const joker = isJoker(card);
  const suit = suitOf(card);
  const cls = `lt-card${small ? ' is-small' : ''}${joker ? ' is-joker' : isRed(suit) ? ' is-red' : ''}${on ? ' is-on' : ''}${off ? ' is-off' : ''}${lift ? ' is-lift' : ''}`;
  const face = joker ? (
    <><span className="lt-card-rank">🃏</span><span className="lt-card-suit">JOKER</span></>
  ) : (
    <><span className="lt-card-rank">{rankLabel(card)}</span><span className="lt-card-suit">{SUIT_SYMBOL[suit]}{'︎'}</span></>
  );
  const d = design && design !== 'classic' ? designOf(design) : null;
  const look = d && !on ? { ...faceStyle(d.id), ...style } : style;
  const css = d ? `${cls}${designClass(d.id)}` : cls;
  if (!onClick) return <span className={css} style={look} {...rest}>{face}{tag && <i className="lt-card-tag">{tag}</i>}</span>;
  return <button type="button" className={css} style={look} disabled={off} onClick={onClick} {...rest}>{face}{tag && <i className="lt-card-tag">{tag}</i>}</button>;
};

/** Text with the ♥ and ♦ in red (and every suit symbol drawn as text, not emoji). */
export const suits = (text) => {
  if (typeof text !== 'string' || !/[♠♣♥♦]/.test(text)) return text;
  return text.split(/([♠♣♥♦]\uFE0E?)/).map((part, i) => {
    if (!/^[♠♣♥♦]/.test(part)) return part;
    const sym = `${part[0]}\uFE0E`;
    // eslint-disable-next-line react/no-array-index-key
    return /[♥♦]/.test(part) ? <span key={i} className="lt-red">{sym}</span> : <span key={i}>{sym}</span>;
  });
};

export const cardName = (c) => (isJoker(c) ? 'the Joker' : `${rankLabel(c)}${SUIT_SYMBOL[suitOf(c)]}`);

// Your own order for your hand. It lives outside the component so it survives the hand being redrawn
// between phases; cards you no longer hold drop out, and new ones go on the end.
let savedOrder = [];
const arrange = (order, cards) => order.filter((c) => cards.includes(c)).concat(cards.filter((c) => !order.includes(c)));

/**
 * Your hand. Drag a card to move it, or tap Sort by suit. When it's your turn, tap a card to pick it up
 * and tap it again (or the button) to play it. legal: the cards you may play, or null when it isn't your turn.
 */
export const Hand = ({ cards, legal, onPlay, trump = null, fresh = [] }) => {
  const [picked, setPicked] = useState(null);
  const [order, setOrderState] = useState(savedOrder);
  const [dragging, setDragging] = useState(null);
  const drag = useRef(null);
  const key = (cards || []).join(',');
  const legalKey = legal ? legal.join(',') : '';
  useEffect(() => { setPicked(null); }, [key, legalKey]);
  const shown = arrange(order, cards || []);
  const setOrder = (next) => { savedOrder = next; setOrderState(next); };

  useEffect(() => {
    if (!dragging) return undefined;
    const move = (e) => {
      const d = drag.current;
      if (!d) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const over = el && el.closest ? el.closest('[data-card]') : null;
      const target = over && over.getAttribute('data-card');
      if (!target || target === d.card) return;
      const to = d.cards.indexOf(target);
      if (to < 0) return;
      const list = d.cards.filter((c) => c !== d.card);
      list.splice(to, 0, d.card);
      d.cards = list;
      setOrder(list);
    };
    const up = () => { drag.current = null; setDragging(null); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging]);

  if (!cards || !cards.length) return null;
  const down = (e, c) => {
    if (e.button && e.button !== 0) return;
    drag.current = { card: c, x: e.clientX, y: e.clientY, cards: shown, moved: false };
    const start = drag.current;
    const watch = (ev) => {
      if (drag.current !== start) { window.removeEventListener('pointermove', watch); return; }
      if (Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) > 10) {
        start.moved = true;
        window.removeEventListener('pointermove', watch);
        setPicked(null);
        setDragging(c);
      }
    };
    const stop = () => {
      window.removeEventListener('pointermove', watch);
      window.removeEventListener('pointerup', stop);
      if (start.moved) { start.justDragged = true; setTimeout(() => { start.justDragged = false; }, 0); }
      if (drag.current === start && !start.moved) drag.current = null;
      drag.last = start;
    };
    window.addEventListener('pointermove', watch);
    window.addEventListener('pointerup', stop);
  };
  const tap = (c) => {
    if (!legal || (drag.last && drag.last.justDragged)) return;
    if (picked === c) { onPlay(c); setPicked(null); } else setPicked(c);
  };
  return (
    <div className="lt-handbox">
      <div className="lt-hand-tools">
        <small>Drag cards to arrange them</small>
        <button type="button" className="lt-mini-btn" onClick={() => setOrder(suitSort(shown, trump))}>Sort by suit</button>
      </div>
      <div className={`lt-hand is-arrange${dragging ? ' is-dragging' : ''}`}>
        {shown.map((c) => {
          const ok = legal ? legal.includes(c) : false;
          return (
            <CardFace
              key={c}
              card={c}
              data-card={c}
              on={picked === c}
              lift={dragging === c}
              off={legal ? !ok : false}
              onClick={ok ? () => tap(c) : undefined}
              onPointerDown={(e) => down(e, c)}
              tag={fresh.includes(c) ? 'new' : null}
            />
          );
        })}
      </div>
      {legal && (
        <button type="button" className="lc-btn lc-btn-big" disabled={!picked} onClick={() => { onPlay(picked); setPicked(null); }}>
          {picked ? suits(`Play ${cardName(picked)}`) : 'Tap a card, then tap it again'}
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
      {center && <div className="lt-center">{suits(center)}</div>}
      {plays.map((p) => (
        <div key={p.card} className={`lt-played${winner === p.seat ? ' is-win' : ''}`} style={at(p.seat, 17, 19)}>
          <CardFace card={p.card} small design={p.design || null} />
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
          {s.won > 0 && (
            <span className="lt-tricks" aria-label={`${s.won} trick${s.won === 1 ? '' : 's'} won`}>
              {Array.from({ length: Math.min(s.won, 13) }, (_, k) => <i key={k} className={designClass(s.design || 'classic')} style={backStyle(s.design || 'classic')} />)}
            </span>
          )}
          {s.bubble && <span className={`lt-bubble${s.hot ? ' is-hot' : ''}`}>{suits(s.bubble)}</span>}
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
      <p className="lt-status-big">{suits(big)}</p>
      {line && <p className="lt-status-line">{suits(line)}</p>}
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

/**
 * The score sheet: the totals now, then every hand (newest first) and how its points were given.
 * totals: Scores rows. hands: [{ key, title, note, lines: [{ name, color, change, bad, why, score }] }].
 */
export const ScoreSheet = ({ totals, hands, rule, onClose }) => (
  <div className="lt-sheet" role="dialog" aria-label="Score sheet" onClick={onClose}>
    <div className="lt-sheet-box" onClick={(e) => e.stopPropagation()}>
      <div className="lt-sheet-top">
        <b>📋 Score sheet</b>
        <button type="button" className="lt-sheet-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <Scores rows={totals} />
      {rule && <p className="lt-sheet-empty">{rule}</p>}
      {!hands.length && <p className="lt-sheet-empty">No hands scored yet. Points show up here after each hand.</p>}
      {hands.map((h) => (
        <div key={h.key} className="lt-sheet-hand">
          <p className="lt-sheet-title">{suits(h.title)}</p>
          {h.note && <p className="lt-sheet-note">{suits(h.note)}</p>}
          {h.lines.map((l) => (
            <div key={l.name} className="lt-sheet-line" style={{ borderColor: l.color }}>
              <span>{l.name}</span>
              {l.why && <small>{suits(l.why)}</small>}
              <b className={l.bad ? 'is-down' : ''}>{l.change}</b>
              <span className="lt-total">{l.score}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
);

/** The header button that opens the score sheet. */
export const SheetButton = ({ onClick }) => (
  <button type="button" className="lt-sheet-btn" onClick={onClick}>📋 Scores</button>
);

const pile = (n, bs) => Array.from({ length: Math.min(6, Math.max(2, Math.round(n / 7))) }, (_, i) => <i key={i} style={{ ...bs, transform: `translate(${-i * 1.5}px, ${-i * 2}px)` }} />);

/**
 * Cutting the deck. The cutter drags along the spread deck (or the slider) to pick a spot, then cuts.
 * Everyone else watches the deck, and once it's cut every phone plays the two halves swapping.
 * size: cards in the deck. mine: it's your cut. cutter: their name. cutAt: where it was cut (after the cut).
 */
export const CutDeck = ({ size, mine, cutter, cutAt, left, onCut }) => {
  const bs = backStyle(useContext(DesignContext)) || {};
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
          <div className="lt-pile is-top"><span className="lt-pile-stack">{pile(cutAt, bs)}</span><b>{cutAt}</b></div>
          <div className="lt-pile is-bottom"><span className="lt-pile-stack">{pile(bottom, bs)}</span><b>{bottom}</b></div>
          {[0, 1, 2, 3].map((k) => <i key={k} className={`lt-fly is-${k}`} style={bs} />)}
        </div>
        <p className="lt-status-line">{`${mine ? 'You' : cutter} cut ${cutAt} card${cutAt === 1 ? '' : 's'}${thin ? '. Thin to win!' : '.'} Dealing…`}</p>
      </div>
    );
  }
  if (!mine) {
    return (
      <div className="lt-cut">
        <div className="lt-cut-stage"><div className="lt-pile is-wait"><span className="lt-pile-stack">{pile(size, bs)}</span></div></div>
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
          <i key={i} className={i < at ? 'is-lift' : ''} style={{ ...bs, left: `calc(${(i / (size - 1)) * 100}% - ${(i / (size - 1)) * 34}px)` }} />
        ))}
      </div>
      <input type="range" className="lt-cut-range" min={min} max={max} value={at} aria-label="Where to cut" onChange={(e) => setAt(Number(e.target.value))} />
      <p className="lt-status-line">{isThinCut(at, size) && <b className="lt-thin-hint">Thin to win! </b>}Take <b>{at}</b> off the top and put them under the other <b>{size - at}</b>.{left ? ` (${left}s)` : ''}</p>
      <button type="button" className="lc-btn lc-btn-big" disabled={sent} onClick={() => { setSent(true); onCut(at); }}>✂️ Cut here</button>
    </div>
  );
};
