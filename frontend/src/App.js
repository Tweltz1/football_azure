import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, NavLink } from 'react-router-dom';
import Home from './components/Home';
import Leagues from './components/Leagues';
import DraftRoomEnhanced from './components/DraftRoomEnhanced';
import DraftTvView from './components/DraftTvView';
import CreateLeague from './components/CreateLeague';
import Login from './components/Login';
import ClimbBackdrop from './components/ClimbBackdrop';
import Profile from './components/Profile';
import TestPage from './components/TestPage';
import StartSit from './components/StartSit';
import Rankings from './components/Rankings';
import GamesPage from './games/GamesPage';
import RacePage from './games/race/RacePage';
import { DraftHistoryDetail, DraftHistoryList } from './components/DraftHistory';
import { useAuth, signIn, signOut } from './AuthContext';
import PartyRoutes, { isPartyPath } from './party/PartyRoutes';
import DndRoutes, { isDndPath } from './dnd/DndRoutes';
import { HOOD_GAMES_PATH, homeHref, homeLabel, inGamesApp } from './native/gamesApp';
import './App.css';
import './DraftMobile.css';
import './MobileDensity.css';
import './MobileFlow.css';

// Loaded only when the hub is opened, like the party and Hood Quest pages.
const HoodGamesHub = lazy(() => import('./hood/HoodGamesHub'));
const isHubPath = (path) => (path || '').replace(/\/$/, '') === HOOD_GAMES_PATH;

function App() {
  const { user, loading } = useAuth();

  // Hood Games hub (where the Hood Games app opens) needs no sign-in either.
  if (isHubPath(window.location.pathname)) {
    return (
      <div id="lc-root">
        <Suspense fallback={<div style={{ background: '#120c24', minHeight: '100vh' }} />}>
          <HoodGamesHub />
        </Suspense>
      </div>
    );
  }
  // Party games open without signing in (sign-in there is optional, for saving a character).
  if (isPartyPath(window.location.pathname)) {
    return <PartyRoutes />;
  }
  // Hood Quest (tabletop adventures) also opens without signing in.
  if (isDndPath(window.location.pathname)) {
    return <DndRoutes />;
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <ClimbBackdrop />
        <div className="loading-panel">
          <span className="loading-mark" />
          <p>Loading draft command...</p>
        </div>
      </div>
    );
  }

  // The draft mini-games can be practiced without signing in (from the Hood Games hub, say). In the
  // Hood Games app they always get this slim page, signed in or not, so Back returns to the hub
  // instead of the whole Hood League site.
  const gamesPath = (window.location.pathname || '').replace(/\/$/, '');
  const slimGames = gamesPath === '/games' || (gamesPath === '/games/race' && user && inGamesApp());
  if (slimGames && (!user || inGamesApp())) {
    return (
      <Router>
        <div className="app-shell">
          <nav className="top-nav">
            <a href={homeHref()} className="brand-lockup" aria-label={`${homeLabel()} home`}>
              <span className="brand-mark">{inGamesApp() ? 'HG' : 'HL'}</span>
              <span>
                <strong>{homeLabel()}</strong>
                <small>Draft Games</small>
              </span>
            </a>
            <div className="nav-links" aria-label="Primary navigation">
              <a href={homeHref()}>← Back to {homeLabel()}</a>
              {!user && <button type="button" className="logout-link" onClick={() => signIn('google')}>Sign in</button>}
            </div>
          </nav>
          <main className="app-main">
            <Routes>
              <Route path="/games" element={<GamesPage guest={!user} />} />
              {user && <Route path="/games/race" element={<RacePage />} />}
            </Routes>
          </main>
        </div>
      </Router>
    );
  }

  if (!user) {
    return <Login />;
  }

  const userId = user.userId;

  return (
    <Router>
      <div className="app-shell">
        <nav className="top-nav">
          <Link to="/" className="brand-lockup" aria-label="Hood League home">
            <span className="brand-mark">HL</span>
            <span>
              <strong>Hood League</strong>
              <small>Auction Draft</small>
            </span>
          </Link>

          <div className="nav-links" aria-label="Primary navigation">
            <NavLink to="/" end>Home</NavLink>
            <NavLink to="/leagues">Leagues</NavLink>
            <NavLink to="/create-league">Create</NavLink>
            <NavLink to="/start-sit"><span className="nav-long">Start/Sit &amp; Trades</span><span className="nav-short nav-two-line">Start/Sit &amp; Trade</span></NavLink>
            <NavLink to="/rankings">Rankings</NavLink>
            <NavLink to="/games">Games</NavLink>
            {inGamesApp() && <a href={HOOD_GAMES_PATH}>Hood Games</a>}
            <NavLink to="/history">History</NavLink>
            <NavLink to="/profile">Profile</NavLink>
            <a href="https://talkshops.app/">Test</a>
          </div>

          <div className="nav-user">
            <span>Welcome, {user.userDetails}</span>
            <button type="button" className="logout-link" onClick={signOut}>Logout</button>
          </div>
        </nav>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<Home userId={userId} />} />
            <Route path="/leagues" element={<Leagues userId={userId} />} />
            <Route path="/draft/:leagueId/tv" element={<DraftTvView />} />
            <Route path="/draft/:leagueId" element={<DraftRoomEnhanced userId={userId} />} />
            <Route path="/create-league" element={<CreateLeague userId={userId} />} />
            <Route path="/profile" element={<Profile userId={userId} />} />
            <Route path="/test" element={<TestPage />} />
            <Route path="/start-sit" element={<StartSit userId={userId} />} />
            <Route path="/rankings" element={<Rankings userId={userId} />} />
            <Route path="/games" element={<GamesPage />} />
            <Route path="/games/race" element={<RacePage />} />
            <Route path="/history" element={<DraftHistoryList userId={userId} />} />
            <Route path="/history/:historyId" element={<DraftHistoryDetail userId={userId} />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
