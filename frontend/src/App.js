import './App.css';
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Home from './components/Home';
import Leagues from './components/Leagues';
import LeagueDetails from './components/LeagueDetails';
import DraftScreen from './components/DraftScreen'; // Corrected path
import CreateLeague from './components/CreateLeague';

function App() {
  const userId = "testUser123";

  return (
    <Router>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/leagues">My Leagues</Link>
        <Link to="/create-league">Create a League</Link>
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