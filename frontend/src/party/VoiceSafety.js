import React from 'react';

export const REPORT_EMAIL = 'hoodgames@weltzcraft.com';

/** mailto link for reporting someone at a table. Reports go to a person who reads them within a day. */
export const reportHref = (who, where) => `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(`Report a player: ${who}`)}`
  + `&body=${encodeURIComponent(`Player name: ${who}\nRoom or table code: ${where || ''}\nWhat happened:\n`)}`;

/**
 * Per-person controls for voice and video chat: mute someone just for you, and report them.
 * people: [{ cid, name }], silenced: [cid], onToggle(cid).
 */
export default function VoiceSafety({ people, silenced, onToggle, code, className = 'vs' }) {
  if (!people.length) return null;
  return (
    <div className={className}>
      {people.map((p) => {
        const off = silenced.includes(p.cid);
        return (
          <span key={p.cid} className="vs-person">
            <b>{p.name}</b>
            <button type="button" className="vs-btn" onClick={() => onToggle(p.cid)} aria-label={off ? `Unmute ${p.name} for me` : `Mute ${p.name} for me`}>
              {off ? '🔈 Unmute' : '🔇 Mute'}
            </button>
            <a className="vs-btn" href={reportHref(p.name, code)}>⚑ Report</a>
          </span>
        );
      })}
    </div>
  );
}

/** Small hook-free helper: toggles a cid in a list. */
export const toggleIn = (list, cid) => (list.includes(cid) ? list.filter((c) => c !== cid) : [...list, cid]);
