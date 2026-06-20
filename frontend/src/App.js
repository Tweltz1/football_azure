import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Home from './components/Home';
import Leagues from './components/Leagues';
import DraftRoomEnhanced from './components/DraftRoomEnhanced';
import CreateLeague from './components/CreateLeague';
import Login from './components/Login';
import Profile from './components/Profile';
import { useAuth } from './AuthContext';
import './App.css';
import './DraftMobile.css';
import './MobileDensity.css';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
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
            <Link to="/">Home</Link>
            <Link to="/leagues">Leagues</Link>
            <Link to="/create-league">Create</Link>
            <Link to="/profile">Profile</Link>
          </div>

          <div className="nav-user">
            <span>Welcome, {user.userDetails}</span>
            <a href="/.auth/logout" className="logout-link">Logout</a>
          </div>
        </nav>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<Home userId={userId} />} />
            <Route path="/leagues" element={<Leagues userId={userId} />} />
            <Route path="/draft/:leagueId" element={<DraftRoomEnhanced userId={userId} />} />
            <Route path="/create-league" element={<CreateLeague userId={userId} />} />
            <Route path="/profile" element={<Profile userId={userId} />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
