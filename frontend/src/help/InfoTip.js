import React, { useState } from 'react';
import './InfoTip.css';

let nextId = 0;

/** Small "?" button that opens a plain-words explanation right below it. */
const InfoTip = ({ label, children }) => {
  const [open, setOpen] = useState(false);
  const [id] = useState(() => `info-tip-${(nextId += 1)}`);
  return (
    <span className="info-tip">
      <button
        type="button"
        className={`info-tip-button${open ? ' is-open' : ''}`}
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        ?
      </button>
      {open && (
        <span className="info-tip-panel" id={id} role="note">
          {children}
          <button type="button" className="info-tip-close" onClick={() => setOpen(false)}>Got it</button>
        </span>
      )}
    </span>
  );
};

/** Section heading with a "?" next to it. */
export const KickerWithTip = ({ title, children }) => (
  <div className="kicker-with-tip">
    <p className="section-kicker">{title}</p>
    <InfoTip label={title}>{children}</InfoTip>
  </div>
);

export default InfoTip;
