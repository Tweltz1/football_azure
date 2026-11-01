import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, NavLink } from 'react-router-dom';
import Home from './components/Home';
import Leagues from './components/Leagues';
import DraftRoomEnhanced from './components/DraftRoomEnhanced';
import DraftTvView from './components/DraftTvView';
import CreateLeague from './components/CreateLeague';
import Login from './components/Login';
import ClimbBackdrop from './components/ClimbBackdrop';
import Profile from './components/Profile';
import StartSit from './components/StartSit';
import Rankings from './components/Rankings';
import GamesPage from './games/GamesPage';
import RacePage from './games/race/RacePage';
import { DraftHistoryDetail, DraftHistoryList } from './components/DraftHistory';
import { useAuth, signOut } from './AuthContext';
import PartyRoutes, { isPartyPath } from './party/PartyRoutes';
import './App.css';
import './DraftMobile.css';
import './MobileDensity.css';
import './MobileFlow.css';

function App() {
  const { user, loading } = useAuth();

  // Party games open without signing in (sign-in there is optional, for saving a character).
  if (isPartyPath(window.location.pathname)) {
    return <PartyRoutes />;
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
            <NavLink to="/history">History</NavLink>
            <NavLink to="/profile">Profile</NavLink>
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
