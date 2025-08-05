import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Home from './components/Home';
import Leagues from './components/Leagues';
import LeagueDetails from './components/LeagueDetails';
import DraftScreen from './components/DraftScreen';
import CreateLeague from './components/CreateLeague';
import Login from './components/Login';
import { useAuth } from './AuthContext';
import './App.css';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading authentication...</div>;
  }

  // If user is not logged in, only show the Login component
  if (!user) {
    return <Login />;
  }

  const userId = user.userId;

  return (
    <Router>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/leagues">My Leagues</Link>
        <Link to="/create-league">Create a League</Link>
        <a href="/.auth/logout">Logout</a>
        <span>Welcome, {user.userDetails}!</span>
      </nav>
      <Routes>
        <Route path="/" element={<Home userId={userId} />} />
        <Route path="/leagues" element={<Leagues userId={userId} />} />
        <Route path="/leagues/:leagueId" element={<LeagueDetails userId={userId} />} />
        <Route path="/draft/:leagueId" element={<DraftScreen userId={userId} />} />
        <Route path="/create-league" element={<CreateLeague userId={userId} />} />
      </Routes>
    </Router>
  );
}

export default App;