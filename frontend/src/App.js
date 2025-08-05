import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Home from './components/Home';
import Leagues from './components/Leagues';
import LeagueDetails from './components/LeagueDetails';
import DraftScreen from './components/DraftScreen';
import CreateLeague from './components/CreateLeague';
import { useAuth } from './AuthContext';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading authentication...</div>;
  }

  const userId = user?.userId || "guest";

  return (
    <Router>
      <nav>
        <Link to="/">Home</Link>
        {user && <Link to="/leagues">My Leagues</Link>}
        {!user && <a href="/.auth/login/github">Login with GitHub</a>}
        {!user && <a href="/.auth/login/google">Login with Google</a>}
        {user && <a href="/.auth/logout">Logout</a>}
        {user && <span>Welcome, {user.userDetails}!</span>}
      </nav>
      <Routes>
        <Route path="/" element={<Home userId={userId} />} />
        {user && <Route path="/leagues" element={<Leagues userId={userId} />} />}
        {user && <Route path="/leagues/:leagueId" element={<LeagueDetails userId={userId} />} />}
        {user && <Route path="/draft/:leagueId" element={<DraftScreen userId={userId} />} />}
        {user && <Route path="/create-league" element={<CreateLeague userId={userId} />} />}
      </Routes>
    </Router>
  );
}

export default App;