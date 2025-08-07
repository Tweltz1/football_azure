import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { initialPlayerList } from '../data/playerData';

const Home = () => {
  const { user, loading } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortPosition, setSortPosition] = useState('All Positions');
  const navigate = useNavigate();

  // --- Card Styles ---
  // I'm defining the styles here to keep the JSX clean.
  // You could also move these to your App.css file.
  const dashboardStyle = {
    display: 'flex',
    justifyContent: 'center',
    gap: '30px',
    marginTop: '40px',
    flexWrap: 'wrap'
  };

  const cardStyle = {
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '20px',
    width: '300px',
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between'
  };

  const cardButtonStyle = {
    padding: '10px 20px',
    fontSize: '16px',
    cursor: 'pointer',
    border: 'none',
    borderRadius: '5px',
    backgroundColor: '#007bff',
    color: 'white',
    marginTop: '15px'
  };
  // --- End Styles ---

  if (loading) {
    return <div>Loading user data...</div>;
  }

  const filteredPlayers = initialPlayerList
    .filter(player => 
      player.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .filter(player =>
      sortPosition === 'All Positions' || player.position === sortPosition
    );
  
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>Welcome, {user.userDetails}!</h1>
      <p>Your fantasy football auction draft hub. What would you like to do?</p>

      {/* --- New Dashboard Section --- */}
      <div style={dashboardStyle}>
        <div style={cardStyle}>
          <div>
            <h2>My Leagues</h2>
            <p>View all your active leagues, manage your teams, and enter your draft rooms.</p>
          </div>
          <button style={cardButtonStyle} onClick={() => navigate('/leagues')}>
            Go to My Leagues
          </button>
        </div>

        <div style={cardStyle}>
          <div>
            <h2>Create a League</h2>
            <p>Start a new league as the commissioner. Customize settings and invite friends to join.</p>
          </div>
          <button style={cardButtonStyle} onClick={() => navigate('/create-league')}>
            Create a New League
          </button>
        </div>

        <div style={cardStyle}>
          <div>
            <h2>My Profile</h2>
            <p>Manage your global player preferences. This master list will be used as a template for new leagues you create.</p>
          </div>
          <button style={cardButtonStyle} onClick={() => navigate('/profile')}>
            Go to My Profile
          </button>
        </div>
      </div>
      {/* --- End Dashboard Section --- */}


      <div style={{ marginTop: '50px' }}>
        <h2>Global Player Pool</h2>
        {/* Search and filter controls remain the same */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span>Sort by Position:</span>
            <select onChange={(e) => setSortPosition(e.target.value)}>
              <option>All Positions</option>
              <option>WR</option><option>RB</option><option>TE</option>
              <option>QB</option><option>K</option><option>DEF</option>
            </select>
          </div>
          <input
            type="text"
            placeholder="Search for a player..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: '8px' }}
          />
        </div>
        
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 auto', maxWidth: '600px' }}>
          {filteredPlayers.map((player) => (
            <li 
              key={player.id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                padding: '10px', border: '1px solid #ddd', marginBottom: '5px'
              }}
            >
              <span>{player.name} ({player.position}) - {player.team} - Rank: {player.rank}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Home;