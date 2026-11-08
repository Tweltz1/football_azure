import React, { Suspense, lazy } from 'react';
import { inJunkApp } from './device';

// The Junk App is iPhone-only for now: its pages ship inside the app (ios-junk-app/) and stay hidden on
// the public website. Local development (npm start) can still open /junk to work on them.
const JunkApp = lazy(() => import('./JunkApp'));

const enabled = () => inJunkApp() || process.env.NODE_ENV === 'development';

export const isJunkPath = (path) => enabled() && /^\/junk(\/|$)/.test(path || '');

export default function JunkRoutes() {
  return (
    <Suspense fallback={<div className="jk-boot" style={{ background: '#f5f3ee', minHeight: '100vh' }} />}>
      <JunkApp />
    </Suspense>
  );
}
