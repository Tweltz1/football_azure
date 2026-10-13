import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import './WhyButton.css';

const GAP = 8;
const EDGE = 12;
const isPhone = () => window.matchMedia && window.matchMedia('(max-width: 640px)').matches;

/** The two-column factor table: which player each piece of evidence favors. */
const Factors = ({ names, factors }) => (
  <div className="why-grid" role="table">
    <div className="why-row why-row-head" role="row">
      <span role="columnheader" />
      <span role="columnheader" className="why-name start">{names[0]}</span>
      <span role="columnheader" className="why-name">{names[1]}</span>
    </div>
    {factors.map((factor) => (
      <div className="why-row" role="row" key={factor.key}>
        <span role="rowheader" className="why-label">{factor.label}</span>
        {['start', 'sit'].map((side, index) => (
          <span role="cell" key={side} className={`why-cell ${factor.edge === side ? 'win' : ''} ${factor.edge === `${side}Lose` ? 'lose' : ''}`}>
            <span className="why-value">{factor[side]}</span>
            {factor.detail?.[index] && <small>{factor.detail[index]}</small>}
          </span>
        ))}
      </div>
    ))}
  </div>
);

/**
 * A small "?" next to a Start/Sit call. Tapping it opens a card explaining the call;
 * `explain` is only run then, so the page doesn't do the work for every row up front.
 */
const WhyButton = ({ explain, label = 'Why?', updatedLabel = null }) => {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState(null);
  const [style, setStyle] = useState({ visibility: 'hidden' });
  const [phone, setPhone] = useState(false);
  const buttonRef = useRef(null);
  const popRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  const toggle = (event) => {
    event.stopPropagation();
    if (open) {
      close();
      return;
    }
    setWhy(explain());
    setPhone(isPhone());
    setStyle({ visibility: 'hidden' });
    setOpen(true);
  };

  const place = useCallback(() => {
    if (!buttonRef.current || !popRef.current || isPhone()) {
      setStyle({});
      return;
    }
    const button = buttonRef.current.getBoundingClientRect();
    const pop = popRef.current.getBoundingClientRect();
    const width = pop.width;
    const left = Math.min(Math.max(button.left + button.width / 2 - width / 2, EDGE), window.innerWidth - width - EDGE);
    const below = button.bottom + GAP;
    const fitsBelow = below + pop.height <= window.innerHeight - EDGE;
    const top = fitsBelow ? below : Math.max(EDGE, button.top - GAP - pop.height);
    const arrow = Math.min(Math.max(button.left + button.width / 2 - left, 16), width - 16);
    setStyle({ top, left, '--why-arrow': `${arrow}px` });
    popRef.current.dataset.side = fitsBelow ? 'below' : 'above';
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, why]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    };
    const onPointer = (event) => {
      if (popRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      close();
    };
    const onScroll = () => (isPhone() ? null : place());
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer, { passive: true });
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    popRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close, place]);

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className={`why-btn ${open ? 'open' : ''}`}
        aria-label={label}
        aria-expanded={open}
        title={label}
        onClick={toggle}
      >
        ?
      </button>
      {open && why && ReactDOM.createPortal(
        <>
          {phone && <div className="why-backdrop" onClick={close} />}
          <div
            ref={popRef}
            className={`why-pop ${phone ? 'sheet' : ''}`}
            style={style}
            role="dialog"
            aria-label={why.headline}
            tabIndex={-1}
          >
            <div className="why-top">
              <span className={`why-call ${why.call.key}`}>{why.call.label}</span>
              <button type="button" className="why-close" aria-label="Close" onClick={close}>×</button>
            </div>
            <h4 className="why-headline">{why.headline}</h4>
            <p className="why-summary">{why.summary}</p>
            {why.factors.length > 0 && why.names[1] && <Factors names={why.names} factors={why.factors} />}
            {why.watch && <p className="why-watch"><span aria-hidden="true">!</span>{why.watch}</p>}
            {why.waivers && (
              <div className="why-waivers">
                <p className="why-waivers-title">Possible waiver pickups</p>
                <ul>
                  {why.waivers.players.map((p) => (
                    <li key={p.id}>
                      <span className="why-waiver-name">
                        {p.name} <small>{p.position} · {p.team}</small>
                        {p.detail && <small className="why-waiver-detail">{p.detail}</small>}
                      </span>
                      <span className="why-waiver-pts">
                        {p.points.toFixed(1)}
                        <small>+{p.gain.toFixed(1)}</small>
                      </span>
                    </li>
                  ))}
                </ul>
                {why.waivers.note && <p className="why-waivers-note">{why.waivers.note}</p>}
              </div>
            )}
            <p className="why-foot">Based on Sleeper projections, this season's games and the injury report{updatedLabel ? `, ${updatedLabel}` : ''}.</p>
          </div>
        </>,
        document.body,
      )}
    </>
  );
};

export default WhyButton;
