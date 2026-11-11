import React, { Suspense, lazy } from 'react';

// Loaded only when a Hood Quest page is opened, so the draft site doesn't carry the board.
const DndHost = lazy(() => import('./DndHost'));
const DndPlay = lazy(() => import('./DndPlay'));
const DndHome = lazy(() => import('./DndHome'));
const DndWatch = lazy(() => import('./DndWatch'));

export const isDndPath = (path) => /^\/dnd(\/(tv|play|watch))?\/?$/.test(path || '');

export default function DndRoutes() {
  const path = window.location.pathname.replace(/\/$/, '');
  const Page = path === '/dnd/tv' ? DndHost : path === '/dnd/play' ? DndPlay : path === '/dnd/watch' ? DndWatch : DndHome;
  return (
    <div id="lc-root">
      <Suspense fallback={<div style={{ background: '#0d0a14', minHeight: '100vh' }} />}>
        <Page />
      </Suspense>
    </div>
  );
}
