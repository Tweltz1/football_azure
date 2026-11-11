import React from 'react';
import './StudioCredit.css';

// Shared "Powered by Weltzcraft Studios" line shown at the bottom of each app.
// STUDIO_URL is the studio site; clear it to show the name as plain text.
export const STUDIO_NAME = 'Weltzcraft Studios';
export const STUDIO_URL = 'https://weltzcraft.com';

export default function StudioCredit({ className = '' }) {
  return (
    <p className={`studio-credit ${className}`.trim()}>
      Powered by{' '}
      {STUDIO_URL ? (
        <a href={STUDIO_URL} target="_blank" rel="noopener noreferrer">{STUDIO_NAME}</a>
      ) : (
        <span>{STUDIO_NAME}</span>
      )}
    </p>
  );
}
