import React from 'react';
import { BIDDING_STYLES, normalizeBiddingMode } from './biddingStyle';

/** "Bidding style" picker for Create League and the league settings modal. */
const BiddingStyleField = ({ value, onChange }) => {
  const current = normalizeBiddingMode(value);
  const blurb = BIDDING_STYLES.find((style) => style.value === current)?.blurb;
  return (
    <>
      <p className="section-kicker">Bidding style</p>
      <div className="button-group bidding-style-group" role="group" aria-label="Bidding style">
        {BIDDING_STYLES.map((style) => (
          <button
            key={style.value}
            type="button"
            aria-pressed={current === style.value}
            className={current === style.value ? 'create-button' : 'edit-roster-button'}
            onClick={() => onChange(style.value)}
          >
            {style.label}
          </button>
        ))}
      </div>
      <p className="bidding-style-blurb">{blurb}</p>
    </>
  );
};

export default BiddingStyleField;
