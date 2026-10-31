import React, { Suspense, lazy } from 'react';

// Loaded only when a party page is opened, so the draft site doesn't carry the game.
const PartyHost = lazy(() => import('./PartyHost'));
const PartyPlay = lazy(() => import('./PartyPlay'));
const PartyHome = lazy(() => import('./PartyHome'));

export const isPartyPath = (path) => /^\/(party|play|games-night)\/?$/.test(path || '');

export default function PartyRoutes() {
  const path = window.location.pathname.replace(/\/$/, '');
  const Page = path === '/party' ? PartyHost : path === '/play' ? PartyPlay : PartyHome;
  return (
    <div id="lc-root">
      <Suspense fallback={<div style={{ background: '#120c24', minHeight: '100vh' }} />}>
        <Page />
      </Suspense>
    </div>
  );
}
